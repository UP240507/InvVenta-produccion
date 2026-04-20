// src/services/thermalPrinter.js
const ESC = 0x1B;
const GS  = 0x1D;
const CMD = {
    INIT:          [ESC, 0x40],
    CUT_PARTIAL:   [GS,  0x56, 0x01],
    ALIGN_LEFT:    [ESC, 0x61, 0x00],
    ALIGN_CENTER:  [ESC, 0x61, 0x01],
    ALIGN_RIGHT:   [ESC, 0x61, 0x02],
    BOLD_ON:       [ESC, 0x45, 0x01],
    BOLD_OFF:      [ESC, 0x45, 0x00],
    DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
    NORMAL_SIZE:   [ESC, 0x21, 0x00],
    LINE_FEED:     [0x0A],
    CODEPAGE_1252: [ESC, 0x74, 0x10],
};

const CP1252_EXTRA = {
    '\u20AC':0x80,'\u201A':0x82,'\u0192':0x83,'\u201E':0x84,'\u2026':0x85,
    '\u2020':0x86,'\u2021':0x87,'\u02C6':0x88,'\u2030':0x89,'\u0160':0x8A,
    '\u2039':0x8B,'\u0152':0x8C,'\u017D':0x8E,'\u2018':0x91,'\u2019':0x92,
    '\u201C':0x93,'\u201D':0x94,'\u2022':0x95,'\u2013':0x96,'\u2014':0x97,
    '\u02DC':0x98,'\u2122':0x99,'\u0161':0x9A,'\u203A':0x9B,'\u0153':0x9C,
    '\u017E':0x9E,'\u0178':0x9F,
};

function encodeCP1252(text) {
    const bytes = [];
    for (const ch of String(text ?? '')) {
        const cp = ch.codePointAt(0);
        if (cp <= 0x7F)               { bytes.push(cp); continue; }
        if (CP1252_EXTRA[ch] != null) { bytes.push(CP1252_EXTRA[ch]); continue; }
        if (cp >= 0xA0 && cp <= 0xFF) { bytes.push(cp); continue; }
        bytes.push(0x3F);
    }
    return new Uint8Array(bytes);
}

function concat(...parts) {
    const flat = parts.flat();
    const arr  = new Uint8Array(flat.length);
    flat.forEach((b, i) => arr[i] = typeof b === 'number' ? b : 0);
    return arr;
}

class ThermalPrinterService {
    constructor() {
        this.port       = null;
        this.writer     = null;
        this.connected  = false;
        this.connecting = false;
        this.queue      = [];
        this.processing = false;
        this._listeners = [];

        if ('serial' in navigator) {
            navigator.serial.addEventListener('connect', () => this._tryAutoReconnect());
            navigator.serial.addEventListener('disconnect', () => {
                this.connected = false;
                this.writer    = null;
                this.port      = null;
                this._notify();
            });
        }
    }

    get isConnected() { return this.connected; }
    get isSupported() { return 'serial' in navigator; }

    onChange(fn) {
        this._listeners.push(fn);
        return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }
    _notify() { this._listeners.forEach(fn => fn(this.connected)); }

    async connect(baudRate = 9600) {
        if (!this.isSupported) throw new Error('WebSerial no disponible en este navegador');
        if (this.connecting) return;
        this.connecting = true;
        try {
            this.port = await navigator.serial.requestPort();
            await this._openPort(baudRate);
        } finally {
            this.connecting = false;
        }
    }

    async disconnect() {
        try { this.writer?.releaseLock(); await this.port?.close(); } catch (_) {}
        this.writer = null; this.port = null; this.connected = false;
        this._notify();
    }

    async _openPort(baudRate = 9600) {
        await this.port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
        this.writer    = this.port.writable.getWriter();
        this.connected = true;
        this._notify();
        await this.writer.write(concat(CMD.INIT, CMD.CODEPAGE_1252));
    }

    async _tryAutoReconnect() {
        try {
            const ports = await navigator.serial.getPorts();
            if (ports.length && !this.connected) {
                this.port = ports[0];
                await this._openPort();
            }
        } catch (_) {}
    }

    enqueue(data) {
        this.queue.push(data);
        if (!this.processing) this._process();
    }

    async _process() {
        if (!this.writer) return;
        this.processing = true;
        while (this.queue.length) {
            const item = this.queue.shift();
            try {
                const bytes = item instanceof Uint8Array ? item
                    : typeof item === 'string' ? encodeCP1252(item)
                    : concat(...item);
                await this.writer.write(bytes);
            } catch (err) {
                console.error('[ThermalPrinter] Error:', err);
                this.connected = false;
                this._notify();
                break;
            }
        }
        this.processing = false;
    }

    buildTicket({ header, lines, footer, corte = true }) {
        const parts = [concat(CMD.INIT, CMD.CODEPAGE_1252)];

        const addLine = (text = '', opts = {}) => {
            const align = opts.center ? CMD.ALIGN_CENTER : opts.right ? CMD.ALIGN_RIGHT : CMD.ALIGN_LEFT;
            const size  = opts.double ? CMD.DOUBLE_HEIGHT : CMD.NORMAL_SIZE;
            const bold  = opts.bold   ? CMD.BOLD_ON : CMD.BOLD_OFF;
            parts.push(concat(align, size, bold, encodeCP1252(text), CMD.LINE_FEED));
        };
        const divider = (char = '-', len = 32) => addLine(char.repeat(len), { center: true });

        if (header?.nombre) {
            addLine(header.nombre.toUpperCase(), { center: true, double: true, bold: true });
            if (header.rfc)       addLine(`RFC: ${header.rfc}`,     { center: true });
            if (header.direccion) addLine(header.direccion,          { center: true });
            if (header.telefono)  addLine(`Tel: ${header.telefono}`, { center: true });
        }
        divider();
        if (header?.folio)  addLine(`Folio: ${header.folio}`,  { bold: true });
        if (header?.fecha)  addLine(`Fecha: ${header.fecha}`);
        if (header?.cajero) addLine(`Cajero: ${header.cajero}`);
        if (header?.mesa)   addLine(`Mesa: ${header.mesa}`);
        divider();

        for (const l of (lines || [])) {
            const desc   = String(l.nombre || '').substring(0, 20).padEnd(20);
            const precio = String(l.precio || '').padStart(10);
            addLine(`${l.cantidad}x ${desc}${precio}`);
            if (l.nota) addLine(`   * ${l.nota}`);
        }
        divider();

        if (footer) {
            const pad = (label, value) => `${label.padEnd(18)}${String(value).padStart(14)}`;
            if (footer.subtotal)  addLine(pad('Subtotal:', footer.subtotal));
            if (footer.descuento) addLine(pad('Descuento:', `-${footer.descuento}`));
            if (footer.iva)       addLine(pad('IVA:', footer.iva));
            addLine(pad('TOTAL:', footer.total), { bold: true, double: true });
            if (footer.metodo)    addLine(`Forma de pago: ${footer.metodo}`);
            if (footer.recibido)  addLine(pad('Recibido:', footer.recibido));
            if (footer.cambio)    addLine(pad('Cambio:', footer.cambio), { bold: true });
        }
        divider();
        if (footer?.mensaje) { addLine('', { center: true }); addLine(footer.mensaje, { center: true }); }
        addLine(''); addLine(''); addLine('');
        if (corte) parts.push(concat(CMD.CUT_PARTIAL));
        return concat(...parts);
    }

    printTest() {
        if (!this.connected) throw new Error('Impresora no conectada');
        this.enqueue(this.buildTicket({
            header: { nombre: 'PRUEBA DE IMPRESION', folio: 'TEST-001', fecha: new Date().toLocaleString('es-MX') },
            lines:  [{ cantidad: 1, nombre: 'Producto de prueba', precio: '$99.00' }],
            footer: { total: '$99.00', mensaje: 'Impresora funcionando OK' },
        }));
    }
}

export const ThermalPrinter = new ThermalPrinterService();
window.ThermalPrinter = ThermalPrinter;

if ('serial' in navigator) {
    navigator.serial.getPorts().then(ports => {
        if (ports.length) ThermalPrinter._tryAutoReconnect();
    }).catch(() => {});
}
