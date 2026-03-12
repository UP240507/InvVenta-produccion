// src/components/Pos.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { formatCurrency, showNotification, SPINNER_ICON, registrarMovimientoEnNube, detectarTipoTarjeta } from '../utils/helpers.js';

// ─── Estado local del POS ────────────────────────────────────────────────────
let posState = {
    orden: [],
    descuento: 0,
    propina: 0,
    metodoPago: 'efectivo',
    efectivoPagado: 0,
    tarjetaPagado: 0,
    numTarjeta: '',
    busqueda: '',
    categoriaFiltro: ''
};

window.posState = posState;

// ─── Helpers locales ─────────────────────────────────────────────────────────
function calcTotales() {
    const subtotal = posState.orden.reduce((s, i) => s + i.subtotal, 0);
    const descuentoAmt = subtotal * (posState.descuento / 100);
    const propinaAmt = (subtotal - descuentoAmt) * (posState.propina / 100);
    const total = subtotal - descuentoAmt + propinaAmt;
    return { subtotal, descuentoAmt, propinaAmt, total };
}

function getCategoriasRecetas() {
    return [...new Set(DB.recetas.map(r => r.categoria || 'Sin categoría'))];
}

function getRecetasFiltradas() {
    return DB.recetas.filter(r => {
        const matchBusq = r.nombre.toLowerCase().includes(posState.busqueda.toLowerCase()) ||
                        (r.codigo_pos || '').toLowerCase().includes(posState.busqueda.toLowerCase());
        const matchCat = !posState.categoriaFiltro || (r.categoria || 'Sin categoría') === posState.categoriaFiltro;
        return matchBusq && matchCat;
    });
}

function verificarStock(receta, cantidad) {
    for (const ing of (receta.ingredientes || [])) {
        const prod = DB.productos.find(p => p.id === ing.productoId);
        if (!prod || prod.stock < ing.cantidad * cantidad) {
            return { ok: false, nombre: prod?.nombre || 'Ingrediente desconocido' };
        }
    }
    return { ok: true };
}

function getCategoriaEmoji(cat) {
    const map = {
        'Platillos': '🍽️', 'Bebidas': '🥤', 'Postres': '🍮',
        'Entradas': '🥗', 'Sopas': '🍲', 'Carnes': '🥩',
        'Mariscos': '🦐', 'Vegetariano': '🥦', 'Desayunos': '🍳'
    };
    return map[cat] || '🍴';
}

// ─── Render principal ─────────────────────────────────────────────────────────
export function renderPos() {
    const categorias = getCategoriasRecetas();

    setTimeout(() => {
        window.actualizarOrdenPOS();
        window.actualizarGridRecetas();
    }, 0);

    return `
    <div class="flex flex-col lg:flex-row gap-4 animate-fade-in" style="height: calc(100vh - 130px); min-height: 580px;">

        <!-- ── Columna izquierda: catálogo ── -->
        <div class="flex-1 flex flex-col gap-3 min-w-0 min-h-0 overflow-hidden">

            <!-- Barra de búsqueda y filtros -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex gap-3 items-center flex-wrap">
                <div class="relative flex-1 min-w-[200px]">
                    <input id="posBusqueda"
                        oninput="posState.busqueda=this.value; window.actualizarGridRecetas()"
                        class="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-400 outline-none text-sm font-medium transition-colors"
                        placeholder="Buscar platillo o escanear código...">
                    <i data-lucide="search" class="absolute left-3 top-3 w-4 h-4 text-slate-400"></i>
                </div>
                <div class="flex gap-2 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
                    <button onclick="posState.categoriaFiltro=''; window.actualizarGridRecetas()"
                        id="catBtn-todos"
                        class="px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20">
                        Todos
                    </button>
                    ${categorias.map(c => `
                        <button onclick="posState.categoriaFiltro='${c}'; window.actualizarGridRecetas()"
                            id="catBtn-${c.replace(/\s+/g,'_')}"
                            class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border border-slate-200 transition-all bg-white text-slate-600 hover:bg-slate-50 shadow-sm">
                            ${c}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Grid de platillos -->
            <div id="posGridRecetas" class="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-4"></div>
            </div>
        </div>

        <!-- ── Columna derecha: orden actual ── -->
        <div class="w-full lg:w-96 flex-shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style="height: min(65vh, calc(100vh - 140px)); min-height: 420px;">

            <!-- Header orden -->
            <div class="bg-slate-900 px-5 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                    <h3 class="text-white font-black text-lg">Orden Actual</h3>
                    <p class="text-slate-400 text-xs mt-0.5">${new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long'})}</p>
                </div>
                <button onclick="window.posCancelarOrden()" class="text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded-lg transition-all" title="Limpiar orden">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </div>

            <!-- Items de la orden -->
            <div id="posOrdenItems" class="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0 custom-scrollbar bg-slate-50/50">
                <div class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 py-6">
                    <i data-lucide="shopping-bag" class="w-10 h-10 mb-2"></i>
                    <p class="font-bold uppercase tracking-widest text-xs">Orden vacía</p>
                    <p class="text-[10px] mt-1">Selecciona platillos del catálogo</p>
                </div>
            </div>

            <!-- Descuento y Propina -->
            <div class="px-4 py-3 border-t border-slate-100 bg-white flex-shrink-0">
                <div class="grid grid-cols-2 gap-2">
                    <div class="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-300 transition-all">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex-1">Desc %</span>
                        <input type="number" id="posDescuento" min="0" max="100" value="${posState.descuento}"
                            oninput="posState.descuento=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.actualizarOrdenPOS(true)"
                            class="w-14 text-right font-black text-slate-800 bg-transparent outline-none text-sm">
                    </div>
                    <div class="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-green-400 focus-within:border-green-300 transition-all">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex-1">Prop %</span>
                        <input type="number" id="posPropina" min="0" max="100" value="${posState.propina}"
                            oninput="posState.propina=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.actualizarOrdenPOS(true)"
                            class="w-14 text-right font-black text-slate-800 bg-transparent outline-none text-sm">
                    </div>
                </div>
            </div>

            <!-- Totales -->
            <div class="px-4 py-3 border-t border-slate-100 bg-white flex-shrink-0">
                <div class="flex justify-between text-sm text-slate-500 mb-1">
                    <span>Subtotal</span><span id="posSubtotal">$0.00</span>
                </div>
                <div id="posDescuentoRow" class="flex justify-between text-sm text-red-500 font-bold hidden mb-1">
                    <span>Descuento</span><span id="posDescuentoTotal">−$0.00</span>
                </div>
                <div id="posPropinaRow" class="flex justify-between text-sm text-green-600 font-bold hidden mb-1">
                    <span>Propina</span><span id="posPropinaTotal">+$0.00</span>
                </div>
                <div class="flex justify-between text-xl font-black text-slate-900 border-t border-slate-100 pt-2 mt-1">
                    <span>TOTAL</span>
                    <span id="posTotal" class="text-orange-600">$0.00</span>
                </div>
            </div>

            <!-- Método de pago -->
            <div class="px-4 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Método de pago</p>
                <div class="grid grid-cols-3 gap-2 mb-3">
                    <button onclick="posState.metodoPago='efectivo'; window.actualizarOrdenPOS(true)" id="btnPagoEfectivo"
                        class="py-2.5 rounded-xl text-xs font-black border transition-all bg-green-500 text-white border-green-500 shadow-md shadow-green-500/20">
                        💵 Efectivo
                    </button>
                    <button onclick="posState.metodoPago='tarjeta'; posState.numTarjeta=''; window.actualizarOrdenPOS(true)" id="btnPagoTarjeta"
                        class="py-2.5 rounded-xl text-xs font-black border transition-all bg-white text-slate-600 border-slate-200">
                        💳 Tarjeta
                    </button>
                    <button onclick="posState.metodoPago='mixto'; window.actualizarOrdenPOS(true)" id="btnPagoMixto"
                        class="py-2.5 rounded-xl text-xs font-black border transition-all bg-white text-slate-600 border-slate-200">
                        🔀 Mixto
                    </button>
                </div>

                <!-- Campos dinámicos de pago -->
                <div id="posCamposPago"></div>
            </div>

            <!-- Botón cobrar -->
            <div class="p-4 border-t border-slate-100 flex-shrink-0 bg-white">
                <button onclick="window.posCobrar()"
                    class="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-xl font-black text-lg shadow-lg shadow-orange-500/25 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i data-lucide="check-circle" class="w-6 h-6"></i>
                    COBRAR ORDEN
                </button>
            </div>
        </div>
    </div>`;
}

// ─── Grid de recetas ──────────────────────────────────────────────────────────
window.actualizarGridRecetas = () => {
    const container = document.querySelector('#posGridRecetas > div');
    if (!container) return;

    const recetas = getRecetasFiltradas();

    document.querySelectorAll('[id^="catBtn-"]').forEach(btn => {
        btn.className = "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border border-slate-200 transition-all bg-white text-slate-600 hover:bg-slate-50 shadow-sm";
    });
    const activeBtn = document.getElementById(posState.categoriaFiltro ? `catBtn-${posState.categoriaFiltro.replace(/\s+/g,'_')}` : 'catBtn-todos');
    if (activeBtn) activeBtn.className = "px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20";

    if (recetas.length === 0) {
        container.innerHTML = `
            <div class="col-span-2 md:col-span-3 xl:col-span-4 text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                <div class="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="search-x" class="w-8 h-8 text-slate-300"></i>
                </div>
                <p class="font-bold text-slate-500">No se encontraron platillos</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = recetas.map(r => {
        const stockOk = (r.ingredientes || []).every(ing => {
            const p = DB.productos.find(x => x.id === ing.productoId);
            return p && p.stock >= ing.cantidad;
        });
        const precio = r.precio_venta ? formatCurrency(r.precio_venta) : 'Sin precio';
        const enOrden = posState.orden.find(x => x.receta.id === r.id);

        return `
        <button onclick="window.posAgregarReceta(${r.id})" ${!stockOk ? 'disabled' : ''}
            class="relative bg-white border-2 rounded-2xl p-4 text-left transition-all flex flex-col h-full
                   ${stockOk ? 'hover:shadow-lg hover:-translate-y-1 hover:border-orange-400 cursor-pointer' : 'opacity-40 cursor-not-allowed border-slate-100'}
                   ${enOrden ? 'border-orange-400 bg-orange-50/50 shadow-sm' : 'border-slate-200'}">
            ${enOrden ? `
                <span class="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                    ${enOrden.cantidad}
                </span>` : ''}
            <div class="mb-2 text-3xl">${getCategoriaEmoji(r.categoria)}</div>
            <p class="font-black text-slate-800 text-sm leading-tight mb-1 flex-1">${r.nombre}</p>
            <div class="mt-auto pt-2 border-t border-slate-100">
                <p class="text-[10px] text-slate-400 font-mono mb-0.5">${r.codigo_pos || '---'}</p>
                <p class="font-black text-orange-600 text-base">${precio}</p>
            </div>
            ${!stockOk ? '<p class="text-[10px] text-red-500 mt-2 font-bold uppercase bg-red-50 px-2 py-1 rounded-md text-center">⚠ Sin stock</p>' : ''}
        </button>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

// ─── Escáner ──────────────────────────────────────────────────────────────────
window.posEscanearCodigo = (codigoBuscado) => {
    const receta = DB.recetas.find(r => (r.codigo_pos || '').toUpperCase() === codigoBuscado.toUpperCase());
    if (receta) {
        window.posAgregarReceta(receta.id);
        showNotification(`Agregado: ${receta.nombre}`, 'success');
    } else {
        showNotification(`El código ${codigoBuscado} no existe en el menú`, 'error');
    }
};

// ─── Agregar receta ───────────────────────────────────────────────────────────
window.posAgregarReceta = (id) => {
    const receta = DB.recetas.find(r => r.id === id);
    if (!receta) return;

    const existente = posState.orden.find(x => x.receta.id === id);
    const cantNueva = existente ? existente.cantidad + 1 : 1;

    const check = verificarStock(receta, cantNueva);
    if (!check.ok) return showNotification(`⚠️ Stock insuficiente de: ${check.nombre}`, 'error');

    if (existente) {
        existente.cantidad++;
        existente.subtotal = existente.cantidad * existente.precioUnit;
    } else {
        posState.orden.push({ receta, cantidad: 1, precioUnit: receta.precio_venta || 0, subtotal: receta.precio_venta || 0, nota: '' });
    }

    // Al agregar un platillo SÍ reconstruimos los items
    window.actualizarOrdenPOS(false);
    window.actualizarGridRecetas();
};

window.posAgregarNota = (idx) => {
    const notaActual = posState.orden[idx].nota || '';
    const nuevaNota = prompt(`Nota para: ${posState.orden[idx].receta.nombre}\n(Ej: Sin cebolla, bien cocido)`, notaActual);
    if (nuevaNota !== null) {
        posState.orden[idx].nota = nuevaNota.trim();
        window.actualizarOrdenPOS(false);
    }
};

// ─── Actualizar panel de orden ────────────────────────────────────────────────
// FIX: parámetro skipItems=false
// Cuando skipItems=true solo actualizamos totales y campos de pago,
// SIN reconstruir el HTML de los items → el input activo no pierde el foco.
window.actualizarOrdenPOS = (skipItems = false) => {
    const { subtotal, descuentoAmt, propinaAmt, total } = calcTotales();

    // ── Reconstruir items solo cuando sea necesario ──
    if (!skipItems) {
        const itemsDiv = document.getElementById('posOrdenItems');
        if (itemsDiv) {
            if (posState.orden.length === 0) {
                itemsDiv.innerHTML = `
                    <div class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 py-6">
                        <i data-lucide="shopping-bag" class="w-10 h-10 mb-2"></i>
                        <p class="font-bold uppercase tracking-widest text-xs">Orden vacía</p>
                        <p class="text-[10px] mt-1">Selecciona platillos del catálogo</p>
                    </div>`;
            } else {
                itemsDiv.innerHTML = posState.orden.map((item, idx) => `
                    <div class="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm flex flex-col gap-1.5">
                        <div class="flex items-start gap-2">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-black text-slate-800 truncate leading-tight">${item.receta.nombre}</p>
                                <p class="text-[10px] text-slate-400 font-bold mt-0.5">${formatCurrency(item.precioUnit)} c/u</p>
                                ${item.nota ? `<p class="text-[10px] text-orange-600 font-bold italic mt-0.5 bg-orange-50 px-1.5 py-0.5 rounded inline-block truncate max-w-full">📝 ${item.nota}</p>` : ''}
                            </div>
                            <div class="flex flex-col items-end gap-1 flex-shrink-0">
                                <span class="text-sm font-black text-slate-900">${formatCurrency(item.subtotal)}</span>
                                <button onclick="window.posEliminarItem(${idx})" class="text-slate-300 hover:text-red-500 transition-colors">
                                    <i data-lucide="x" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.posAgregarNota(${idx})" class="flex items-center gap-1 text-[10px] text-slate-400 hover:text-orange-500 border border-dashed border-slate-200 hover:border-orange-300 rounded-lg px-2 py-1 transition-all flex-1">
                                <i data-lucide="message-square-plus" class="w-3 h-3"></i>
                                <span>${item.nota ? 'Editar nota' : 'Nota a cocina'}</span>
                            </button>
                            <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200 p-0.5">
                                <button onclick="window.posQuitarUno(${idx})" class="w-7 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-red-500 shadow-sm font-black transition-colors">−</button>
                                <span class="w-6 text-center text-xs font-black text-slate-800">${item.cantidad}</span>
                                <button onclick="window.posAgregarUno(${idx})" class="w-7 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-green-600 shadow-sm font-black transition-colors">+</button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // ── Totales — solo textContent, nunca destruyen el DOM ──
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('posSubtotal', formatCurrency(subtotal));
    set('posTotal', formatCurrency(total));
    set('posDescuentoAmt', formatCurrency(descuentoAmt));
    set('posPropinaAmt', formatCurrency(propinaAmt));
    set('posDescuentoTotal', `−${formatCurrency(descuentoAmt)}`);
    set('posPropinaTotal', `+${formatCurrency(propinaAmt)}`);

    const descRow = document.getElementById('posDescuentoRow');
    const propRow = document.getElementById('posPropinaRow');
    if (descRow) descRow.classList.toggle('hidden', descuentoAmt === 0);
    if (propRow) propRow.classList.toggle('hidden', propinaAmt === 0);

    // ── Botones método de pago ──
    const colores = {
        efectivo: 'bg-green-500 text-white border-green-500 shadow-md shadow-green-500/20',
        tarjeta:  'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20',
        mixto:    'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20'
    };
    ['efectivo', 'tarjeta', 'mixto'].forEach(m => {
        const btn = document.getElementById(`btnPago${m.charAt(0).toUpperCase() + m.slice(1)}`);
        if (btn) btn.className = `py-2.5 rounded-xl text-xs font-black border transition-all ${posState.metodoPago === m ? colores[m] : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`;
    });

    // ── Campos de pago dinámicos — se reconstruyen SOLO en este div pequeño ──
    // Esto no afecta los inputs de descuento/propina ni los items
    const camposPago = document.getElementById('posCamposPago');
    const focusEnPago = camposPago && camposPago.contains(document.activeElement);  
    if (camposPago && !focusEnPago) {
        if (posState.metodoPago === 'efectivo') {
            const cambio = posState.efectivoPagado - total;
            camposPago.innerHTML = `
                <div class="flex items-center bg-white border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-green-400 transition-all">
                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex-1 whitespace-nowrap">Con cuánto paga $</label>
                    <input type="number" id="posEfectivoRecibido" min="0" value="${posState.efectivoPagado || ''}" placeholder="0.00"
                        oninput="posState.efectivoPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS(true)"
                        class="w-20 text-right font-black text-slate-800 bg-transparent outline-none text-sm">
                </div>
                ${posState.efectivoPagado > 0 ? `
                <div class="mt-2 text-center text-xs font-black uppercase p-2 rounded-xl border ${cambio >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-100'}">
                    ${cambio >= 0 ? `💰 Cambio: ${formatCurrency(cambio)}` : `⚠ Falta: ${formatCurrency(Math.abs(cambio))}`}
                </div>` : ''}`;
        } else if (posState.metodoPago === 'tarjeta') {
            camposPago.innerHTML = `
                <div class="flex items-center bg-white border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-blue-400 transition-all gap-2">
                    <i data-lucide="credit-card" class="w-4 h-4 text-slate-400 flex-shrink-0 ml-1"></i>
                    <input type="text" id="posNumTarjeta" maxlength="16" placeholder="4 últimos dígitos (opcional)"
                        oninput="posState.numTarjeta=this.value; window.actualizarOrdenPOS(true)"
                        class="flex-1 font-mono font-bold text-slate-800 bg-transparent outline-none text-sm tracking-widest">
                    <span id="posTarjetaTipo" class="text-xs font-black text-slate-400 whitespace-nowrap"></span>
                </div>`;
            if (posState.numTarjeta) {
                const info = window.detectarTipoTarjeta ? window.detectarTipoTarjeta(posState.numTarjeta) : null;
                const tipoEl = document.getElementById('posTarjetaTipo');
                if (tipoEl && info) tipoEl.textContent = `${info.icono} ${info.tipo}`;
            }
        } else if (posState.metodoPago === 'mixto') {
            const suma = posState.efectivoPagado + posState.tarjetaPagado;
            const diff = suma - total;
            camposPago.innerHTML = `
                <div class="grid grid-cols-2 gap-2">
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-purple-400 transition-all">
                        <span class="text-[10px] font-black text-slate-400 uppercase ml-1 flex-1">EFE $</span>
                        <input type="number" min="0" value="${posState.efectivoPagado || ''}" placeholder="0.00"
                            oninput="posState.efectivoPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS(true)"
                            class="w-16 text-right font-black text-sm text-slate-800 bg-transparent outline-none">
                    </div>
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-purple-400 transition-all">
                        <span class="text-[10px] font-black text-slate-400 uppercase ml-1 flex-1">TAR $</span>
                        <input type="number" min="0" value="${posState.tarjetaPagado || ''}" placeholder="0.00"
                            oninput="posState.tarjetaPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS(true)"
                            class="w-16 text-right font-black text-sm text-slate-800 bg-transparent outline-none">
                    </div>
                </div>
                ${(posState.efectivoPagado > 0 || posState.tarjetaPagado > 0) ? `
                <div class="mt-2 text-center text-xs font-black uppercase p-2 rounded-xl border ${Math.abs(diff)<0.01 ? 'bg-green-50 text-green-700 border-green-200' : diff<0 ? 'bg-red-50 text-red-500 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}">
                    ${Math.abs(diff)<0.01 ? '✓ Pago completo' : diff<0 ? `Faltan: ${formatCurrency(Math.abs(diff))}` : `Cambio: ${formatCurrency(diff)}`}
                </div>` : ''}`;
        } else {
            camposPago.innerHTML = '';
        }
        if (window.lucide) window.lucide.createIcons();
    }
};

window.posAgregarUno = (idx) => {
    const item = posState.orden[idx];
    const check = verificarStock(item.receta, item.cantidad + 1);
    if (!check.ok) return showNotification(`⚠️ Stock insuficiente de: ${check.nombre}`, 'error');
    item.cantidad++;
    item.subtotal = item.cantidad * item.precioUnit;
    window.actualizarOrdenPOS(false);
    window.actualizarGridRecetas();
};

window.posQuitarUno = (idx) => {
    posState.orden[idx].cantidad--;
    if (posState.orden[idx].cantidad <= 0) posState.orden.splice(idx, 1);
    else posState.orden[idx].subtotal = posState.orden[idx].cantidad * posState.orden[idx].precioUnit;
    window.actualizarOrdenPOS(false);
    window.actualizarGridRecetas();
};

window.posEliminarItem = (idx) => {
    posState.orden.splice(idx, 1);
    window.actualizarOrdenPOS(false);
    window.actualizarGridRecetas();
};

window.posCancelarOrden = () => {
    if (posState.orden.length === 0) return;
    if (confirm('¿Estás seguro de cancelar y limpiar la orden actual?')) {
        posState.orden = [];
        posState.descuento = 0;
        posState.propina = 0;
        posState.efectivoPagado = 0;
        posState.tarjetaPagado = 0;
        posState.numTarjeta = '';
        posState.busqueda = '';
        const searchInput = document.getElementById('posBusqueda');
        if (searchInput) searchInput.value = '';
        window.actualizarOrdenPOS(false);
        window.actualizarGridRecetas();
    }
};

// ─── COBRAR ───────────────────────────────────────────────────────────────────
window.posCobrar = async () => {
    if (posState.orden.length === 0) return showNotification('Agrega platillos a la orden primero', 'error');

    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotales();

    if (posState.metodoPago === 'mixto') {
        const sumPago = posState.efectivoPagado + posState.tarjetaPagado;
        if (Math.abs(sumPago - total) > 0.01)
            return showNotification(`El pago mixto (${formatCurrency(sumPago)}) no cubre el total (${formatCurrency(total)})`, 'error');
    }

    if (posState.metodoPago === 'efectivo' && posState.efectivoPagado > 0 && posState.efectivoPagado < total)
        return showNotification('El efectivo recibido es menor al total', 'error');

    for (const item of posState.orden) {
        const check = verificarStock(item.receta, item.cantidad);
        if (!check.ok) return showNotification(`⚠️ Sin stock suficiente de: ${check.nombre}`, 'error');
    }

    window.openModal(`
        <div class="p-8">
            <h2 class="text-2xl font-bold mb-2 text-slate-800">Confirmar Cobro</h2>
            <p class="text-slate-500 text-sm mb-6">Verifica los datos antes de emitir el ticket</p>
            <div class="bg-slate-50 rounded-xl p-4 mb-4 space-y-2 text-sm border border-slate-200">
                ${posState.orden.map(i => `
                    <div class="flex justify-between">
                        <span class="text-slate-600">${i.cantidad}x ${i.receta.nombre}</span>
                        <span class="font-bold">${formatCurrency(i.subtotal)}</span>
                    </div>
                `).join('')}
                <div class="border-t border-slate-200 pt-2 mt-2 space-y-1">
                    <div class="flex justify-between text-slate-500"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                    ${posState.descuento > 0 ? `<div class="flex justify-between text-red-500"><span>Descuento ${posState.descuento}%</span><span>−${formatCurrency(descuentoAmt)}</span></div>` : ''}
                    ${posState.propina > 0 ? `<div class="flex justify-between text-green-600"><span>Propina ${posState.propina}%</span><span>+${formatCurrency(propinaAmt)}</span></div>` : ''}
                    <div class="flex justify-between font-black text-xl mt-2 pt-2 border-t border-slate-200"><span>TOTAL</span><span class="text-orange-600">${formatCurrency(total)}</span></div>
                </div>
                <div class="border-t border-slate-200 pt-3 mt-3 bg-white p-3 rounded-lg border">
                    <div class="flex justify-between text-xs text-slate-500">
                        <span>Método:</span><span class="font-bold uppercase tracking-wider text-slate-700">${posState.metodoPago}</span>
                    </div>
                    ${posState.metodoPago === 'efectivo' && posState.efectivoPagado > 0 ? `
                        <div class="flex justify-between text-xs text-green-600 font-bold mt-1">
                            <span>Cambio:</span><span>${formatCurrency(posState.efectivoPagado - total)}</span>
                        </div>` : ''}
                    ${posState.metodoPago === 'mixto' ? `
                        <div class="flex justify-between text-xs text-slate-500 mt-1"><span>Efectivo:</span><span>${formatCurrency(posState.efectivoPagado)}</span></div>
                        <div class="flex justify-between text-xs text-slate-500"><span>Tarjeta:</span><span>${formatCurrency(posState.tarjetaPagado)}</span></div>
                    ` : ''}
                </div>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="closeModal()" class="flex-1 border py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Modificar</button>
                <button onclick="window.posConfirmarCobro()" id="btnConfirmarCobro"
                    class="flex-1 bg-orange-600 text-white py-3 rounded-xl font-black hover:bg-orange-700 flex items-center justify-center gap-2 shadow-lg shadow-orange-200 active:scale-95">
                    <i data-lucide="printer" class="w-5 h-5"></i> Cobrar e Imprimir
                </button>
            </div>
        </div>
    `);
};

window.posConfirmarCobro = async () => {
    const btn = document.getElementById('btnConfirmarCobro');
    if (btn) { btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Registrando...'; }

    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotales();
    const folio = `POS-${Date.now()}`;

    try {
        // ── FIX B-03: Verificación final de stock antes de tocar nada ──────
        await cargarDatosDeNube(); // datos frescos
        for (const item of posState.orden) {
            const check = verificarStock(item.receta, item.cantidad);
            if (!check.ok) throw new Error(`Stock insuficiente de: ${check.nombre}`);
        }
        // ────────────────────────────────────────────────────────────────────

        const productosAfectados = new Map();
        for (const item of posState.orden) {
            for (const ing of (item.receta.ingredientes || [])) {
                const actual = productosAfectados.get(ing.productoId) || 0;
                productosAfectados.set(ing.productoId, actual + (ing.cantidad * item.cantidad));
            }
        }

        // ── FIX B-03: Todos los updates de stock en paralelo ──────────────
        await Promise.all([...productosAfectados].map(async ([productoId, cantDescuento]) => {
            const prod = DB.productos.find(p => p.id === productoId);
            const nuevoStock = prod.stock - cantDescuento;
            const { error } = await supabase.from('productos').update({ stock: nuevoStock }).eq('id', productoId);
            if (error) throw error;
            const descripcion = posState.orden.map(i => `${i.receta.nombre} x${i.cantidad}`).join(', ');
            await registrarMovimientoEnNube('Venta POS', productoId, -cantDescuento, `Folio ${folio}: ${descripcion}`);
        }));
        // ─────────────────────────────────────────────────────────────────

        try {
            await supabase.from('ventas').insert({
                folio,
                items: posState.orden.map(i => ({
                    recetaId: i.receta.id, nombre: i.receta.nombre,
                    cantidad: i.cantidad, precio: i.precioUnit, nota: i.nota || ''
                })),
                subtotal, descuento: posState.descuento, descuento_monto: descuentoAmt,
                propina: propinaAmt, total, metodo_pago: posState.metodoPago,
                tipo_tarjeta: posState.metodoPago === 'tarjeta' && posState.numTarjeta
                    ? (window.detectarTipoTarjeta ? (window.detectarTipoTarjeta(posState.numTarjeta)?.tipo || '') : '') : '',
                efectivo: posState.efectivoPagado, tarjeta: posState.tarjetaPagado,
                usuario: AppState.user?.nombre || 'Sistema', fecha: new Date().toISOString()
            });
        } catch(_) { console.warn("Error guardando historial de venta"); }

        await cargarDatosDeNube();

        const productosBajos = [];
        for (const [productoId] of productosAfectados) {
            const prod = DB.productos.find(p => p.id === productoId);
            if (prod && prod.stock <= prod.min) productosBajos.push(prod);
        }

        window.posImprimirTicket(folio, total, subtotal, descuentoAmt, propinaAmt);
        window.closeModal();
        showNotification(`✅ Venta registrada (${folio})`, 'success');

        posState.orden = [];
        posState.descuento = 0;
        posState.propina = 0;
        posState.efectivoPagado = 0;
        posState.tarjetaPagado = 0;
        posState.numTarjeta = '';
        posState.busqueda = '';
        const searchInput = document.getElementById('posBusqueda');
        if (searchInput) searchInput.value = '';

        window.actualizarOrdenPOS(false);
        window.actualizarGridRecetas();

        if (productosBajos.length > 0) setTimeout(() => window.posModalOrdenCompraAutomatica(productosBajos), 1500);

    } catch (err) {
        console.error(err);
        showNotification('Error al procesar venta: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer"></i> Reintentar'; }
    }
};

// ─── Modal Orden de Compra Automática ─────────────────────────────────────────
window.posModalOrdenCompraAutomatica = (productosBajos) => {
    window.openModal(`
        <div class="p-8">
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-yellow-100 p-2 rounded-lg"><i data-lucide="alert-triangle" class="w-6 h-6 text-yellow-600"></i></div>
                <h2 class="text-xl font-bold text-slate-800">Alerta de Stock Crítico</h2>
            </div>
            <p class="text-slate-500 text-sm mb-5">Los siguientes ingredientes cayeron por debajo de su límite. ¿Generar una orden de compra?</p>
            <div class="bg-yellow-50 rounded-xl p-4 mb-5 space-y-2 border border-yellow-200">
                ${productosBajos.map(p => `
                    <div class="flex justify-between items-center text-sm border-b border-yellow-100 pb-1 last:border-0">
                        <span class="font-bold text-slate-700">${p.nombre}</span>
                        <div class="text-right">
                            <span class="text-red-600 font-black">${p.stock} ${p.unidad}</span>
                            <span class="text-slate-400 text-xs ml-1">(Mín: ${p.min})</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mb-5">
                <label class="block text-sm font-bold text-slate-700 mb-2">Proveedor (Obligatorio)</label>
                <select id="posProveedorOC" class="w-full border p-3 rounded-xl bg-white focus:ring-2 focus:ring-yellow-400 outline-none">
                    <option value="">— Selecciona proveedor —</option>
                    ${DB.proveedores.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="flex gap-3">
                <button onclick="closeModal()" class="flex-1 border py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Omitir</button>
                <button onclick="window.posGenerarOrdenCompra(${JSON.stringify(productosBajos.map(p => p.id))})"
                    class="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-black hover:bg-yellow-600 flex items-center justify-center gap-2 shadow-lg shadow-yellow-200 active:scale-95">
                    <i data-lucide="shopping-cart" class="w-5 h-5"></i> Generar OC
                </button>
            </div>
        </div>
    `);
};

window.posGenerarOrdenCompra = async (productoIds) => {
    const proveedorNombre = document.getElementById('posProveedorOC')?.value;
    if (!proveedorNombre) return showNotification('⚠️ Selecciona un proveedor', 'error');

    const items = productoIds.map(id => {
        const prod = DB.productos.find(p => p.id === id);
        const cantSugerida = Math.max(prod.min * 2 - prod.stock, prod.min);
        return { productoId: prod.id, nombre: prod.nombre, cant: cantSugerida, cantidad: cantSugerida, precio: prod.precio, unidad: prod.unidad };
    });

    const total = items.reduce((s, i) => s + i.cant * i.precio, 0);
    const numeroOC = `OC-${Date.now().toString().slice(-6)}`;

    try {
        const { data, error } = await supabase.from('ordenes_compra').insert({
            numero: numeroOC, proveedor: proveedorNombre, estado: 'pendiente', items, total,
            fecha: new Date().toISOString(), referencia: 'Generada automáticamente por POS',
            usuario: AppState.user?.nombre || 'Sistema'
        }).select();
        if (error) throw error;

        const idOrdenCreada = data[0].id;
        await cargarDatosDeNube();

        window.openModal(`
            <div class="p-8 text-center">
                <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
                    <i data-lucide="check" class="h-8 w-8 text-green-600"></i>
                </div>
                <h2 class="text-2xl font-bold text-slate-800 mb-2">¡Orden lista!</h2>
                <p class="text-slate-500 mb-8 text-sm px-4">OC <b>${numeroOC}</b> creada. ¿Enviar a <b>${proveedorNombre}</b>?</p>
                <div class="grid grid-cols-1 gap-3">
                    <button onclick="window.enviarPorWhatsApp(${idOrdenCreada})" class="w-full bg-[#25D366] text-white py-3.5 rounded-xl font-bold hover:bg-[#128C7E] flex items-center justify-center gap-2 shadow-lg shadow-green-200">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        Enviar por WhatsApp
                    </button>
                    <button onclick="window.enviarPorCorreo(${idOrdenCreada})" class="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
                        <i data-lucide="mail" class="w-5 h-5"></i> Enviar por Correo
                    </button>
                    <button onclick="window.closeModal()" class="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 mt-2">Solo guardar</button>
                </div>
            </div>
        `);
        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        showNotification('Error al generar OC: ' + err.message, 'error');
    }
};

// ─── TICKET TÉRMICO ───────────────────────────────────────────────────────────
window.posImprimirTicket = (folio, total, subtotal, descuentoAmt, propinaAmt) => {
    const { metodoPago, descuento, propina, efectivoPagado, tarjetaPagado } = posState;
    const cambio = metodoPago === 'efectivo' && efectivoPagado > 0 ? efectivoPagado - total : 0;
    const conf = DB.configuracion || {};
    const empresa = conf.nombreEmpresa || 'Stock Central';
    const rfc = conf.rfc ? `<div class="center text-sm font-mono mt-1">RFC: ${conf.rfc}</div>` : '';
    const logoHtml = conf.logo_url ? `<img src="${conf.logo_url}" class="ticket-logo">` : '';
    const direccion = conf.direccion ? `<div class="center text-sm mb-1 mt-1">${conf.direccion}</div>` : '';
    const telefono = conf.telefono ? `<div class="center text-sm mb-2">Tel: ${conf.telefono}</div>` : '';
    const mensajePie = conf.mensaje_ticket || '¡Gracias por su visita!';
    const fecha = new Date().toLocaleString('es-MX');

    const ticketHTML = `
        <html><head><title>Ticket</title>
        <style>
        body{font-family:'Courier New',monospace;font-size:12px;width:280px;margin:0 auto;padding:10px;color:#000;line-height:1.2}
        .center{text-align:center}.bold{font-weight:bold}.text-sm{font-size:10px}
        .mt-1{margin-top:3px}.mb-1{margin-bottom:3px}.mb-2{margin-bottom:6px}
        .line{border-top:1px dashed #000;margin:6px 0}
        .row{display:flex;justify-content:space-between;margin:3px 0}
        .total-row{font-size:15px;font-weight:bold;margin-top:5px}
        .ticket-logo{max-width:140px;max-height:100px;margin:0 auto 10px auto;display:block;filter:grayscale(100%) contrast(1.2)}
        .item-name{flex:1;padding-right:10px}.item-price{white-space:nowrap}
        .nota{font-size:10px;font-style:italic;margin-left:15px;margin-bottom:5px;color:#444}
        @media print{body{width:100%}}
        </style></head><body>
        ${logoHtml}
        <div class="center bold" style="font-size:18px;text-transform:uppercase;">${empresa}</div>
        ${rfc}${direccion}${telefono}
        <div class="line"></div>
        <div class="center">${fecha}</div>
        <div class="center">Folio: <b>${folio}</b></div>
        <div class="center text-sm mt-1">Atendió: ${AppState.user?.nombre || 'Cajero'}</div>
        <div class="line"></div>
        ${posState.orden.map(i => `
            <div class="row"><span class="item-name">${i.cantidad}x ${i.receta.nombre}</span><span class="item-price">${formatCurrency(i.subtotal)}</span></div>
            ${i.nota ? `<div class="nota">>> ${i.nota}</div>` : ''}
        `).join('')}
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
        ${descuento > 0 ? `<div class="row text-sm"><span>Descuento (${descuento}%)</span><span>-${formatCurrency(descuentoAmt)}</span></div>` : ''}
        ${propina > 0 ? `<div class="row text-sm"><span>Propina</span><span>+${formatCurrency(propinaAmt)}</span></div>` : ''}
        <div class="row total-row"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
        <div class="center bold" style="font-size:10px;margin-top:4px;margin-bottom:6px;">*** INCLUYE I.V.A. ***</div>
        <div class="line"></div>
        <div class="row text-sm"><span>Método:</span><span style="text-transform:capitalize">${metodoPago}</span></div>
        ${metodoPago === 'efectivo' && efectivoPagado > 0 ? `
            <div class="row text-sm"><span>Recibido:</span><span>${formatCurrency(efectivoPagado)}</span></div>
            <div class="row bold"><span>Cambio:</span><span>${formatCurrency(cambio)}</span></div>` : ''}
        ${metodoPago === 'mixto' ? `
            <div class="row text-sm"><span>Efectivo:</span><span>${formatCurrency(efectivoPagado)}</span></div>
            <div class="row text-sm"><span>Tarjeta:</span><span>${formatCurrency(tarjetaPagado)}</span></div>` : ''}
        <div class="line"></div>
        <div class="center bold" style="margin-top:15px;font-size:12px;text-transform:uppercase;">${mensajePie}</div>
        <div class="center" style="margin-top:10px;font-size:9px;line-height:1.1;">
            Comprobante simplificado. Para factura CFDI solicítela en mostrador o envíe este folio y sus datos fiscales por correo dentro del mes en curso.
        </div>
        <div class="center" style="margin-top:15px;font-size:9px;color:#666;border-top:1px dotted #ccc;padding-top:5px;">Stock Central POS</div>
        </body></html>`;

    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) { win.document.write(ticketHTML); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 800); }
};