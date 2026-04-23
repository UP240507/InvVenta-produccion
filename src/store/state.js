// src/store/state.js
import { supabase } from '../api/supabase.js';
import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.mjs';

// ─── 1. INICIALIZAR BASE DE DATOS LOCAL (OFFLINE) ────────────────────────────
export const localDB = new Dexie('StockCentralDB');

// Definimos las tablas locales. '++id' en sync_queue significa Autoincrementable.
localDB.version(1).stores({
    configuracion: 'id',
    productos: 'id',
    recetas: 'id',
    mesas: 'id',
    ventas: 'id',
    movimientos: 'id',
    ordenes_compra: 'id',
    usuarios: 'id',
    turnos: 'id',
    sync_queue: '++id, tabla, metodo, fecha'
});

localDB.version(2).stores({
    configuracion: 'id',
    productos: 'id',
    recetas: 'id',
    mesas: 'id',
    ventas: 'id',
    movimientos: 'id',
    ordenes_compra: 'id',
    proveedores: 'id',
    usuarios: 'id',
    turnos: 'id',
    sync_queue: '++id, tabla, metodo, fecha'
});

localDB.version(3).stores({
    configuracion: 'id',
    productos: 'id',
    recetas: 'id',
    mesas: 'id',
    ventas: 'id',
    movimientos: 'id',
    ordenes_compra: 'id',
    proveedores: 'id',
    usuarios: 'id',
    turnos: 'id',
    sync_queue: '++id, tabla, metodo, estado, fecha, createdAt'
});

localDB.version(4).stores({
    configuracion: 'id',
    productos:     'id',
    recetas:       'id',
    mesas:         'id',
    ventas:        'id',
    movimientos:   'id',
    ordenes_compra:'id',
    proveedores:   'id',
    usuarios:      'id',
    turnos:        'id',
    sync_queue:    '++id, tabla, metodo, estado, fecha, createdAt',
    facturas:      '++id, folio_venta, rfc_receptor, fecha_emision, estado'
});

// ─── 2. ESTADO GLOBAL DE LA APLICACIÓN ───────────────────────────────────────
export const AppState = {
    user: null,
    currentScreen: 'login',
    isSidebarOpen: false,
    turnoActivo: null,
    isOffline: !navigator.onLine,
    tempData: {},
    cart: [],
    searchTerm: '',
    // Paginación y filtros (se usan sin declarar — JS los crea implícito pero es mejor declararlos)
    productosPage: 1,
    filterCategory: '',
    reportDateStart: '',
    reportDateEnd: '',
    reporteActivo: 'valorizacion',
    reporteMesero: '',
    reporteTurnoId: null,
    comprasTab: 'historial',
    entradasTab: 'pendientes',
};

export const DB = {
    configuracion: {},
    productos: [],
    recetas: [],
    mesas: [],
    ventas: [],
    movimientos: [],
    ordenesCompra: [],
    proveedores: [],
    usuarios: [],
    turnos: [],
    facturas: [],
    // Shortcuts reactivos: leen directamente de DB.configuracion
    get categorias() { return Array.isArray(this.configuracion?.categorias) ? this.configuracion.categorias : []; },
    get unidades()   { return Array.isArray(this.configuracion?.unidades)   ? this.configuracion.unidades   : []; },
};

let isProcessingOfflineQueue = false;

const CLOUD_TABLES = {
    configuracion: 'configuracion',
    productos: 'productos',
    recetas: 'recetas',
    mesas: 'mesas',
    ventas: 'ventas',
    movimientos: 'movimientos',
    ordenes_compra: 'ordenes_compra',
    proveedores: 'proveedores',
    usuarios: 'usuarios',
    turnos: 'turnos',
    facturas: 'facturas'
};

const MEMORY_TABLES = {
    configuracion: 'configuracion',
    productos: 'productos',
    recetas: 'recetas',
    mesas: 'mesas',
    ventas: 'ventas',
    movimientos: 'movimientos',
    ordenes_compra: 'ordenesCompra',
    proveedores: 'proveedores',
    usuarios: 'usuarios',
    turnos: 'turnos',
    facturas: 'facturas'
};

function getMemoryTableName(tabla) {
    return MEMORY_TABLES[tabla] || tabla;
}

function getLocalTable(tabla) {
    return localDB[tabla] || null;
}

function normalizePayload(data) {
    if (data == null) return {};
    if (typeof structuredClone === 'function') return structuredClone(data);
    return JSON.parse(JSON.stringify(data));
}

function updateDBMemory(tabla, metodo, data) {
    const memoryKey = getMemoryTableName(tabla);

    if (!(memoryKey in DB)) return;

    if (tabla === 'configuracion') {
        if (metodo === 'delete') {
            DB.configuracion = {};
            return;
        }
        DB.configuracion = { ...(DB.configuracion || {}), ...(data || {}) };
        return;
    }

    if (!Array.isArray(DB[memoryKey])) {
        DB[memoryKey] = [];
    }

    if (metodo === 'insert') {
        DB[memoryKey] = [...DB[memoryKey], data];
        return;
    }

    if (metodo === 'upsert' || metodo === 'update') {
        const index = DB[memoryKey].findIndex(item => item.id === data?.id);
        if (index >= 0) {
            DB[memoryKey][index] = { ...DB[memoryKey][index], ...(data || {}) };
        } else {
            DB[memoryKey] = [...DB[memoryKey], data];
        }
        return;
    }

    if (metodo === 'delete') {
        const targetId = data?.id;
        DB[memoryKey] = DB[memoryKey].filter(item => item.id !== targetId);
    }
}

async function applyLocalMutation(tabla, metodo, data) {
    const localTable = getLocalTable(tabla);
    if (!localTable) {
        throw new Error(`Tabla local no soportada: ${tabla}`);
    }

    if (tabla === 'configuracion') {
        if (metodo === 'delete') {
            if (data?.id != null) {
                await localTable.delete(data.id);
            } else {
                await localTable.clear();
            }
            updateDBMemory(tabla, metodo, data);
            return;
        }

        await localTable.put(data);
        updateDBMemory(tabla, metodo, data);
        return;
    }

    if (metodo === 'insert' || metodo === 'upsert' || metodo === 'update') {
        await localTable.put(data);
        updateDBMemory(tabla, metodo === 'insert' ? 'upsert' : metodo, data);
        return;
    }

    if (metodo === 'delete') {
        if (data?.id == null) {
            throw new Error(`Se requiere data.id para eliminar en ${tabla}`);
        }
        await localTable.delete(data.id);
        updateDBMemory(tabla, metodo, data);
        return;
    }

    throw new Error(`Método offline no soportado: ${metodo}`);
}

async function sendActionToSupabase(tabla, metodo, data) {
    const cloudTable = CLOUD_TABLES[tabla];
    if (!cloudTable) {
        throw new Error(`Tabla remota no soportada: ${tabla}`);
    }

    let query = supabase.from(cloudTable);

    if (tabla === 'configuracion') {
        if (metodo === 'delete') {
            if (data?.id == null) {
                throw new Error('Se requiere data.id para eliminar configuracion');
            }
            const { error } = await query.delete().eq('id', data.id);
            if (error) throw error;
            return;
        }

        const { error } = await query.upsert(data);
        if (error) throw error;
        return;
    }

    if (metodo === 'insert') {
        const { error } = await query.insert(data);
        if (error) throw error;
        return;
    }

    if (metodo === 'upsert' || metodo === 'update') {
        const { error } = await query.upsert(data);
        if (error) throw error;
        return;
    }

    if (metodo === 'delete') {
        if (data?.id == null) {
            throw new Error(`Se requiere data.id para eliminar en ${tabla}`);
        }
        const { error } = await query.delete().eq('id', data.id);
        if (error) throw error;
        return;
    }

    throw new Error(`Método remoto no soportado: ${metodo}`);
}

export async function enqueueOfflineAction(tabla, metodo, data, options = {}) {
    const payload = normalizePayload(data);
    const queueItem = {
        tabla,
        metodo,
        data: payload,
        estado: 'pending',
        fecha: options.fecha || new Date().toISOString(),
        createdAt: Date.now(),
        intentos: options.intentos || 0,
        error: null
    };

    await applyLocalMutation(tabla, metodo, payload);
    const id = await localDB.sync_queue.add(queueItem);
    return { id, ...queueItem };
}

export async function processOfflineQueue(options = {}) {
    if (isProcessingOfflineQueue) {
        return { processed: 0, failed: 0, skipped: true };
    }

    if (!navigator.onLine) {
        AppState.isOffline = true;
        return { processed: 0, failed: 0, skipped: true };
    }

    isProcessingOfflineQueue = true;

    let processed = 0;
    let failed = 0;

    try {
        const pendingItems = await localDB.sync_queue.orderBy('id').toArray();

        for (const item of pendingItems) {
            if (!item || item.estado === 'done') continue;

            try {
                await localDB.sync_queue.update(item.id, {
                    estado: 'processing',
                    error: null
                });

                await sendActionToSupabase(item.tabla, item.metodo, item.data);

                await localDB.sync_queue.delete(item.id);
                processed += 1;
            } catch (error) {
                failed += 1;
                await localDB.sync_queue.update(item.id, {
                    estado: 'error',
                    intentos: (item.intentos || 0) + 1,
                    error: error?.message || 'Error desconocido',
                    fecha_error: new Date().toISOString()
                });
            }
        }

        if (processed > 0) {
            await cargarDatosDeNube();
        }

        if (failed === 0) {
            AppState.isOffline = false;
        }

        if (options.notify !== false && processed > 0 && window.showNotification) {
            window.showNotification(`✅ ${processed} cambio(s) offline sincronizado(s).`, 'success');
        }

        if (options.notify !== false && failed > 0 && window.showNotification) {
            window.showNotification(`⚠️ ${failed} cambio(s) offline no se pudieron sincronizar.`, 'error');
        }

        return { processed, failed, skipped: false };
    } finally {
        isProcessingOfflineQueue = false;
    }
}

export async function getOfflineQueue() {
    return localDB.sync_queue.orderBy('id').toArray();
}

export async function clearOfflineQueue() {
    await localDB.sync_queue.clear();
}

// ─── 3. MOTOR DE SINCRONIZACIÓN (NUBE <-> LOCAL) ─────────────────────────────
export async function cargarDatosDeNube() {
    try {
        const [
            { data: conf }, { data: prod }, { data: rec },
            { data: mes }, { data: ven }, { data: mov },
            { data: oc }, { data: prov }, { data: usu }, { data: tur }, { data: fact }
        ] = await Promise.all([
            supabase.from('configuracion').select('*').single(),
            supabase.from('productos').select('*').order('nombre'),
            supabase.from('recetas').select('*').order('nombre'),
            supabase.from('mesas').select('*').order('nombre'),
            supabase.from('ventas').select('*').order('fecha', { ascending: false }).limit(300),
            supabase.from('movimientos').select('*').order('fecha', { ascending: false }).limit(300),
            supabase.from('ordenes_compra').select('*').order('fecha', { ascending: false }).limit(200),
            supabase.from('proveedores').select('*').order('nombre'),
            supabase.from('usuarios').select('*'),
            supabase.from('turnos').select('*').order('fecha_apertura', { ascending: false }).limit(50),
            supabase.from('facturas').select('*').order('fecha_emision', { ascending: false }).limit(200)
        ]);

        DB.configuracion = conf || {};
        DB.productos = prod || [];
        DB.recetas = rec || [];
        DB.mesas = mes || [];
        DB.ventas = ven || [];
        DB.movimientos = mov || [];
        DB.ordenesCompra = oc || [];
        DB.proveedores = prov || [];
        DB.usuarios = usu || [];
        DB.turnos = tur || [];
        DB.facturas = fact || [];

        await localDB.transaction('rw', localDB.configuracion, localDB.productos, localDB.recetas, localDB.mesas, localDB.ventas, localDB.movimientos, localDB.ordenes_compra, localDB.proveedores, localDB.usuarios, localDB.turnos, localDB.facturas, async () => {
            if (conf) await localDB.configuracion.put(conf);
            await localDB.productos.bulkPut(prod || []);
            await localDB.recetas.bulkPut(rec || []);
            await localDB.mesas.bulkPut(mes || []);
            await localDB.ventas.bulkPut(ven || []);
            await localDB.movimientos.bulkPut(mov || []);
            await localDB.ordenes_compra.bulkPut(oc || []);
            await localDB.proveedores.bulkPut(prov || []);
            await localDB.usuarios.bulkPut(usu || []);
            await localDB.turnos.bulkPut(tur || []);
            await localDB.facturas.bulkPut(fact || []);
        });

        AppState.isOffline = false;
    } catch (error) {
        console.warn('⚠️ Sin conexión a internet. Cargando base de datos local (Dexie)...');
        AppState.isOffline = true;

        const confLocal = await localDB.configuracion.toArray();
        DB.configuracion = confLocal[0] || {};
        DB.productos = await localDB.productos.toArray();
        DB.recetas = await localDB.recetas.toArray();
        DB.mesas = await localDB.mesas.toArray();
        DB.ventas = await localDB.ventas.toArray();
        DB.movimientos = await localDB.movimientos.toArray();
        DB.ordenesCompra = await localDB.ordenes_compra.toArray();
        DB.proveedores = await localDB.proveedores.toArray();
        DB.usuarios = await localDB.usuarios.toArray();
        DB.turnos = await localDB.turnos.toArray();
        DB.facturas = await localDB.facturas.toArray();

        if (window.showNotification) {
            window.showNotification('Estás en MODO OFFLINE. Usando datos guardados.', 'error');
        }
    }
}

// ─── ESCUCHADORES DE RED DEL NAVEGADOR ───────────────────────────────────────
window.addEventListener('online', () => {
    AppState.isOffline = false;

    if (window.showNotification) {
        window.showNotification('✅ Conexión restaurada. Sincronizando datos...', 'success');
    }

    processOfflineQueue({ notify: false })
        .then(() => cargarDatosDeNube())
        .then(() => { if (window.render) window.render(); })
        .catch(() => {
            if (window.render) window.render();
        });
});

window.addEventListener('offline', () => {
    AppState.isOffline = true;
    if (window.showNotification) window.showNotification('⚠️ Conexión perdida. Modo Offline Activado.', 'error');
    if (window.render) window.render();
});