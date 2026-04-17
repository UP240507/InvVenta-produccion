import { supabase } from "../api/supabase.js";

class SalesService {

    async createSale(venta) {

        const { data, error } =
            await supabase
                .from("ventas")
                .insert(venta)
                .select()
                .single();

        if (error)
            throw error;

        return data;

    }

}

export const salesService = new SalesService();
