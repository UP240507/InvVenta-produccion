// src/components/Compras.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { 
    formatCurrency, formatDate, showNotification, 
    SPINNER_ICON, registrarMovimientoEnNube 
} from '../utils/helpers.js';

// ==========================================
// FUNCIONES GLOBALES PARA COMPRAS
// ==========================================
window.cambiarTabCompras = (tab) => {
    AppState.comprasTab = tab;
    window.render();
};

window.imprimirOC = (id) => {
    const ordenes = DB.ordenes_compra || DB.ordenesCompra || [];
    const oc = ordenes.find(x => x.id === id);
    if (!oc) return;

    
    
    const folio = oc.numero || `OC-00${oc.id}`;
    const prov = oc.proveedor || oc.proveedor_id || 'Proveedor Automático';
    const usuario = oc.usuario || 'Sistema POS';

    const ventanaOC = window.open('', 'PRINT', 'height=800,width=600');
    let html = `
        <html><head><style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .info { margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; }
            .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
            .ref { margin-top: 20px; font-size: 12px; color: #666; }
        </style></head><body>
            <div class="header">
                <h2>${DB.configuracion?.nombreEmpresa || 'Mi Negocio'}</h2>
                <h3>ORDEN DE COMPRA: ${folio}</h3>
            </div>
            <div class="info">
                <p><b>Fecha:</b> ${formatDate(oc.fecha)}</p>
                <p><b>Proveedor:</b> ${prov}</p>
                <p><b>Generada por:</b> ${usuario}</p>
                <p><b>Estado:</b> ${(oc.estado || 'PENDIENTE').toUpperCase()}</p>
                ${oc.referencia ? `<p><b>Referencia:</b> ${oc.referencia}</p>` : ''}
            </div>
            <table>
                <tr><th>Producto</th><th>Cant.</th><th>Costo Unit.</th><th>Subtotal</th></tr>
                ${(oc.items || []).map(item => {
                    const cantidad = parseFloat(item.cant || item.cantidad || 0);
                    return `
                    <tr>
                        <td>${item.nombre}</td>
                        <td>${Number.isInteger(cantidad) ? cantidad : cantidad.toFixed(2)}</td>
                        <td>${formatCurrency(item.precio)}</td>
                        <td>${formatCurrency(cantidad * item.precio)}</td>
                    </tr>
                `}).join('')}
            </table>
            <div class="total">TOTAL A PAGAR: ${formatCurrency(oc.total)}</div>
            <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
                Por favor, adjuntar esta orden de compra en su factura o remisión.
            </div>
        </body></html>
    `;
    
    ventanaOC.document.write(html);
    ventanaOC.document.close();
    ventanaOC.focus();
    setTimeout(() => { ventanaOC.print(); ventanaOC.close(); }, 250);
};

// ==========================================
// 1. PANTALLA: NUEVA ORDEN DE COMPRA
// ==========================================
export function renderOrdenCompraForm() {
    if (!AppState.comprasTab) AppState.comprasTab = 'historial';

    const tabsHTML = `
        <div class="flex gap-4 border-b pb-2 mb-6">
            <button onclick="window.cambiarTabCompras('historial')" class="px-4 py-2 font-bold ${AppState.comprasTab === 'historial' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-blue-500'} transition-colors">📋 Historial de Órdenes</button>
            <button onclick="window.cambiarTabCompras('crear')" class="px-4 py-2 font-bold ${AppState.comprasTab === 'crear' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-blue-500'} transition-colors">📝 Crear Orden Manual</button>
        </div>
    `;

    // ------------------------------------------
    // PESTAÑA 1: HISTORIAL DE ÓRDENES
    // ------------------------------------------
    if (AppState.comprasTab === 'historial') {
        const ordenes = [...(DB.ordenes_compra || DB.ordenesCompra || [])];
        ordenes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        return `
            <div class="animate-fade-in pb-20 mt-4">
                ${tabsHTML}
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
                    ${ordenes.length === 0 ? `
                        <div class="p-10 text-center text-gray-500">
                            <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                            <p>No hay órdenes de compra generadas todavía.</p>
                        </div>
                    ` : `
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm text-left">
                                <thead class="bg-gray-100 text-gray-600 uppercase font-bold">
                                    <tr>
                                        <th class="p-4">Folio</th>
                                        <th class="p-4">Fecha</th>
                                        <th class="p-4">Proveedor</th>
                                        <th class="p-4">Referencia</th>
                                        <th class="p-4">Usuario</th>
                                        <th class="p-4">Estado</th>
                                        <th class="p-4 text-right">Total</th>
                                        <th class="p-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100">
                                    ${ordenes.map(oc => {
                                        const estado = (oc.estado || 'pendiente').toLowerCase().trim();
                                        const folio = oc.numero || ('OC-00' + oc.id);
                                        const prov = oc.proveedor || oc.proveedor_id || 'Automático';
                                        return `
                                        <tr class="hover:bg-gray-50 transition-colors">
                                            <td class="p-4 font-bold text-blue-600">${folio}</td>
                                            <td class="p-4 text-gray-600">${formatDate(oc.fecha)}</td>
                                            <td class="p-4 font-medium text-gray-800">${prov}</td>
                                            <td class="p-4 text-gray-500 italic text-xs">${oc.referencia || '—'}</td>
                                            <td class="p-4 text-gray-500 text-xs">${oc.usuario || '—'}</td>
                                            <td class="p-4">
                                                <span class="px-3 py-1 rounded-full text-xs font-bold ${estado === 'pendiente' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">
                                                    ${(oc.estado || 'PENDIENTE').toUpperCase()}
                                                </span>
                                            </td>
                                            <td class="p-4 text-right font-black text-gray-800">${formatCurrency(oc.total)}</td>
                                            <td class="p-4 text-center">
                                                <button onclick="window.imprimirOC(${oc.id})" class="text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm flex items-center justify-center gap-1 mx-auto text-xs">
                                                    <i data-lucide="printer" class="w-4 h-4"></i> PDF
                                                </button>
                                            </td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    // ------------------------------------------
    // PESTAÑA 2: CREAR ORDEN MANUAL
    // ------------------------------------------
    if (!AppState.tempData.proveedor) {
        return `
            <div class="animate-fade-in pb-20 mt-4">
                ${tabsHTML}
                <h2 class="text-2xl font-bold mb-6 text-gray-800">Nueva Orden de Compra - Paso 1</h2>
                <p class="mb-4 text-gray-600">Selecciona el proveedor para esta orden:</p>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${(DB.proveedores || []).filter(p => p.activo !== false).map(p => `
                        <button onclick="AppState.tempData.proveedor=DB.proveedores.find(x=>x.id==${p.id}); window.render()" class="bg-white p-6 rounded-xl border hover:border-blue-500 hover:shadow-md text-left shadow-sm transition-all group">
                            <div class="flex justify-between items-center mb-2">
                                <h3 class="font-bold text-lg text-gray-800 group-hover:text-blue-600">${p.nombre}</h3>
                                <i data-lucide="chevron-right" class="text-gray-300 group-hover:text-blue-500"></i>
                            </div>
                            <p class="text-gray-500 text-sm">${p.contacto}</p>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const prov = AppState.tempData.proveedor;
    const subtotal = AppState.cart.reduce((s, i) => s + (i.precio * i.cant), 0);
    const iva = subtotal * (DB.configuracion?.iva || 0.16);
    
    return `
        <div class="animate-fade-in pb-20 mt-4">
            ${tabsHTML}
            <div class="flex justify-between items-end mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">Orden para: ${prov.nombre}</h2>
                    <p class="text-sm text-gray-500">Agrega productos a la lista</p>
                </div>
                <button onclick="AppState.tempData={}; AppState.cart=[]; window.render()" class="text-red-600 font-bold text-sm hover:underline">Cambiar Proveedor</button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-6">
                    <div class="bg-white p-6 rounded-xl border shadow-sm">
                        <form onsubmit="window.agregarAlCarrito(event)" class="flex flex-col md:flex-row gap-4 items-end">
                            <div class="flex-1 w-full">
                                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Producto</label>
                                <select name="pid" class="w-full border p-2 rounded-lg bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seleccionar...</option>
                                    ${(DB.productos || []).map(p => `<option value="${p.id}">${p.nombre} (${formatCurrency(p.precio)})</option>`).join('')}
                                </select>
                            </div>
                            <div class="w-full md:w-32">
                                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Cantidad</label>
                                <input name="qty" type="number" step="0.01" min="0.01" class="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" required>
                            </div>
                            <button type="submit" class="w-full md:w-auto bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors">Agregar</button>
                        </form>
                    </div>
                    
                    <div class="bg-white rounded-xl border shadow-sm overflow-hidden min-h-[200px]">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 text-left text-gray-500 uppercase">
                                <tr><th class="p-4">Producto</th><th class="p-4 text-center">Cant</th><th class="p-4 text-right">P. Unit</th><th class="p-4 text-right">Total</th><th class="p-4"></th></tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${AppState.cart.length ? AppState.cart.map(i => `
                                    <tr class="hover:bg-gray-50">
                                        <td class="p-4 font-medium">${i.nombre}</td>
                                        <td class="p-4 text-center font-mono bg-gray-50 rounded">${i.cant}</td>
                                        <td class="p-4 text-right text-gray-500">${formatCurrency(i.precio)}</td>
                                        <td class="p-4 text-right font-bold">${formatCurrency(i.precio * i.cant)}</td>
                                        <td class="p-4 text-center">
                                            <button onclick="AppState.cart=AppState.cart.filter(x=>x.productoId!=${i.productoId}); window.render()" class="text-red-500 hover:bg-red-50 p-2 rounded-full"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                        </td>
                                    </tr>
                                `).join('') : `<tr><td colspan="5" class="p-8 text-center text-gray-400 italic">El carrito está vacío</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="bg-white p-6 rounded-xl border shadow-sm h-fit sticky top-24">
                    <h3 class="font-bold text-gray-800 text-lg mb-4">Resumen de Orden</h3>
                    <div class="space-y-3 mb-6 text-sm">
                        <div class="flex justify-between text-gray-600"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                        <div class="flex justify-between text-gray-600"><span>IVA (${((DB.configuracion?.iva || 0.16)*100).toFixed(0)}%)</span><span>${formatCurrency(iva)}</span></div>
                        <div class="h-px bg-gray-200 my-2"></div>
                        <div class="flex justify-between font-bold text-xl text-gray-900"><span>Total</span><span>${formatCurrency(subtotal + iva)}</span></div>
                    </div>
                    <button onclick="window.generarOC(event)" class="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-100 flex justify-center items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i> Confirmar Orden</button>
                </div>
            </div>
        </div>
    `;
}

// ─── Lógica del carrito ───────────────────────────────────────────────────────
window.agregarAlCarrito = (e) => {
    e.preventDefault(); 
    const pid = parseInt(e.target.pid.value); 
    const q = parseFloat(e.target.qty.value);
    
    if (pid && q) { 
        const p = DB.productos.find(x => x.id === pid);
        const ex = AppState.cart.find(x => x.productoId === pid);
        if (ex) ex.cant += q; 
        else AppState.cart.push({ productoId: p.id, nombre: p.nombre, precio: p.precio, cant: q });
        window.render(); 
    } else {
        showNotification('Selecciona producto y cantidad', 'error');
    }
};

// ─── Guardar OC en la nube ────────────────────────────────────────────────────
window.generarOC = async (e) => {
    if (!AppState.cart.length) return showNotification('El carrito está vacío', 'error');
    const btn = e.target.closest('button'); 
    btn.disabled = true; 
    btn.innerHTML = SPINNER_ICON + " Procesando...";
    
    const subtotal = AppState.cart.reduce((s, i) => s + (i.precio * i.cant), 0);
    const total = subtotal * (1 + (DB.configuracion?.iva || 0.16));
    const numeroOC = `OC-${Date.now().toString().slice(-6)}`;

    const nuevaOrden = {
        numero: numeroOC,
        proveedor: AppState.tempData.proveedor.nombre,
        fecha: new Date().toISOString(),
        estado: 'pendiente',
        total,
        items: AppState.cart,
        referencia: 'Orden manual',
        usuario: AppState.user?.nombre || 'Sistema'
    };

    try {
        const { data, error } = await supabase.from('ordenes_compra').insert(nuevaOrden).select();
        if (error) throw error;

        AppState.cart = []; 
        AppState.tempData = {}; 
        
        await cargarDatosDeNube(); 
        showNotification(`¡Orden ${nuevaOrden.numero} creada con éxito!`, 'success');
        AppState.comprasTab = 'historial';
        window.render();
        
    } catch (err) {
        console.error(err);
        showNotification('Error al crear orden: ' + err.message, 'error');
        btn.disabled = false; 
        btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> Confirmar Orden';
        if(window.lucide) window.lucide.createIcons();
    }
};

// ==========================================
// 2. PANTALLA: RECEPCIÓN DE MERCANCÍA
// ==========================================
export function renderEntradasMercancia() {
    const todasLasOrdenes = DB.ordenes_compra || DB.ordenesCompra || [];
    const pendientes = todasLasOrdenes.filter(o => (o.estado || '').toLowerCase().trim() === 'pendiente');
    const recibidas = todasLasOrdenes.filter(o => {
        const est = (o.estado || '').toLowerCase().trim();
        return est === 'recibida' || est === 'completada';
    }).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

    const tabActual = AppState.entradasTab || 'pendientes';

    const tabsHTML = `
        <div class="flex gap-3 mb-6 border-b border-slate-200 pb-0">
            <button onclick="AppState.entradasTab='pendientes'; window.render()"
                class="px-5 py-3 font-bold text-sm border-b-2 transition-colors ${tabActual==='pendientes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}">
                📦 Pendientes por Recibir
                ${pendientes.length > 0 ? `<span class="ml-2 bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">${pendientes.length}</span>` : ''}
            </button>
            <button onclick="AppState.entradasTab='historial'; window.render()"
                class="px-5 py-3 font-bold text-sm border-b-2 transition-colors ${tabActual==='historial' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-400 hover:text-slate-600'}">
                📋 Historial de Recepciones
                <span class="ml-2 bg-slate-200 text-slate-600 text-[10px] font-black px-2 py-0.5 rounded-full">${recibidas.length}</span>
            </button>
        </div>`;

    if (tabActual === 'historial') {
        return `
            <div class="animate-fade-in pb-20 mt-4">
                ${tabsHTML}
                ${recibidas.length === 0 ? `
                    <div class="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div class="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="inbox" class="text-slate-400 w-8 h-8"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">Sin recepciones aún</h3>
                        <p class="text-gray-500">Aquí aparecerán las órdenes que hayas recibido en tu inventario.</p>
                    </div>
                ` : `
                    <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div class="bg-slate-50 px-6 py-3 border-b grid grid-cols-5 text-xs font-black text-slate-400 uppercase tracking-widest">
                            <span class="col-span-2">Orden</span>
                            <span>Proveedor</span>
                            <span class="text-center">Productos</span>
                            <span class="text-right">Total</span>
                        </div>
                        ${recibidas.map(o => {
                            const folio = o.numero || ('OC-00' + o.id);
                            const prov = o.proveedor || o.proveedor_id || 'Automático';
                            return `
                            <div class="px-6 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors grid grid-cols-5 items-center gap-2">
                                <div class="col-span-2">
                                    <p class="font-bold text-slate-800">${folio}</p>
                                    <p class="text-xs text-slate-400">${formatDate(o.fecha)}</p>
                                </div>
                                <p class="text-sm text-slate-600 truncate font-medium">${prov}</p>
                                <p class="text-sm text-center text-slate-500">${(o.items || []).length} items</p>
                                <p class="text-sm font-black text-green-700 text-right">${formatCurrency(o.total)}</p>
                            </div>`;
                        }).join('')}
                    </div>
                `}
            </div>`;
    }

    // Tab pendientes
    return `
        <div class="animate-fade-in pb-20 mt-4">
            ${tabsHTML}
            ${pendientes.length === 0 ? `
                <div class="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div class="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="check-circle" class="text-green-600 w-8 h-8"></i></div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Todo al día</h3>
                    <p class="text-gray-500 mb-6">No hay mercancía pendiente por recibir.</p>
                    <button onclick="AppState.currentScreen='compras_crear'; window.render()" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700">Crear Nueva Orden</button>
                </div>
            ` : `
                <div class="space-y-4">
                    ${pendientes.map(o => {
                        const folio = o.numero || ('OC-00' + o.id);
                        const prov = o.proveedor || o.proveedor_id || 'Automático';
                        return `
                        <div class="bg-white p-6 rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div class="flex items-center gap-4">
                                <div class="bg-blue-100 p-3 rounded-lg"><i data-lucide="package" class="text-blue-600 w-6 h-6"></i></div>
                                <div>
                                    <h3 class="font-bold text-xl text-gray-800">${folio}</h3>
                                    <p class="text-sm text-gray-500 font-medium">${prov} &bull; ${formatDate(o.fecha)}</p>
                                    <p class="text-xs text-gray-400 mt-1">${(o.items || []).length} productos &bull; Total: <span class="font-bold text-gray-600">${formatCurrency(o.total)}</span></p>
                                    ${o.referencia ? `<p class="text-xs text-blue-500 mt-1 bg-blue-50 inline-block px-2 py-0.5 rounded">Ref: ${o.referencia}</p>` : ''}
                                </div>
                            </div>
                            <button onclick="window.recibirOC(${o.id}, event)" class="bg-green-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-700 flex items-center gap-2 w-full md:w-auto justify-center shadow-lg shadow-green-100 transition-transform active:scale-95">
                                <i data-lucide="download" class="w-5 h-5"></i> Recibir Mercancía
                            </button>
                        </div>`;
                    }).join('')}
                </div>
            `}
        </div>`;
}

// ─── Lógica para ingresar al inventario ──────────────────────────────────────
window.recibirOC = async (id, e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    btn.disabled = true; 
    btn.innerHTML = SPINNER_ICON + " Recibiendo...";

    const ordenes = DB.ordenes_compra || DB.ordenesCompra || [];
    const orden = ordenes.find(x => x.id === id);
    if (!orden) return;

    // ── B-04: Guard de doble recepción ────────────────────────────────────────
    if ((orden.estado || '').toLowerCase().trim() === 'recibida') {
        showNotification('Esta orden ya fue recibida anteriormente', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="download" class="w-5 h-5"></i> Recibir Mercancía';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    try {
        for (const item of (orden.items || [])) {
            const prod = DB.productos.find(p => p.id === item.productoId);
            if (prod) {
                const stockActual = parseFloat(prod.stock) || 0;
                // ← acepta 'cant' (OC manual) o 'cantidad' (OC auto POS)
                const cantidadComprada = parseFloat(item.cant || item.cantidad) || 0;
                
                // FIX BUG DE DECIMALES: Forzamos redondeo a máximo 3 decimales al sumar
                const nuevoStock = parseFloat((stockActual + cantidadComprada).toFixed(3));
                
                await supabase.from('productos').update({ stock: nuevoStock }).eq('id', item.productoId);
                await registrarMovimientoEnNube('Entrada', item.productoId, cantidadComprada, `Recepción ${orden.numero || 'OC-00' + orden.id}`);
            }
        }

        const { error } = await supabase.from('ordenes_compra').update({ estado: 'recibida' }).eq('id', id);
        if (error) throw error;

        await cargarDatosDeNube();
        showNotification('✅ Mercancía ingresada al inventario', 'success');
        window.render();

    } catch (err) {
        console.error(err);
        showNotification('Error en recepción: ' + err.message, 'error');
        btn.disabled = false; 
        btn.innerHTML = '<i data-lucide="download"></i> Recibir Mercancía';
        if (window.lucide) window.lucide.createIcons();
    }
};