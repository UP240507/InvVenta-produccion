// Importamos la función oficial de Supabase que instalaste con npm
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; 
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
// Creamos la conexión y la "exportamos" para que el resto de tu app pueda usarla
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);