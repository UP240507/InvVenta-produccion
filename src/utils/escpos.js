export function buildTicket(venta, items) {

    const width = 32;

    const line = "-".repeat(width);

    let ticket = "";

    ticket += "\x1B\x40";
    ticket += "\x1B\x61\x01";
    ticket += "STOCK CENTRAL\n";

    ticket += "\x1B\x61\x00";
    ticket += line + "\n";

    items.forEach(item => {

        ticket += item.nombre + "\n";

        ticket +=
            item.cantidad +
            " x " +
            item.precio +
            "  $" +
            item.total +
            "\n";

    });

    ticket += line + "\n";

    ticket += "TOTAL: $" + venta.total + "\n";

    ticket += "\n\n\n";
    ticket += "\x1D\x56\x00";

    return ticket;

}
