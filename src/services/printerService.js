class PrinterService {

    constructor() {
        this.port = null;
        this.writer = null;
        this.connected = false;
        this.queue = [];
        this.processing = false;
    }

    async connect() {

        if (!navigator.serial)
            throw new Error("WebSerial no soportado");

        this.port = await navigator.serial.requestPort();

        await this.port.open({
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: "none"
        });

        this.writer = this.port.writable.getWriter();
        this.connected = true;

        this.port.addEventListener("disconnect", () => {
            this.connected = false;
        });

    }

    encodeLatin1(text) {

        const cp1252Map = {
            "€": 0x80,
            "‚": 0x82,
            "ƒ": 0x83,
            "„": 0x84,
            "…": 0x85,
            "†": 0x86,
            "‡": 0x87,
            "ˆ": 0x88,
            "‰": 0x89,
            "Š": 0x8A,
            "‹": 0x8B,
            "Œ": 0x8C,
            "Ž": 0x8E,
            "‘": 0x91,
            "’": 0x92,
            "“": 0x93,
            "”": 0x94,
            "•": 0x95,
            "–": 0x96,
            "—": 0x97,
            "˜": 0x98,
            "™": 0x99,
            "š": 0x9A,
            "›": 0x9B,
            "œ": 0x9C,
            "ž": 0x9E,
            "Ÿ": 0x9F
        };

        const bytes = [];

        for (const char of String(text ?? "")) {

            const codePoint = char.codePointAt(0);

            if (typeof codePoint !== "number") {
                bytes.push(0x3F);
                continue;
            }

            if (codePoint <= 0x7F) {
                bytes.push(codePoint);
                continue;
            }

            if (cp1252Map[char] !== undefined) {
                bytes.push(cp1252Map[char]);
                continue;
            }

            if (codePoint >= 0xA0 && codePoint <= 0xFF) {
                bytes.push(codePoint);
                continue;
            }

            bytes.push(0x3F);

        }

        return new Uint8Array(bytes);

    }

    async enqueue(ticket) {

        this.queue.push(ticket);

        if (!this.processing)
            this.process();

    }

    async process() {

        if (!this.writer) {
            this.processing = false;
            return;
        }

        this.processing = true;

        while (this.queue.length) {

            const ticket = this.queue.shift();

            try {

                const data = ticket instanceof Uint8Array ? ticket : this.encodeLatin1(ticket);

                await this.writer.write(data);

            } catch (err) {

                console.error("Error impresión", err);

            }

        }

        this.processing = false;

    }

}

export const printerService = new PrinterService();
