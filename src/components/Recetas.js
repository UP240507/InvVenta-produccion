// src/components/Recetas.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { formatCurrency, showNotification, SPINNER_ICON, abrirModalConfirmacion } from '../utils/helpers.js';

// ─── Helper exportado: costo real con mermas ──────────────────────────────────
export function calcularCostoReceta(receta) {
    let costo = 0;
    for (const ing of (receta.ingredientes || [])) {
        const prod = DB.productos.find(p => String(p.id) === String(ing.productoId));
        if (!prod) continue;
        const rendimiento = 1 - ((ing.merma || 0) / 100);
        if (rendimiento > 0) costo += (prod.precio / rendimiento) * ing.cantidad;
    }
    return costo;
}

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
                <button onclick="window.abrirModalReceta()" class="w-full sm:w-auto bg-orange-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:bg-orange-600 transition-all flex items-center justify-center gap-2">
                    <i data-lucide="plus" class="w-5 h-5"></i> Nuevo Platillo
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
                                <i data-lucide="folder-open" class="w-4 h-4"></i> ${cat}
                                <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[10px] ml-2">${recetasCat.length}</span>
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                ${recetasCat.map(r => {
                                    const costo = calcularCostoReceta(r);
                                    const precio = r.precio_venta || 0;
                                    const ganancia = precio - costo;
                                    const margen = precio > 0 ? (ganancia / precio) * 100 : 0;
                                    const tieneMermas = (r.ingredientes||[]).some(i => (i.merma||0) > 0);
                                    const margenColor = margen <= 0 ? 'bg-red-100 text-red-700 border-red-200' : margen < 30 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                    const margenIcon = margen <= 0 ? 'trending-down' : margen < 30 ? 'alert-triangle' : 'trending-up';
                                    const alertaBaja = margen < 30 && precio > 0;
                                    const alertaPerdida = margen <= 0 && precio > 0;

                                    return `
                                    <div class="bg-white rounded-2xl border ${alertaPerdida ? 'border-red-200' : alertaBaja ? 'border-yellow-200' : 'border-slate-200'} shadow-sm hover:shadow-md transition-shadow p-5 relative overflow-hidden group">

                                        ${alertaPerdida ? `
                                        <div class="absolute top-0 left-0 right-0 bg-red-500 text-white text-[10px] font-black uppercase text-center py-1 flex items-center justify-center gap-1">
                                            <i data-lucide="x-circle" class="w-3 h-3"></i> ¡Vendes a pérdida!
                                        </div><div class="mt-4"></div>` : alertaBaja ? `
                                        <div class="absolute top-0 left-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-black uppercase text-center py-1 flex items-center justify-center gap-1">
                                            <i data-lucide="alert-triangle" class="w-3 h-3"></i> Margen bajo — revisar precio
                                        </div><div class="mt-4"></div>` : ''}

                                        <div class="absolute ${alertaBaja || alertaPerdida ? 'top-8' : 'top-3'} right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-white via-white to-transparent pl-8">
                                            <button onclick="window.abrirModalReceta(${r.id})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="Editar"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                                            <button onclick="window.eliminarReceta(${r.id})" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Eliminar"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                        </div>

                                        <div class="flex items-start gap-4 mb-4">
                                            <div class="bg-orange-100 p-3 rounded-xl flex-shrink-0">
                                                <i data-lucide="utensils" class="w-6 h-6 text-orange-600"></i>
                                            </div>
                                            <div class="min-w-0 pr-12">
                                                <h4 class="font-bold text-lg text-slate-800 truncate">${r.nombre}</h4>
                                                <div class="flex items-center gap-2 mt-1">
                                                    <p class="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">${r.codigo_pos || 'SIN CÓDIGO'}</p>
                                                    ${tieneMermas ? `<span class="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-black uppercase">Con mermas</span>` : ''}
                                                </div>
                                            </div>
                                        </div>

                                        ${precio > 0 ? `
                                        <div class="mb-4">
                                            <div class="flex justify-between text-[10px] font-bold mb-1">
                                                <span class="text-slate-400 uppercase tracking-widest">Rentabilidad</span>
                                                <span class="${margen <= 0 ? 'text-red-600' : margen < 30 ? 'text-yellow-600' : 'text-emerald-600'}">${margen.toFixed(1)}%</span>
                                            </div>
                                            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                <div class="h-full rounded-full ${margen <= 0 ? 'bg-red-500' : margen < 30 ? 'bg-yellow-400' : 'bg-emerald-500'}" style="width:${Math.min(100, Math.max(0, margen))}%"></div>
                                            </div>
                                        </div>` : ''}

                                        <div class="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                                            <div class="text-center">
                                                <p class="text-[9px] uppercase font-black text-slate-400 tracking-widest">Costo</p>
                                                <p class="text-sm font-black text-slate-700 mt-0.5">${formatCurrency(costo)}</p>
                                            </div>
                                            <div class="text-center border-x border-slate-100">
                                                <p class="text-[9px] uppercase font-black text-slate-400 tracking-widest">Ganancia</p>
                                                <p class="text-sm font-black mt-0.5 ${ganancia >= 0 ? 'text-emerald-600' : 'text-red-600'}">${formatCurrency(ganancia)}</p>
                                            </div>
                                            <div class="text-center">
                                                <p class="text-[9px] uppercase font-black text-slate-400 tracking-widest">Venta</p>
                                                <p class="text-sm font-black text-slate-800 mt-0.5">${formatCurrency(precio)}</p>
                                            </div>
                                        </div>

                                        <div class="mt-3 flex justify-between items-center">
                                            <span class="text-[10px] text-slate-400">${(r.ingredientes||[]).length} ingredientes</span>
                                            <span class="text-[10px] font-black px-2 py-1 rounded-lg border flex items-center gap-1 ${margenColor}">
                                                <i data-lucide="${margenIcon}" class="w-3 h-3"></i>
                                                ${margen <= 0 ? 'Pérdida' : margen < 30 ? 'Margen bajo' : 'Saludable'}
                                            </span>
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

window.abrirModalReceta = (id = null) => {
    const r = id ? DB.recetas.find(x => x.id === id) : null;
    const state = {
        id: r?.id || null,
        nombre: r?.nombre || '',
        codigo_pos: r?.codigo_pos || '',
        categoria: r?.categoria || '',
        precio_venta: r?.precio_venta || '',
        ingredientes: r ? JSON.parse(JSON.stringify(r.ingredientes || [])) : [],
        costoActual: 0
    };
    const categoriasExistentes = [...new Set(DB.recetas.map(x => x.categoria).filter(Boolean))];

    window.openModal(`
        <div class="bg-slate-50 flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] overflow-hidden rounded-2xl">
            <div class="bg-white px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
                <div class="flex items-center gap-3">
                    <div class="bg-orange-100 p-2 rounded-lg"><i data-lucide="chef-hat" class="w-5 h-5 text-orange-600"></i></div>
                    <h2 class="text-xl font-bold text-slate-800">${r ? 'Editar Platillo' : 'Nuevo Platillo'}</h2>
                </div>
                <button onclick="window.closeModal()" class="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-xl"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <form id="formReceta" class="space-y-8">
                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><i data-lucide="info" class="w-4 h-4"></i> 1. Información POS</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-bold text-slate-600 mb-1">Nombre *</label>
                                <input name="nombre" value="${state.nombre}" required class="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-slate-800 font-medium" placeholder="Ej: Hamburguesa Clásica">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-600 mb-1">Categoría</label>
                                <select id="selectCategoria" name="select_cat" class="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none bg-white text-slate-800">
                                    ${categoriasExistentes.length === 0 ? '' : `<option value="" disabled ${!state.categoria ? 'selected' : ''}>— Selecciona —</option>`}
                                    ${categoriasExistentes.map(cat => `<option value="${cat}" ${state.categoria===cat?'selected':''}>${cat}</option>`).join('')}
                                    ${state.categoria && !categoriasExistentes.includes(state.categoria) ? `<option value="${state.categoria}" selected>${state.categoria}</option>` : ''}
                                    <option value="__nueva__">✏️ Nueva categoría...</option>
                                </select>
                                <input id="inputNuevaCat" name="categoria_nueva" placeholder="Nueva categoría" class="hidden w-full border-2 border-orange-400 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-slate-800 mt-1">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-600 mb-1">Código POS</label>
                                <input name="codigo_pos" value="${state.codigo_pos}" class="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none font-mono text-slate-800 uppercase" placeholder="HAM-01">
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4"><i data-lucide="list-plus" class="w-4 h-4"></i> 2. Fórmula e Ingredientes</h3>
                        <div class="flex flex-col gap-2 mb-4 p-4 bg-orange-50/50 rounded-xl border border-orange-100">
                            <label class="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">Agregar ingrediente</label>
                            <div class="flex flex-col sm:flex-row gap-3">
                                <div class="flex-1">
                                    <select id="recetaSelectIng" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                                        <option value="">Selecciona del catálogo...</option>
                                        ${DB.productos.map(p => `<option value="${p.id}">${p.nombre} (${formatCurrency(p.precio)}/${p.unidad})</option>`).join('')}
                                    </select>
                                </div>
                                <div class="flex gap-2 items-center">
                                    <input type="number" id="recetaCantIng" step="0.001" min="0.001" placeholder="Cant." class="w-24 border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                                    <div class="relative w-24">
                                        <input type="number" id="recetaMermaIng" step="1" min="0" max="99" value="0" placeholder="Merma" class="w-full border border-slate-300 p-2.5 pl-2 pr-6 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                                        <span class="absolute right-2 top-2.5 text-xs font-bold text-slate-400">%</span>
                                    </div>
                                    <button type="button" id="btnAgregarIng" class="bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-700 flex items-center gap-1 shadow-md active:scale-95">
                                        <i data-lucide="plus" class="w-4 h-4"></i> Add
                                    </button>
                                </div>
                            </div>
                            <p class="text-[10px] text-slate-500 mt-1"><b>% Merma</b> = lo que se tira (cáscara, hueso, etc.). Incrementa el costo real automáticamente.</p>
                        </div>
                        <div class="border rounded-xl overflow-hidden shadow-sm">
                            <table class="w-full text-sm text-left">
                                <thead class="bg-slate-100 text-slate-500 text-[10px] uppercase tracking-widest border-b">
                                    <tr><th class="p-3 font-black">Ingrediente</th><th class="p-3 font-black text-center">Porción Neta</th><th class="p-3 font-black text-center">Merma</th><th class="p-3 font-black text-right">Costo Real</th><th class="p-3"></th></tr>
                                </thead>
                                <tbody id="recetaItemsBody" class="divide-y divide-slate-100 bg-white"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4"><i data-lucide="calculator" class="w-4 h-4"></i> 3. Precio y Rentabilidad</h3>
                        <div class="flex flex-col sm:flex-row gap-6 items-center">
                            <div class="flex-1 w-full">
                                <label class="block text-xs font-bold text-slate-600 mb-1">Precio de Venta *</label>
                                <div class="relative">
                                    <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                                    <input type="number" id="recetaPrecioVenta" name="precio_venta" step="0.5" min="0" value="${state.precio_venta}" required class="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-400 outline-none text-xl font-black text-slate-800">
                                </div>
                            </div>
                            <div class="flex-1 w-full bg-slate-50 rounded-xl p-4 border border-slate-200">
                                <div class="flex justify-between mb-1"><span class="text-xs font-bold text-slate-500">Costo Real:</span><span id="recetaCostoTotal" class="font-bold text-slate-800">$0.00</span></div>
                                <div class="flex justify-between"><span class="text-xs font-bold text-slate-500">Ganancia Bruta:</span><span id="recetaGananciaBruta" class="font-black text-emerald-600">$0.00</span></div>
                                <div class="mt-2 pt-2 border-t flex justify-between items-center">
                                    <span class="text-[10px] font-black uppercase text-slate-400">Margen %</span>
                                    <span id="recetaMargenPorcentaje" class="text-sm font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded">0%</span>
                                </div>
                                <div class="mt-3">
                                    <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                        <div id="recetaBarraMargen" class="h-full rounded-full transition-all duration-300 bg-blue-500" style="width:0%"></div>
                                    </div>
                                    <div class="flex justify-between text-[9px] text-slate-400 mt-1"><span>0%</span><span class="text-yellow-500 font-bold">30%</span><span>100%</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
            <div class="bg-white border-t p-4 flex gap-3 flex-shrink-0">
                <button type="button" onclick="window.closeModal()" class="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
                <button type="submit" form="formReceta" id="btnGuardarReceta" class="flex-1 bg-orange-500 text-white py-3 rounded-xl font-black hover:bg-orange-600 shadow-lg active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="save" class="w-5 h-5"></i> Guardar Platillo
                </button>
            </div>
        </div>
    `);

    const form = document.getElementById('formReceta');
    const selectCat = document.getElementById('selectCategoria');
    const inputNuevaCat = document.getElementById('inputNuevaCat');
    const selectIng = document.getElementById('recetaSelectIng');
    const inputCantIng = document.getElementById('recetaCantIng');
    const inputMermaIng = document.getElementById('recetaMermaIng');
    const btnAgregarIng = document.getElementById('btnAgregarIng');
    const inputPrecioVenta = document.getElementById('recetaPrecioVenta');
    const tbody = document.getElementById('recetaItemsBody');

    const calcularMargen = () => {
        const precio = parseFloat(inputPrecioVenta?.value) || 0;
        const costo = state.costoActual || 0;
        const ganancia = precio - costo;
        const margen = precio > 0 ? (ganancia / precio) * 100 : 0;
        const elCosto = document.getElementById('recetaCostoTotal');
        const elGanancia = document.getElementById('recetaGananciaBruta');
        const elMargen = document.getElementById('recetaMargenPorcentaje');
        const elBarra = document.getElementById('recetaBarraMargen');
        if (elCosto) elCosto.textContent = formatCurrency(costo);
        if (elGanancia) { elGanancia.textContent = formatCurrency(ganancia); elGanancia.className = `font-black ${ganancia >= 0 ? 'text-emerald-600' : 'text-red-600'}`; }
        if (elMargen) { elMargen.textContent = `${margen.toFixed(1)}%`; elMargen.className = `text-sm font-black px-2 py-0.5 rounded ${margen <= 0 ? 'text-red-600 bg-red-100' : margen < 30 ? 'text-yellow-600 bg-yellow-100' : 'text-emerald-600 bg-emerald-100'}`; }
        if (elBarra) { elBarra.style.width = `${Math.min(100, Math.max(0, margen))}%`; elBarra.className = `h-full rounded-full transition-all duration-300 ${margen <= 0 ? 'bg-red-500' : margen < 30 ? 'bg-yellow-400' : 'bg-emerald-500'}`; }
    };

    const renderIngredientes = () => {
        let costoTotal = 0;
        if (state.ingredientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 text-sm italic">No has agregado ingredientes.</td></tr>`;
        } else {
            tbody.innerHTML = state.ingredientes.map((ing, idx) => {
                const prod = DB.productos.find(p => String(p.id) === String(ing.productoId));
                const nombre = prod ? prod.nombre : 'Producto Eliminado';
                const unidad = prod ? prod.unidad : '?';
                const costoU = prod ? (prod.precio || 0) : 0;
                const merma = ing.merma || 0;
                const rend = 1 - (merma / 100);
                const costoReal = rend > 0 ? (costoU / rend) * ing.cantidad : 0;
                const exceso = costoReal - (costoU * ing.cantidad);
                costoTotal += costoReal;
                return `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-3 font-medium text-slate-700">${nombre}</td>
                        <td class="p-3 text-center"><span class="bg-slate-100 px-2 py-1 rounded font-mono text-xs font-bold">${ing.cantidad} ${unidad}</span></td>
                        <td class="p-3 text-center">${merma > 0 ? `<span class="bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded text-[10px] font-black">${merma}%</span>` : `<span class="text-[10px] text-slate-300">0%</span>`}</td>
                        <td class="p-3 text-right">
                            <div class="flex flex-col items-end">
                                <span class="font-bold text-slate-800">${formatCurrency(costoReal)}</span>
                                ${merma > 0 ? `<span class="text-[9px] text-red-400">+${formatCurrency(exceso)} merma</span>` : ''}
                            </div>
                        </td>
                        <td class="p-3 text-center"><button type="button" data-idx="${idx}" class="btn-delete-ing p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
                    </tr>`;
            }).join('');
            tbody.querySelectorAll('.btn-delete-ing').forEach(btn => {
                btn.addEventListener('click', e => { state.ingredientes.splice(parseInt(e.currentTarget.dataset.idx), 1); renderIngredientes(); });
            });
        }
        state.costoActual = costoTotal;
        calcularMargen();
        if (window.lucide) window.lucide.createIcons();
    };

    selectCat.addEventListener('change', e => {
        if (e.target.value === '__nueva__') { inputNuevaCat.classList.remove('hidden'); inputNuevaCat.focus(); }
        else { inputNuevaCat.classList.add('hidden'); inputNuevaCat.value = ''; }
    });

    inputPrecioVenta.addEventListener('input', calcularMargen);

    btnAgregarIng.addEventListener('click', () => {
        const pid = parseInt(selectIng.value);
        const cant = parseFloat(inputCantIng.value);
        const merma = parseFloat(inputMermaIng.value) || 0;
        if (!pid || isNaN(cant) || cant <= 0) return showNotification('Selecciona ingrediente y cantidad válida', 'error');
        if (merma >= 100) return showNotification('La merma no puede ser 100% o mayor', 'error');
        const existente = state.ingredientes.find(i => String(i.productoId) === String(pid));
        if (existente) { existente.cantidad += cant; existente.merma = merma; }
        else state.ingredientes.push({ productoId: pid, cantidad: cant, merma });
        selectIng.value = ''; inputCantIng.value = ''; inputMermaIng.value = '0';
        renderIngredientes();
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('btnGuardarReceta');
        if (state.ingredientes.length === 0) return showNotification('Agrega al menos un ingrediente', 'error');
        btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Guardando...';
        const formData = new FormData(form);
        const valCat = selectCat.value;
        const categoriaFinal = valCat === '__nueva__' ? (formData.get('categoria_nueva') || '').trim() : valCat;
        const datosReceta = {
            nombre: formData.get('nombre').trim(),
            codigo_pos: formData.get('codigo_pos').trim().toUpperCase(),
            categoria: categoriaFinal,
            precio_venta: parseFloat(formData.get('precio_venta')),
            ingredientes: state.ingredientes
        };
        if (state.id) datosReceta.id = state.id;
        try {
            const { error } = await supabase.from('recetas').upsert(datosReceta);
            if (error) throw error;
            await cargarDatosDeNube();
            window.closeModal();
            showNotification('Receta guardada exitosamente', 'success');
            window.render();
        } catch (err) {
            showNotification('Error al guardar: ' + err.message, 'error');
            btn.disabled = false; btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Guardar Platillo';
            if (window.lucide) window.lucide.createIcons();
        }
    });

    renderIngredientes();
};

window.eliminarReceta = id => {
    abrirModalConfirmacion('Eliminar Receta', '¿Seguro de eliminar este platillo? Ya no aparecerá en el POS.', async () => {
        try {
            const { error } = await supabase.from('recetas').delete().eq('id', id);
            if (error) throw error;
            await cargarDatosDeNube();
            showNotification('Receta eliminada', 'success');
            window.render();
        } catch (err) { showNotification('Error: ' + err.message, 'error'); }
    });
};