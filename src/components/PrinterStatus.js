// src/components/PrinterStatus.js
import { ThermalPrinter } from '../services/thermalPrinter.js';
import { showNotification } from '../utils/helpers.js';
import { DB } from '../store/state.js';

let _mounted = false;

export function mountPrinterWidget() {
    if (_mounted) return;
    _mounted = true;
    const container = document.createElement('div');
    container.id = 'printer-widget';
    container.style.cssText = 'position:fixed;bottom:80px;left:0;z-index:50;';
    document.body.appendChild(container);
    _render();
    ThermalPrinter.onChange(() => _render());
}

function _render() {
    const el = document.getElementById('printer-widget');
    if (!el || !ThermalPrinter.isSupported) { if (el) el.innerHTML = ''; return; }
    const connected = ThermalPrinter.isConnected;
    el.innerHTML = `
        <div class="relative">
            <button id="btn-printer-toggle" onclick="window.togglePrinterPanel()"
                title="${connected ? 'Impresora conectada' : 'Impresora desconectada'}"
                class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-r-xl shadow-md transition-all
                    ${connected ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
                <span class="w-2 h-2 rounded-full ${connected ? 'bg-green-300 animate-pulse' : 'bg-slate-500'}"></span>
                <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline">${connected ? 'Impresora' : 'Sin impr.'}</span>
            </button>
            <div id="printer-panel" class="hidden absolute bottom-10 left-0 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-56 z-50">
                <p class="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Impresora ESC/POS</p>
                <div class="flex items-center gap-2 mb-4 p-2 rounded-lg ${connected ? 'bg-green-50' : 'bg-slate-50'} border">
                    <span class="w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-400'}"></span>
                    <span class="text-xs font-bold ${connected ? 'text-green-700' : 'text-slate-500'}">${connected ? 'Conectada' : 'Desconectada'}</span>
                </div>
                ${!connected ? `
                <button onclick="window.connectPrinter()"
                    class="w-full bg-slate-800 text-white py-2 rounded-lg text-xs font-bold hover:bg-slate-700 mb-2 flex items-center justify-center gap-2">
                    <i data-lucide="plug" class="w-3.5 h-3.5"></i> Conectar impresora
                </button>` : `
                <button onclick="window.printerTest()"
                    class="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700 mb-2 flex items-center justify-center gap-2">
                    <i data-lucide="printer" class="w-3.5 h-3.5"></i> Prueba de impresión
                </button>
                <button onclick="window.disconnectPrinter()"
                    class="w-full border border-slate-200 text-slate-500 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-2">
                    <i data-lucide="unplug" class="w-3.5 h-3.5"></i> Desconectar
                </button>`}
                <p class="text-[10px] text-slate-400 leading-relaxed mt-3 pt-3 border-t">Baud: 9600 · WebSerial · 80mm ESC/POS</p>
            </div>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

window.togglePrinterPanel = () => {
    const panel = document.getElementById('printer-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    const close = (e) => {
        if (!document.getElementById('printer-widget')?.contains(e.target)) {
            panel.classList.add('hidden');
            document.removeEventListener('click', close);
        }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
};

window.connectPrinter = async () => {
    try {
        const baud = parseInt((DB.configuracion || {}).printer_baud) || 9600;
        await ThermalPrinter.connect(baud);
        showNotification('✅ Impresora conectada', 'success');
        document.getElementById('printer-panel')?.classList.add('hidden');
    } catch (err) {
        if (err.name !== 'NotFoundError') showNotification('Error al conectar: ' + err.message, 'error');
    }
};

window.disconnectPrinter = async () => {
    await ThermalPrinter.disconnect();
    showNotification('Impresora desconectada', 'info');
};

window.printerTest = () => {
    try { ThermalPrinter.printTest(); showNotification('Ticket de prueba enviado', 'success'); }
    catch (err) { showNotification(err.message, 'error'); }
};
