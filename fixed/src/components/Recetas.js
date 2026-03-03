// src/components/Recetas.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { 
    formatCurrency, showNotification, SPINNER_ICON, abrirModalConfirmacion 
} from '../utils/helpers.js';

export function renderRecetas() {
    const recetas = DB.recetas || [];
    const categorias = [...new Set(recetas.map(r => r.categoria || 'Sin categoría'))];

    return `
        <div class="space-y-6 animate-fade-in pb-20 h-full">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border shadow-sm">
                <div>
                    <h2 class="text-xl font-black text-slate-800 flex items-center gap-2">
                        <i data-lucide="chef-hat" class="w-6 h-6 text-orange-500"></i> Menú y Recetas
                    </h2>
                    <p class="text-sm text-slate-500 mt-1">Configura los platillos que aparecerán en la Caja POS</p>
                </div>
                <button onclick="window.abrirModalReceta()" class="w-full sm:w-auto bg-orange-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                    <i data-lucide="plus" class="w-5 h-5"></i> <span>Nuevo Platillo</span>
                </button>
            </div>

            ${recetas.length === 0 ? `
                <div class="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                    <div class="bg-orange-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-lucide="utensils-crossed" class="w-10 h-10 text-orange-400"></i>
                    </div>
                    <h3 class="text-lg font-bold text-slate-700">Tu menú está vacío</h3>
                    <p class="text-slate-500 mt-1 mb-6">Crea tu primera receta para empezar a vender en el POS.</p>
                    <button onclick="window.abrirModalReceta()" class="text-orange-500 font-bold hover:underline">Crear primera receta</button>
                </div>
            ` : `
                <div class="space-y-8">
                    ${categorias.map(cat => {
                        const recetasCat = recetas.filter(r => (r.categoria || 'Sin categoría') === cat);
                        return `
                        <div>
                            <h3 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 border-b pb-2">
                                <i data-lucide="folder-open" class="w-4 h-4"></i> Categoría: ${cat} 
                                <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[10px] ml-2">${recetasCat.length}</span>
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                ${recetasCat.map(r => `
                                    <div class="bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow p-5 relative overflow-hidden group">
                                        <div class="absolute top-0 right-0 p-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-white via-white to-transparent pl-8">
                                            <button onclick="window.abrirModalReceta(${r.id})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                                            <button onclick="window.eliminarReceta(${r.id})" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                        </div>
                                        
                                        <div class="flex items-start gap-4 mb-4">
                                            <div class="bg-orange-100 p-3 rounded-xl flex-shrink-0">
                                                <i data-lucide="utensils" class="w-6 h-6 text-orange-600"></i>
                                            </div>
                                            <div class="min-w-0 pr-12">
                                                <h4 class="font-bold text-lg text-slate-800 truncate">${r.nombre}</h4>
                                                <p class="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded inline-block mt-1">${r.codigo_pos || 'SIN CÓDIGO'}</p>
                                            </div>
                                        </div>

                                        <div class="flex justify-between items-end mt-4 pt-4 border-t border-slate-100">
                                            <div>
                                                <p class="text-[10px] uppercase font-bold text-slate-400">Ingredientes</p>
                                                <p class="text-sm font-medium text-slate-600">${(r.ingredientes || []).length} items</p>
                                            </div>
                                            <div class="text-right">
                                                <p class="text-[10px] uppercase font-bold text-slate-400">Precio Venta</p>
                                                <p class="text-xl font-black text-emerald-600">${formatCurrency(r.precio_venta)}</p>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

// ─── LÓGICA DEL MODAL (FORMULARIO DE RECETA) ─────────────────────────────────
window.abrirModalReceta = (id = null) => {
    const r = id ? DB.recetas.find(x => x.id === id) : null;
    
    // Clonamos los ingredientes para no afectar la DB hasta que le den "Guardar"
    window._recetaActiva = {
        id: r?.id || null,
        nombre: r?.nombre || '',
        codigo_pos: r?.codigo_pos || '',
        categoria: r?.categoria || '',
        precio_venta: r?.precio_venta || '',
        ingredientes: r ? JSON.parse(JSON.stringify(r.ingredientes || [])) : []
    };

    // Obtenemos sugerencias de categorías existentes
    const categoriasExistentes = [...new Set(DB.recetas.map(x => x.categoria).filter(Boolean))];

    const content = `
        <div class="bg-slate-50 flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] overflow-hidden rounded-2xl">
            <div class="bg-white px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
                <div class="flex items-center gap-3">
                    <div class="bg-orange-100 p-2 rounded-lg"><i data-lucide="chef-hat" class="w-5 h-5 text-orange-600"></i></div>
                    <h2 class="text-xl font-bold text-slate-800">${r ? 'Editar Platillo' : 'Nuevo Platillo'}</h2>
                </div>
                <button onclick="window.closeModal()" class="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-xl transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <form id="formReceta" onsubmit="window.guardarReceta(event)" class="space-y-8">
                    
                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <i data-lucide="info" class="w-4 h-4"></i> 1. Información para el POS
                        </h3>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-bold text-slate-600 mb-1">Nombre del Platillo/Bebida *</label>
                                <input name="nombre" value="${window._recetaActiva.nombre}" required class="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none transition-shadow text-slate-800 font-medium" placeholder="Ej: Hamburguesa Clásica">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-600 mb-1">Categoría</label>
                                <select id="selectCategoria"
                                    onchange="(function(sel){ const inp=document.getElementById('inputNuevaCat'); if(sel.value==='__nueva__'){inp.classList.remove('hidden');inp.focus();}else{inp.classList.add('hidden');inp.value='';} })(this)"
                                    class="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none bg-white text-slate-800">
                                    ${categoriasExistentes.length === 0 ? '' : `<option value="" disabled ${!window._recetaActiva.categoria ? 'selected' : ''}>— Selecciona categoría —</option>`}
                                    ${categoriasExistentes.map(cat => `<option value="${cat}" ${window._recetaActiva.categoria === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                                    ${window._recetaActiva.categoria && !categoriasExistentes.includes(window._recetaActiva.categoria) ? `<option value="${window._recetaActiva.categoria}" selected>${window._recetaActiva.categoria}</option>` : ''}
                                    <option value="__nueva__">✏️ Nueva categoría...</option>
                                </select>
                                <input id="inputNuevaCat" name="categoria_nueva" placeholder="Nombre de la nueva categoría"
                                    class="hidden w-full border-2 border-orange-400 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-slate-800 mt-1">
                                <p class="text-[10px] text-slate-400 mt-1">Selecciona existente o elige "Nueva categoría" para crear una.</p>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-600 mb-1">Código Rápido (POS)</label>
                                <input name="codigo_pos" value="${window._recetaActiva.codigo_pos}" class="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none transition-shadow font-mono text-slate-800 uppercase" placeholder="Ej: HAM-01">
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <i data-lucide="list-plus" class="w-4 h-4"></i> 2. Fórmula / Ingredientes
                        </h3>
                        
                        <div class="flex flex-col sm:flex-row gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="flex-1">
                                <select id="recetaSelectIng" class="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                                    <option value="">Selecciona un ingrediente del catálogo...</option>
                                    ${DB.productos.map(p => `<option value="${p.id}" data-costo="${p.precio}" data-unidad="${p.unidad}">${p.nombre} (Costo: ${formatCurrency(p.precio)}/${p.unidad})</option>`).join('')}
                                </select>
                            </div>
                            <div class="flex gap-2">
                                <input type="number" id="recetaCantIng" step="0.001" min="0.001" placeholder="Cant." class="w-24 border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                                <button type="button" onclick="window._agregarIngredienteReceta()" class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors flex items-center gap-1 whitespace-nowrap">
                                    <i data-lucide="plus" class="w-4 h-4"></i> Agregar
                                </button>
                            </div>
                        </div>

                        <div class="border rounded-lg overflow-hidden">
                            <table class="w-full text-sm text-left">
                                <thead class="bg-slate-100 text-slate-500 text-[11px] uppercase">
                                    <tr>
                                        <th class="p-3 font-bold">Ingrediente</th>
                                        <th class="p-3 font-bold text-center">Cant. a descontar</th>
                                        <th class="p-3 font-bold text-right">Costo Estimado</th>
                                        <th class="p-3 text-center"></th>
                                    </tr>
                                </thead>
                                <tbody id="recetaItemsBody" class="divide-y divide-slate-100 bg-white">
                                    </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <i data-lucide="calculator" class="w-4 h-4"></i> 3. Precio y Ganancia
                        </h3>
                        
                        <div class="flex flex-col sm:flex-row gap-6 items-center">
                            <div class="flex-1 w-full">
                                <label class="block text-xs font-bold text-slate-600 mb-1">Precio de Venta al Público *</label>
                                <div class="relative">
                                    <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                                    <input type="number" id="recetaPrecioVenta" name="precio_venta" step="0.5" min="0" value="${window._recetaActiva.precio_venta}" oninput="window._calcularMargenReceta()" required class="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-400 outline-none text-xl font-black text-slate-800 transition-shadow">
                                </div>
                            </div>
                            
                            <div class="flex-1 w-full bg-slate-50 rounded-xl p-4 border border-slate-200">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs font-bold text-slate-500">Costo de Producción:</span>
                                    <span id="recetaCostoTotal" class="font-bold text-slate-700">$0.00</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs font-bold text-slate-500">Ganancia Bruta:</span>
                                    <span id="recetaGananciaBruta" class="font-black text-emerald-600">$0.00</span>
                                </div>
                                <div class="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                                    <span class="text-[10px] font-black uppercase text-slate-400">Margen %</span>
                                    <span id="recetaMargenPorcentaje" class="text-sm font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded">0%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            <div class="bg-white border-t p-4 flex gap-3 flex-shrink-0">
                <button type="button" onclick="window.closeModal()" class="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-colors">Cancelar</button>
                <button type="submit" form="formReceta" id="btnGuardarReceta" class="flex-1 bg-orange-500 text-white py-3 rounded-xl font-black hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-transform active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="save" class="w-5 h-5"></i> Guardar Platillo
                </button>
            </div>
        </div>
    `;
    
    window.openModal(content);
    window._renderIngredientesReceta(); // Dibuja la tabla inicial
};

// ─── FUNCIONES INTERNAS DEL MODAL ───────────────────────────────────────────

window._renderIngredientesReceta = () => {
    const tbody = document.getElementById('recetaItemsBody');
    if (!tbody) return;

    let costoTotal = 0;

    if (window._recetaActiva.ingredientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 text-sm italic">No has agregado ingredientes a la fórmula.</td></tr>`;
    } else {
        tbody.innerHTML = window._recetaActiva.ingredientes.map((ing, idx) => {
            const prod = DB.productos.find(p => p.id === ing.productoId);
            const nombre = prod ? prod.nombre : 'Producto Eliminado';
            const unidad = prod ? prod.unidad : '?';
            const costoUnitario = prod ? (prod.precio || 0) : 0;
            const costoRenglon = costoUnitario * ing.cantidad;
            costoTotal += costoRenglon;

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 font-medium text-slate-700">${nombre}</td>
                    <td class="p-3 text-center">
                        <span class="bg-slate-100 px-2 py-1 rounded font-mono text-xs font-bold">${ing.cantidad} ${unidad}</span>
                    </td>
                    <td class="p-3 text-right text-slate-500 font-medium">${formatCurrency(costoRenglon)}</td>
                    <td class="p-3 text-center">
                        <button type="button" onclick="window._eliminarIngredienteReceta(${idx})" class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Actualizamos la calculadora
    document.getElementById('recetaCostoTotal').textContent = formatCurrency(costoTotal);
    window._recetaActiva.costoActual = costoTotal;
    window._calcularMargenReceta();
    if(window.lucide) window.lucide.createIcons();
};

window._agregarIngredienteReceta = () => {
    const select = document.getElementById('recetaSelectIng');
    const inputCant = document.getElementById('recetaCantIng');
    
    const pid = parseInt(select.value);
    const cant = parseFloat(inputCant.value);

    if (!pid || isNaN(cant) || cant <= 0) {
        return showNotification('Selecciona un ingrediente y pon una cantidad válida', 'error');
    }

    // Buscamos si ya está en la lista para sumarlo
    const existente = window._recetaActiva.ingredientes.find(i => i.productoId === pid);
    if (existente) {
        existente.cantidad += cant;
    } else {
        window._recetaActiva.ingredientes.push({ productoId: pid, cantidad: cant });
    }

    // Limpiamos los campos y redibujamos
    select.value = '';
    inputCant.value = '';
    window._renderIngredientesReceta();
};

window._eliminarIngredienteReceta = (idx) => {
    window._recetaActiva.ingredientes.splice(idx, 1);
    window._renderIngredientesReceta();
};

window._calcularMargenReceta = () => {
    const inputPrecio = document.getElementById('recetaPrecioVenta');
    const elGanancia = document.getElementById('recetaGananciaBruta');
    const elMargen = document.getElementById('recetaMargenPorcentaje');
    
    if(!inputPrecio || !elGanancia || !elMargen) return;

    const precioVenta = parseFloat(inputPrecio.value) || 0;
    const costo = window._recetaActiva.costoActual || 0;
    
    const ganancia = precioVenta - costo;
    let margen = 0;
    if (precioVenta > 0) {
        margen = (ganancia / precioVenta) * 100;
    }

    elGanancia.textContent = formatCurrency(ganancia);
    
    // Colores dinámicos para el margen
    elMargen.textContent = `${margen.toFixed(1)}%`;
    if (margen <= 0) {
        elMargen.className = "text-sm font-black text-red-600 bg-red-100 px-2 py-0.5 rounded";
    } else if (margen < 30) {
        elMargen.className = "text-sm font-black text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded"; // 30% es un estándar mínimo en restaurantes
    } else {
        elMargen.className = "text-sm font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded";
    }
};

// ─── GUARDAR Y ELIMINAR EN BASE DE DATOS ──────────────────────────────────────

window.guardarReceta = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnGuardarReceta');
    
    if (window._recetaActiva.ingredientes.length === 0) {
        return showNotification('La receta debe tener al menos un ingrediente para descontar del inventario', 'error');
    }

    btn.disabled = true;
    btn.innerHTML = SPINNER_ICON + ' Guardando...';

    const formData = new FormData(e.target);
    const datosReceta = {
        nombre: formData.get('nombre').trim(),
        codigo_pos: formData.get('codigo_pos').trim().toUpperCase(),
        categoria: (() => { const sel = document.getElementById('selectCategoria'); const v = sel ? sel.value : ''; return v === '__nueva__' ? (formData.get('categoria_nueva') || '').trim() : v; })(),
        precio_venta: parseFloat(formData.get('precio_venta')),
        ingredientes: window._recetaActiva.ingredientes
    };

    // Si estábamos editando, le devolvemos su ID
    if (window._recetaActiva.id) {
        datosReceta.id = window._recetaActiva.id;
    }

    try {
        const { error } = await supabase.from('recetas').upsert(datosReceta);
        if (error) throw error;

        await cargarDatosDeNube();
        window.closeModal();
        showNotification('Receta guardada exitosamente', 'success');
        window.render();
    } catch (err) {
        console.error(err);
        showNotification('Error al guardar: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Guardar Platillo';
        if(window.lucide) window.lucide.createIcons();
    }
};

window.eliminarReceta = (id) => {
    abrirModalConfirmacion(
        'Eliminar Receta', 
        '¿Estás seguro de eliminar este platillo? Ya no aparecerá en la caja POS.',
        async () => {
            try {
                const { error } = await supabase.from('recetas').delete().eq('id', id);
                if (error) throw error;
                await cargarDatosDeNube();
                showNotification('Receta eliminada correctamente', 'success');
                window.render();
            } catch (err) {
                showNotification('Error al eliminar: ' + err.message, 'error');
            }
        }
    );
};