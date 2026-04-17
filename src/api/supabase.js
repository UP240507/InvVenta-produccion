// Importamos la función oficial de Supabase que instalaste con npm
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Faltan las variables VITE_SUPABASE_URL y/o VITE_SUPABASE_KEY en el archivo .env');
}

// Creamos la conexión y la "exportamos" para que el resto de tu app pueda usarla
export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_KEY || 'placeholder-key'
);

// Cliente secundario sin persistencia de sesión.
// OJO: usa la misma anon key del frontend; NO es un cliente admin real ni otorga privilegios extra.
// Solo evita contaminar la sesión principal al intentar flujos de auth separados en el navegador.
export const supabaseAdminAuth = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_KEY || 'placeholder-key',
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    }
);
