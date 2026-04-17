class InventoryService {

    async descontar(productos) {

        const updates = [];

        for (const p of productos) {

            updates.push(
                supabase
                    .from("productos")
                    .update({
                        stock: p.nuevoStock
                    })
                    .eq("id", p.id)
            );

        }

        await Promise.all(updates);

    }

}

export const inventoryService = new InventoryService();
