// src/components/Proveedores.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { 
    formatCurrency, formatDate, showNotification, 
    SPINNER_ICON, abrirModalConfirmacion 
} from '../utils/helpers.js';

export function renderProveedores() {
    const activos = DB.proveedores.filter(p => p.activo !== false);
    const inactivos = DB.proveedores.filter(p => p.activo === false);

    const cardProveedor = (p, esActivo) => {
        // Estadísticas rápidas del proveedor
        const ordenes = (DB.ordenesCompra || []).filter(o => o.proveedor === p.nombre);
        const totalComprado = ordenes.reduce((s, o) => s + (o.total || 0), 0);
        const ultimaCompra = ordenes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];

        return `
        <div class="bg-white p-6 rounded-xl border ${esActivo ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-75'} shadow-sm hover:shadow-md transition-all relative overflow-hidden">
            ${!esActivo ? '<div class="absolute top-0 right-0 bg-gray-200 text-gray-500 text-xs px-2 py-1 rounded-bl-lg font-bold">INACTIVO</div>' : ''}
            
            <div class="flex justify-between items-start mb-4">
                <div class="${esActivo ? 'bg-purple-100' : 'bg-gray-200'} p-3 rounded-full">
                    <i data-lucide="${esActivo ? 'truck' : 'archive'}" class="${esActivo ? 'text-purple-600' : 'text-gray-500'} w-6 h-6"></i>
                </div>
                <div class="flex gap-1">
                    <button onclick="window.verHistorialProveedor(${p.id})" class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver Historial">
                        <i data-lucide="history" class="w-4 h-4"></i>
                    </button>
                    <button onclick="window.abrirModalProveedor(${p.id})" class="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Editar">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                    </button>
                    ${esActivo 
                        ? `<button onclick="window.cambiarEstadoProveedor(${p.id}, false)" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Archivar">
                            <i data-lucide="archive" class="w-4 h-4"></i>
                        </button>`
                        : `<button onclick="window.cambiarEstadoProveedor(${p.id}, true)" class="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Reactivar">
                            <i data-lucide="refresh-ccw" class="w-4 h-4"></i>
                        </button>`
                    }
                </div>
            </div>
            
            <h3 class="font-bold text-xl text-gray-800 mb-1">${p.nombre}</h3>

            <div class="space-y-1.5 text-sm text-gray-600 mb-4">
                <div class="flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-gray-400"></i> ${p.contacto}</div>
                <div class="flex items-center gap-2"><i data-lucide="phone" class="w-4 h-4 text-gray-400"></i> ${p.telefono}</div>
                <div class="flex items-center gap-2"><i data-lucide="mail" class="w-4 h-4 text-gray-400"></i> ${p.email || '---'}</div>
            </div>

            <!-- Estadísticas rápidas -->
            <div class="border-t pt-3 mt-3 grid grid-cols-2 gap-3 text-center text-xs">
                <div class="bg-gray-50 rounded-lg p-2">
                    <p class="text-gray-400 font-bold uppercase">Órdenes</p>
                    <p class="font-black text-gray-700 text-lg">${ordenes.length}</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-2">
                    <p class="text-gray-400 font-bold uppercase">Total</p>
                    <p class="font-black text-gray-700">${formatCurrency(totalComprado)}</p>
                </div>
            </div>
            ${ultimaCompra ? `<p class="text-xs text-gray-400 mt-2 text-center">Última compra: ${formatDate(ultimaCompra.fecha)}</p>` : ''}

            <!-- Botón Nueva OC -->
            ${esActivo ? `
            <button onclick="window.nuevaOCProveedor(${p.id})"
                class="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm shadow-purple-100">
                <i data-lucide="plus" class="w-4 h-4"></i> Nueva Orden de Compra
            </button>` : ''}
        </div>
    `};

    return `
        <div class="space-y-8 animate-fade-in pb-20">
            <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold text-gray-800">Directorio de Proveedores</h2>
                <button onclick="window.abrirModalProveedor()" class="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-purple-700 transition-colors flex items-center gap-2">
                    <i data-lucide="plus" class="w-5 h-5"></i> <span>Nuevo</span>
                </button>
            </div>

            <div>
                <h3 class="text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">Activos (${activos.length})</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${activos.length ? activos.map(p => cardProveedor(p, true)).join('') : '<p class="text-gray-400 italic">No hay proveedores activos.</p>'}
                </div>
            </div>

            ${inactivos.length > 0 ? `
                <div class="pt-8 opacity-80 hover:opacity-100 transition-opacity">
                    <h3 class="text-sm font-bold text-gray-400 uppercase mb-4 border-b pb-2 flex items-center gap-2">
                        <i data-lucide="archive" class="w-4 h-4"></i> Archivados / Inactivos (${inactivos.length})
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        ${inactivos.map(p => cardProveedor(p, false)).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// ─── Nueva OC directa desde proveedor ────────────────────────────────────────
window.nuevaOCProveedor = (id) => {
    const prov = DB.proveedores.find(p => p.id === id);
    if (!prov) return;

    // Productos que se le han comprado antes a este proveedor
    const ordenesPrev = (DB.ordenesCompra || []).filter(o => o.proveedor === prov.nombre);
    const conteoProductos = {};
    ordenesPrev.forEach(o => {
        (o.items || []).forEach(item => {
            const key = item.productoId || item.nombre;
            conteoProductos[key] = (conteoProductos[key] || 0) + 1;
        });
    });

    // Productos más frecuentes de este proveedor
    const productosFrec = Object.entries(conteoProductos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key]) => {
            const prod = DB.productos.find(p => p.id === parseInt(key) || p.nombre === key);
            return prod;
        }).filter(Boolean);

    const content = `
        <div class="p-8">
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-purple-100 p-2 rounded-lg">
                    <i data-lucide="truck" class="w-6 h-6 text-purple-600"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">Nueva Orden de Compra</h2>
                    <p class="text-gray-500 text-sm">Proveedor: <b>${prov.nombre}</b></p>
                </div>
            </div>

            <!-- Productos frecuentes como acceso rápido -->
            ${productosFrec.length > 0 ? `
            <div class="mb-5">
                <p class="text-xs font-bold text-gray-500 uppercase mb-2">Compras frecuentes a este proveedor</p>
                <div class="flex flex-wrap gap-2">
                    ${productosFrec.map(p => `
                        <button onclick="window.ocAgregarProductoRapido(${p.id})"
                            class="px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-1">
                            <i data-lucide="plus" class="w-3 h-3"></i> ${p.nombre}
                            <span class="text-purple-400 font-normal">${formatCurrency(p.precio)}</span>
                        </button>
                    `).join('')}
                </div>
            </div>` : ''}

            <!-- Agregar producto -->
            <div class="bg-gray-50 rounded-xl p-4 mb-4">
                <p class="text-xs font-bold text-gray-500 uppercase mb-3">Agregar producto</p>
                <div class="flex gap-2">
                    <select id="ocProdSelect" class="flex-1 border p-2 rounded-lg bg-white text-sm focus:ring-2 focus:ring-purple-400 outline-none">
                        <option value="">Seleccionar producto...</option>
                        ${DB.productos.map(p => `<option value="${p.id}" data-precio="${p.precio}" data-nombre="${p.nombre}" data-unidad="${p.unidad}">${p.nombre} — ${formatCurrency(p.precio)}/${p.unidad}</option>`).join('')}
                    </select>
                    <input type="number" id="ocCantInput" min="0.1" step="0.1" placeholder="Cant." class="w-24 border p-2 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none">
                    <button onclick="window.ocAgregarProducto()"
                        class="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 text-sm flex items-center gap-1">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <!-- Lista de items -->
            <div id="ocItemsLista" class="space-y-2 mb-4 min-h-[60px]">
                <p class="text-center text-gray-400 text-sm py-4" id="ocListaVacia">Agrega productos a la orden</p>
            </div>

            <!-- Total -->
            <div class="border-t pt-3 flex justify-between items-center mb-5">
                <span class="font-bold text-gray-600">Total estimado</span>
                <span id="ocTotal" class="text-2xl font-black text-gray-900">$0.00</span>
            </div>

            <div class="flex gap-3">
                <button onclick="closeModal()" class="flex-1 border py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button onclick="window.ocConfirmar('${prov.nombre}', '${prov.id}')" id="btnOCConfirmar"
                    class="flex-1 bg-purple-600 text-white py-3 rounded-xl font-black hover:bg-purple-700 flex items-center justify-center gap-2">
                    <i data-lucide="check-circle" class="w-5 h-5"></i> Confirmar Orden
                </button>
            </div>
        </div>
    `;
    window.openModal(content);

    // Estado local del modal
    window._ocItems = [];
    window._ocRenderItems = () => {
        const lista = document.getElementById('ocItemsLista');
        const vacia = document.getElementById('ocListaVacia');
        const totalEl = document.getElementById('ocTotal');
        if (!lista) return;

        if (window._ocItems.length === 0) {
            lista.innerHTML = `<p class="text-center text-gray-400 text-sm py-4" id="ocListaVacia">Agrega productos a la orden</p>`;
            if (totalEl) totalEl.textContent = '$0.00';
            return;
        }

        lista.innerHTML = window._ocItems.map((item, idx) => `
            <div class="flex items-center gap-3 bg-white border rounded-xl px-4 py-3">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm text-gray-800">${item.nombre}</p>
                    <p class="text-xs text-gray-500">${formatCurrency(item.precio)} / ${item.unidad}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="window._ocCambiarCant(${idx}, -1)" class="w-7 h-7 rounded-full border bg-gray-50 hover:bg-red-50 hover:text-red-500 font-black text-gray-600 flex items-center justify-center">−</button>
                    <span class="w-10 text-center font-black text-gray-800">${item.cant}</span>
                    <button onclick="window._ocCambiarCant(${idx}, 1)" class="w-7 h-7 rounded-full border bg-gray-50 hover:bg-green-50 hover:text-green-500 font-black text-gray-600 flex items-center justify-center">+</button>
                </div>
                <span class="w-20 text-right font-black text-gray-800">${formatCurrency(item.cant * item.precio)}</span>
                <button onclick="window._ocEliminar(${idx})" class="text-red-400 hover:text-red-600 p-1">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
        `).join('');

        const total = window._ocItems.reduce((s, i) => s + i.cant * i.precio, 0);
        if (totalEl) totalEl.textContent = formatCurrency(total);
        if (window.lucide) window.lucide.createIcons();
    };

    window._ocCambiarCant = (idx, delta) => {
        window._ocItems[idx].cant = Math.max(1, window._ocItems[idx].cant + delta);
        window._ocRenderItems();
    };

    window._ocEliminar = (idx) => {
        window._ocItems.splice(idx, 1);
        window._ocRenderItems();
    };
};

window.ocAgregarProducto = () => {
    const sel = document.getElementById('ocProdSelect');
    const cantInput = document.getElementById('ocCantInput');
    if (!sel || !sel.value) return showNotification('Selecciona un producto', 'error');
    const cant = parseFloat(cantInput?.value) || 1;
    const opt = sel.options[sel.selectedIndex];
    const id = parseInt(sel.value);

    const existente = window._ocItems.find(i => i.productoId === id);
    if (existente) {
        existente.cant += cant;
    } else {
        window._ocItems.push({
            productoId: id,
            nombre: opt.dataset.nombre,
            precio: parseFloat(opt.dataset.precio),
            unidad: opt.dataset.unidad,
            cant
        });
    }

    sel.value = '';
    if (cantInput) cantInput.value = '';
    window._ocRenderItems();
};

window.ocAgregarProductoRapido = (productoId) => {
    const prod = DB.productos.find(p => p.id === productoId);
    if (!prod) return;

    const existente = window._ocItems.find(i => i.productoId === prod.id);
    if (existente) {
        existente.cant++;
    } else {
        window._ocItems.push({
            productoId: prod.id,
            nombre: prod.nombre,
            precio: prod.precio,
            unidad: prod.unidad,
            cant: 1
        });
    }
    window._ocRenderItems();
};

window.ocConfirmar = async (provNombre, provId) => {
    if (!window._ocItems || window._ocItems.length === 0) {
        return showNotification('Agrega al menos un producto', 'error');
    }

    const btn = document.getElementById('btnOCConfirmar');
    if (btn) { btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Guardando...'; }

    const items = window._ocItems.map(i => ({
        productoId: i.productoId,
        nombre: i.nombre,
        cant: i.cant,
        cantidad: i.cant, // compatibilidad con recibirOC
        precio: i.precio,
        unidad: i.unidad
    }));

    const total = items.reduce((s, i) => s + i.cant * i.precio, 0);
    const numeroOC = `OC-${Date.now().toString().slice(-6)}`;

    try {
        const { error } = await supabase.from('ordenes_compra').insert({
            numero: numeroOC,
            proveedor: provNombre,
            estado: 'pendiente',
            items,
            total,
            fecha: new Date().toISOString(),
            referencia: 'Orden desde proveedor',
            usuario: AppState.user?.nombre || 'Sistema'
        });
        if (error) throw error;

        await cargarDatosDeNube();
        window.closeModal();
        showNotification(`✅ Orden ${numeroOC} creada para ${provNombre}`, 'success');
        window.render();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle"></i> Confirmar Orden'; }
    }
};

// ─── Modal Crear/Editar Proveedor ─────────────────────────────────────────────
window.abrirModalProveedor = (id = null) => {
    const p = id ? DB.proveedores.find(x => x.id === id) : null;
    const content = `
        <div class="p-8">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">${p ? 'Editar' : 'Nuevo'} Proveedor</h2>
            <form id="formProv" class="space-y-4">
                <input type="hidden" name="id" value="${p?.id || ''}">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                    <input name="nombre" value="${p?.nombre || ''}" required class="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Contacto</label>
                        <input name="contacto" value="${p?.contacto || ''}" required class="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                        <input name="telefono" value="${p?.telefono || ''}" required class="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input name="email" value="${p?.email || ''}" class="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <textarea name="direccion" class="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none">${p?.direccion || ''}</textarea>
                </div>
                <button type="submit" class="w-full bg-purple-600 text-white py-3 rounded-lg font-bold mt-4 hover:bg-purple-700 flex justify-center transition-colors">
                    Guardar Proveedor
                </button>
            </form>
        </div>
    `;
    window.openModal(content);

    document.getElementById('formProv').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Guardando...';

        const fd = new FormData(e.target);
        const datos = Object.fromEntries(fd.entries());
        if (datos.id) datos.id = parseInt(datos.id); else delete datos.id;

        try {
            const { error } = await supabase.from('proveedores').upsert(datos);
            if (error) throw error;
            await cargarDatosDeNube();
            window.closeModal();
            showNotification('Proveedor guardado correctamente', 'success');
            window.render();
        } catch (err) {
            showNotification('Error: ' + err.message, 'error');
            btn.disabled = false; btn.innerHTML = 'Guardar Proveedor';
        }
    };
};

// ─── Cambiar estado ───────────────────────────────────────────────────────────
window.cambiarEstadoProveedor = async (id, nuevoEstado) => {
    const accion = nuevoEstado ? 'Reactivar' : 'Archivar';
    const mensaje = nuevoEstado 
        ? 'El proveedor volverá a aparecer en las listas de compra.' 
        : 'Se moverá a la lista de inactivos y no podrás comprarle hasta reactivarlo.';

    abrirModalConfirmacion(`${accion} Proveedor`, mensaje, async () => {
        try {
            const { error } = await supabase.from('proveedores').update({ activo: nuevoEstado }).eq('id', id);
            if (error) throw error;
            await cargarDatosDeNube();
            showNotification(`Proveedor ${nuevoEstado ? 'reactivado' : 'archivado'} correctamente`, 'success');
            window.render();
        } catch (err) {
            showNotification('Error: ' + err.message, 'error');
        }
    });
};

// ─── Historial del proveedor ──────────────────────────────────────────────────
window.verHistorialProveedor = (id) => {
    const prov = DB.proveedores.find(p => p.id === id);
    if (!prov) return;

    const historial = (DB.ordenesCompra || [])
        .filter(o => o.proveedor === prov.nombre)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const totalComprado = historial.reduce((acc, o) => acc + (o.total || 0), 0);

    // Productos más comprados a este proveedor
    const conteo = {};
    historial.forEach(o => {
        (o.items || []).forEach(item => {
            conteo[item.nombre] = (conteo[item.nombre] || 0) + (item.cant || item.cantidad || 0);
        });
    });
    const topProductos = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const content = `
        <div class="p-6">
            <div class="flex justify-between items-start mb-5 border-b pb-4">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">${prov.nombre}</h2>
                    <p class="text-gray-500 text-sm">${prov.contacto} · ${prov.telefono}</p>
                    ${prov.email ? `<p class="text-gray-400 text-xs">${prov.email}</p>` : ''}
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold text-gray-400 uppercase">Total histórico</p>
                    <p class="text-2xl font-black text-purple-600">${formatCurrency(totalComprado)}</p>
                    <p class="text-xs text-gray-400">${historial.length} órdenes</p>
                </div>
            </div>

            <!-- Top productos -->
            ${topProductos.length > 0 ? `
            <div class="mb-5">
                <p class="text-xs font-bold text-gray-500 uppercase mb-2">Productos más comprados</p>
                <div class="flex flex-wrap gap-2">
                    ${topProductos.map(([nombre, cant]) => `
                        <span class="px-3 py-1 bg-purple-50 border border-purple-100 text-purple-700 text-xs font-bold rounded-full">
                            ${nombre} <span class="text-purple-400 font-normal">× ${cant}</span>
                        </span>
                    `).join('')}
                </div>
            </div>` : ''}

            <!-- Historial de órdenes -->
            ${historial.length === 0 ? `
                <div class="text-center py-10 text-gray-400 bg-gray-50 rounded-xl">
                    <i data-lucide="clipboard-x" class="w-12 h-12 mx-auto mb-2 opacity-50"></i>
                    <p>No hay órdenes de compra registradas.</p>
                </div>` 
                : `
                <div class="rounded-xl border shadow-sm max-h-64 overflow-y-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-gray-100 text-gray-600 uppercase font-bold sticky top-0">
                            <tr>
                                <th class="p-3">Folio</th>
                                <th class="p-3">Fecha</th>
                                <th class="p-3 text-center">Estado</th>
                                <th class="p-3 text-right">Monto</th>
                                <th class="p-3 text-center">Enviar</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 bg-white">
                            ${historial.map(o => `
                                <tr class="hover:bg-gray-50">
                                    <td class="p-3 font-mono font-bold text-gray-700">${o.numero || 'OC-00' + o.id}</td>
                                    <td class="p-3 text-gray-600">${formatDate(o.fecha)}</td>
                                    <td class="p-3 text-center">
                                        <span class="px-2 py-1 rounded-full text-xs font-bold ${(o.estado || '').toLowerCase() === 'pendiente' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}">
                                            ${o.estado || 'pendiente'}
                                        </span>
                                    </td>
                                    <td class="p-3 text-right font-bold">${formatCurrency(o.total)}</td>
                                    <td class="p-3 text-center">
                                        <div class="flex justify-center gap-1">
                                            <button onclick="window.enviarPorWhatsApp(${o.id})" class="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-200" title="WhatsApp">
                                                <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                            </button>
                                            <button onclick="window.enviarPorCorreo(${o.id})" class="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200" title="Correo">
                                                <i data-lucide="mail" class="w-4 h-4"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`
            }

            <div class="mt-5 flex gap-3">
                <button onclick="window.closeModal()" class="flex-1 border py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Cerrar</button>
                <button onclick="window.closeModal(); window.nuevaOCProveedor(${prov.id})"
                    class="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-bold hover:bg-purple-700 flex items-center justify-center gap-2">
                    <i data-lucide="plus" class="w-4 h-4"></i> Nueva Orden
                </button>
            </div>
        </div>
    `;
    window.openModal(content);
};

// ─── Utilidades de envío ──────────────────────────────────────────────────────
window.enviarPorWhatsApp = (ordenId) => {
    const orden = (DB.ordenesCompra || []).find(o => o.id === ordenId);
    const prov = DB.proveedores.find(p => p.nombre === orden?.proveedor);
    if (!prov || !prov.telefono) return showNotification('Proveedor sin teléfono registrado', 'error');

    let numero = prov.telefono.replace(/[^0-9]/g, '');
    if (numero.length === 10) numero = '52' + numero;

    let mensaje = `Hola *${prov.nombre}*, le envío la Orden de Compra *${orden.numero || 'OC-00' + orden.id}*:\n\n`;
    (orden.items || []).forEach(i => {
        const cant = i.cant || i.cantidad || 0;
        mensaje += `▪️ ${cant} ${i.unidad || ''} × ${i.nombre}\n`;
    });
    mensaje += `\n*Total Estimado: ${formatCurrency(orden.total)}*\n\nQuedamos pendientes de confirmación.`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank');
};

window.enviarPorCorreo = (ordenId) => {
    const orden = (DB.ordenesCompra || []).find(o => o.id === ordenId);
    const prov = DB.proveedores.find(p => p.nombre === orden?.proveedor);
    if (!prov || !prov.email) return showNotification('Proveedor sin email registrado', 'error');

    const asunto = `Orden de Compra ${orden.numero || 'OC-00' + orden.id} - ${DB.configuracion.nombreEmpresa}`;
    let cuerpo = `Estimados ${prov.nombre},\n\nPor medio de la presente solicitamos el siguiente pedido:\n\n`;
    (orden.items || []).forEach(i => {
        const cant = i.cant || i.cantidad || 0;
        cuerpo += `- ${cant} ${i.unidad || ''} de ${i.nombre}\n`;
    });
    cuerpo += `\nTotal estimado: ${formatCurrency(orden.total)}\n\nFavor de confirmar recepción.\n\nAtt. ${AppState.user?.nombre || DB.configuracion.nombreEmpresa}`;

    window.location.href = `mailto:${prov.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
};