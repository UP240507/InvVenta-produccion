// src/components/Productos.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { 
    formatCurrency, showNotification, SPINNER_ICON, 
    renderPaginacion, abrirModalConfirmacion, 
    ITEMS_PER_PAGE, registrarMovimientoEnNube 
} from '../utils/helpers.js';

export function renderProductos() {
    const esAdmin = AppState.user.rol === 'Admin';
    
    // --- LÓGICA DE LA TABLA Y FILTROS ---
    window.actualizarTablaProductos = () => {
        const term = document.getElementById('txtSearch')?.value || '';
        const cat = document.getElementById('selCat')?.value || '';
        
        AppState.searchTerm = term;
        AppState.filterCategory = cat;

        const filtered = DB.productos.filter(p => {
            const coincideTexto = p.nombre.toLowerCase().includes(term.toLowerCase()) || 
                                  p.codigo.toLowerCase().includes(term.toLowerCase());
            const coincideCat = cat === '' || p.cat === cat;
            return coincideTexto && coincideCat;
        });

        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (AppState.productosPage > totalPages && totalPages > 0) AppState.productosPage = 1;
        
        const list = filtered.slice((AppState.productosPage-1)*ITEMS_PER_PAGE, AppState.productosPage*ITEMS_PER_PAGE);

        const rowsHTML = list.length > 0 ? list.map(p => `
            <tr class="hover:bg-gray-50 transition-colors group border-b border-gray-100">
                <td class="p-4 font-mono text-gray-500 group-hover:text-blue-600">${p.codigo}</td>
                <td class="p-4 font-bold text-gray-800">${p.nombre}</td>
                <td class="p-4 text-gray-600"><span class="bg-gray-100 px-2 py-1 rounded text-xs border">${p.cat}</span></td>
                <td class="p-4 text-center font-bold ${p.stock <= p.min ? 'text-red-600 bg-red-50 rounded-lg' : 'text-gray-800'}">${Number.isInteger(p.stock) ? p.stock : parseFloat(p.stock.toFixed(4))} <span class="text-xs font-normal text-gray-500">${p.unidad}</span></td>
                <td class="p-4 text-right font-medium text-gray-600">${formatCurrency(p.precio)}</td>
                ${esAdmin ? `
                <td class="p-4 text-center flex justify-center gap-2">
                    <button onclick="window.abrirModalProducto(${p.id})" class="text-blue-600 hover:bg-blue-50 p-2 rounded-lg" title="Editar"><i data-lucide="edit" class="w-4 h-4"></i></button>
                    <button onclick="window.eliminarProducto(${p.id})" class="text-red-600 hover:bg-red-50 p-2 rounded-lg" title="Eliminar"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>` : ''}
            </tr>
        `).join('') : `<tr><td colspan="6" class="p-10 text-center text-gray-400">No se encontraron productos con estos filtros.</td></tr>`;

        const tbody = document.getElementById('tbodyProductos');
        if(tbody) tbody.innerHTML = rowsHTML;

        const pagDiv = document.getElementById('paginacionProductos');
        if(pagDiv) pagDiv.innerHTML = renderPaginacion(totalItems, ITEMS_PER_PAGE, AppState.productosPage, 'productos');
        
        if(window.lucide) window.lucide.createIcons();
    };

    // Función para cambiar de página (Se sobreescribe globalmente para que funcione en otras tablas luego)
    window.cambiarPagina = (screen, page) => {
        if(screen === 'productos') {
            AppState.productosPage = page;
            window.actualizarTablaProductos();
        }
    };

    // --- ELIMINAR PRODUCTO ---
    window.eliminarProducto = async (id) => {
        const enReceta = DB.recetas.some(r => r.ingredientes.some(i => String(i.productoId) === String(id)));
        if(enReceta) return showNotification('No se puede eliminar: Es ingrediente de una receta.', 'error');

        abrirModalConfirmacion('Eliminar Producto', '¿Estás seguro? Esta acción es permanente.', async () => {
            try {
                const { error } = await supabase.from('productos').delete().eq('id', id);
                if (error) {
                    if(error.code === '23503') showNotification('No se puede borrar: El producto tiene historial.', 'error');
                    else throw error;
                } else {
                    await cargarDatosDeNube();
                    showNotification('Producto eliminado', 'success');
                    window.actualizarTablaProductos();
                }
            } catch (err) {
                showNotification('Error al eliminar: ' + err.message, 'error');
            }
        });
    };

    // --- MODAL CREAR / EDITAR ---
    window.abrirModalProducto = (id = null) => {
        const p = id ? DB.productos.find(x => x.id === id) : null;
        const content = `
            <div class="p-8">
                <h2 class="text-2xl font-bold mb-6 text-gray-800">${p ? 'Editar' : 'Nuevo'} Producto</h2>
                <form id="formProducto" class="space-y-4">
                    <input type="hidden" name="id" value="${p?.id || ''}">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Código</label>
                            <input name="codigo" value="${p?.codigo || ''}" required class="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Categoría</label>
                            <select name="cat" class="w-full border p-2 rounded-lg bg-white">
                                ${DB.categorias.map(c => `<option value="${c}" ${p?.cat===c?'selected':''}>${c}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Nombre del Producto</label>
                        <input name="nombre" value="${p?.nombre || ''}" required class="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Precio</label>
                            <input type="number" name="precio" step="0.01" value="${p?.precio || ''}" required class="w-full border p-2 rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Stock Mínimo</label>
                            <input type="number" name="min" step="0.1" value="${p?.min || ''}" required class="w-full border p-2 rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Unidad</label>
                            <select name="unidad" class="w-full border p-2 rounded-lg bg-white">
                                ${DB.unidades.map(u => `<option value="${u}" ${p?.unidad===u?'selected':''}>${u}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    ${!p ? `<div><label class="block text-sm font-medium text-gray-700">Stock Inicial</label><input type="number" name="stock" step="0.1" value="0" class="w-full border p-2 rounded-lg"></div>` : ''}
                    
                    <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold mt-4 hover:bg-blue-700 flex justify-center">Guardar Producto</button>
                </form>
            </div>
        `;
        window.openModal(content);

        // Lógica de guardado al dar click
        document.getElementById('formProducto').onsubmit = async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Guardando...';
            
            const fd = new FormData(e.target);
            const datos = {
                codigo: fd.get('codigo'),
                nombre: fd.get('nombre'),
                cat: fd.get('cat'),
                precio: parseFloat(fd.get('precio')),
                min: parseFloat(fd.get('min')),
                unidad: fd.get('unidad'),
                ...( !fd.get('id') && { stock: parseFloat(fd.get('stock') || 0) } )
            };

            if (fd.get('id')) datos.id = parseInt(fd.get('id'));

            try {
                const { data, error } = await supabase.from('productos').upsert(datos).select();
                if (error) throw error;

                // Si es nuevo y le pusimos stock, guardamos el registro en el historial (Kardex)
                if (!datos.id && datos.stock > 0) {
                    const nuevoId = data[0].id; 
                    await registrarMovimientoEnNube('Entrada', nuevoId, datos.stock, 'Stock Inicial');
                }

                await cargarDatosDeNube(); // Descargar cambios frescos
                window.closeModal();
                showNotification('Producto guardado correctamente', 'success');
                window.actualizarTablaProductos(); // Refresca la tabla

            } catch (err) {
                showNotification('Error al guardar: ' + err.message, 'error');
                btn.disabled = false; btn.innerHTML = 'Guardar Producto';
            }
        };
    };

    // Llamamos a que se llene la tabla apenas se dibuja el HTML
    setTimeout(() => {
        window.actualizarTablaProductos();
    }, 0);

    // --- ESTRUCTURA VISUAL (HTML) ---
    return `
        <div class="space-y-6 animate-fade-in">
            <div class="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                
                <div class="relative flex-1 w-full">
                    <input id="txtSearch" 
                        oninput="window.actualizarTablaProductos()" 
                        class="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors" 
                        placeholder="Buscar por nombre o código..." 
                        value="${AppState.searchTerm || ''}">
                    <i data-lucide="search" class="absolute left-3 top-2.5 text-gray-400 w-5 h-5"></i>
                </div>

                <div class="w-full md:w-64 relative">
                    <select id="selCat" 
                        onchange="window.actualizarTablaProductos()" 
                        class="w-full pl-10 pr-8 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer">
                        <option value="">Todas las Categorías</option>
                        ${DB.categorias.map(c => `<option value="${c}" ${AppState.filterCategory===c?'selected':''}>${c}</option>`).join('')}
                    </select>
                    <i data-lucide="filter" class="absolute left-3 top-2.5 text-gray-400 w-5 h-5"></i>
                    <i data-lucide="chevron-down" class="absolute right-3 top-3 text-gray-400 w-4 h-4 pointer-events-none"></i>
                </div>

                ${esAdmin ? `
                <button onclick="window.abrirModalProducto()" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap">
                    <i data-lucide="plus" class="w-5 h-5"></i> Nuevo
                </button>` : ''}
            </div>

            <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 text-left text-gray-500 uppercase">
                            <tr>
                                <th class="p-4">Código</th>
                                <th class="p-4">Nombre</th>
                                <th class="p-4">Categoría</th>
                                <th class="p-4 text-center">Stock</th>
                                <th class="p-4 text-right">Precio</th>
                                ${esAdmin ? '<th class="p-4 text-center">Acciones</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="tbodyProductos" class="divide-y divide-gray-100">
                            </tbody>
                    </table>
                </div>
                <div id="paginacionProductos"></div>
            </div>
        </div>
    `;
}