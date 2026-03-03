// src/store/state.js
import { supabase } from '../api/supabase.js';

// Estructura reactiva que almacena los datos descargados
export let DB = {
    configuracion: { nombreEmpresa: 'Cargando...', iva: 0.16 },
    categorias: ['Carnes', 'Lácteos', 'Verduras', 'Abarrotes', 'Bebidas', 'Especias', 'Otros'],
    unidades: ['kg', 'L', 'pz', 'g', 'ml', 'caja', 'paq'],
    usuarios: [],
    productos: [],
    proveedores: [],
    recetas: [],
    ordenesCompra: [],
    movimientos: [],
    ventas: [],
    mesas: []
};

// El estado de la pantalla actual y del usuario
export const AppState = {
    user: null,
    currentScreen: 'login',
    cart: [],
    tempData: {},
    isSidebarOpen: false,
    searchTerm: '',
    filterCategory: '',
    reporteActivo: 'valorizacion',
    productosPage: 1,
    movimientosPage: 1,
    reportDateStart: '',
    reportDateEnd: ''
};

// Función para sincronizar datos con la nube
export async function cargarDatosDeNube() {
    console.log("Descargando datos de Supabase...");
    
    try {
        // Extraemos 'data' y también 'error' para monitorear posibles fallas
        const [
            { data: prod, error: errProd }, { data: prov, error: errProv }, { data: user, error: errUser }, 
            { data: mov, error: errMov }, { data: conf, error: errConf }, { data: rec, error: errRec }, 
            { data: oc, error: errOc }, { data: ven, error: errVen }, { data: mes, error: errMes }
        ] = await Promise.all([
            supabase.from('productos').select('*'),
            supabase.from('proveedores').select('*'),
            supabase.from('usuarios').select('*'),
            supabase.from('movimientos').select('*'),
            supabase.from('configuracion').select('*'),
            supabase.from('recetas').select('*'),
            supabase.from('ordenes_compra').select('*'),
            supabase.from('ventas').select('*'),
            supabase.from('mesas').select('*')
        ]);
        
        // --- Reporte de Errores en Consola ---
        const errores = [errProd, errProv, errUser, errMov, errConf, errRec, errOc, errVen, errMes].filter(Boolean);
        if (errores.length > 0) {
            console.error("⚠️ Alerta: Supabase reportó errores al descargar algunas tablas:");
            errores.forEach(e => console.error("-", e.message));
        }

        // --- Asignación al Estado Local ---
        if(prod) DB.productos = prod;
        if(prov) DB.proveedores = prov;
        if(user) DB.usuarios = user;
        if(mov) DB.movimientos = mov;
        if(rec) DB.recetas = rec;
        if(oc) DB.ordenesCompra = oc; 
        if(ven) DB.ventas = ven;
        if(mes) DB.mesas = mes;

        if(conf && conf.length > 0) {
            DB.configuracion = { 
                nombreEmpresa: conf[0].nombre_empresa,
                rfc:           conf[0].rfc || '',
                telefono:      conf[0].telefono || '',
                direccion:     conf[0].direccion || '',
                mensaje_ticket: conf[0].mensaje_ticket || '¡Gracias por su preferencia!',
                logo_url:      conf[0].logo_url || '',
                iva:           conf[0].iva 
            };
            if (conf[0].categorias) DB.categorias = conf[0].categorias;
            if (conf[0].unidades) DB.unidades = conf[0].unidades;    
        }

        console.log("✅ Datos actualizados:", DB);
        
    } catch (criticalError) {
        console.error("❌ Fallo crítico de conexión al descargar datos:", criticalError);
    }
}