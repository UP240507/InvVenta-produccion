async function confirmarVenta() {

    if (ventaEnProceso) return;
    ventaEnProceso = true;

    try {

        const venta = await salesService.createSale({
            total: posState.total,
            usuario_id: AppState.user.id
        });

        await inventoryService.descontar(posState.productos);

        await printerService.enqueue(
            buildTicket(venta, posState.productos)
        );

        showNotification("Venta completada", "success");

        limpiarPOS();

    } catch (err) {

        console.error(err);
        showNotification("Error al registrar venta", "error");

    } finally {

        ventaEnProceso = false;

    }

}
