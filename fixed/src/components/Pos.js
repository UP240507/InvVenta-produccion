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

        <div class="flex-1 flex flex-col gap-3 min-w-0 min-h-0 overflow-hidden">
            <div class="bg-white rounded-xl border shadow-sm p-3 flex gap-3 items-center flex-wrap">
                <div class="relative flex-1 min-w-[200px]">
                    <input id="posBusqueda"
                        oninput="posState.busqueda=this.value; window.actualizarGridRecetas()"
                        class="w-full pl-9 pr-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                        placeholder="Buscar platillo o escanear código...">
                    <i data-lucide="search" class="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"></i>
                </div>
                <div class="flex gap-2 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
                    <button onclick="posState.categoriaFiltro=''; window.actualizarGridRecetas()"
                        id="catBtn-todos"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500">
                        Todos
                    </button>
                    ${categorias.map(c => `
                        <button onclick="posState.categoriaFiltro='${c}'; window.actualizarGridRecetas()"
                            id="catBtn-${c.replace(/\s+/g,'_')}"
                            class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all bg-white text-gray-600 hover:bg-gray-50">
                            ${c}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div id="posGridRecetas" class="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 pb-4"></div>
            </div>
        </div>

        <div class="w-full lg:w-96 flex-shrink-0 flex flex-col bg-white rounded-xl border shadow-sm overflow-hidden" style="height: min(65vh, calc(100vh - 140px)); min-height: 420px;">

            <div class="bg-slate-900 px-5 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                    <h3 class="text-white font-bold text-lg">Orden Actual</h3>
                    <p class="text-slate-400 text-xs">${new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long'})}</p>
                </div>
                <button onclick="window.posCancelarOrden()" class="text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded-lg transition-all" title="Limpiar orden">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </div>

            <div id="posOrdenItems" class="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0 custom-scrollbar">
                <p class="text-center text-gray-400 text-sm py-8">
                    <i data-lucide="shopping-bag" class="w-8 h-8 mx-auto mb-2 opacity-30"></i><br>
                    Selecciona platillos del catálogo o usa el escáner
                </p>
            </div>

            <div class="px-4 py-3 border-t bg-gray-50 space-y-2 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <label class="text-sm font-bold text-gray-600 whitespace-nowrap w-24">Descuento %</label>
                    <input type="number" id="posDescuento" min="0" max="100" value="${posState.descuento}"
                        oninput="posState.descuento=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.actualizarOrdenPOS()"
                        class="w-20 border p-2 rounded-lg text-sm text-center focus:ring-2 focus:ring-orange-400 outline-none">
                    <div class="flex-1 text-right">
                        <span class="text-xs text-gray-500">−</span>
                        <span id="posDescuentoAmt" class="text-sm font-bold text-red-500 ml-1">$0.00</span>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <label class="text-sm font-bold text-gray-600 whitespace-nowrap w-24">Propina %</label>
                    <input type="number" id="posPropina" min="0" max="100" value="${posState.propina}"
                        oninput="posState.propina=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.actualizarOrdenPOS()"
                        class="w-20 border p-2 rounded-lg text-sm text-center focus:ring-2 focus:ring-green-400 outline-none">
                    <div class="flex-1 text-right">
                        <span class="text-xs text-gray-500">+</span>
                        <span id="posPropinaAmt" class="text-sm font-bold text-green-600 ml-1">$0.00</span>
                    </div>
                </div>
            </div>

            <div class="px-4 py-3 border-t space-y-1 flex-shrink-0">
                <div class="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span><span id="posSubtotal">$0.00</span>
                </div>
                <div id="posDescuentoRow" class="flex justify-between text-sm text-red-500 hidden">
                    <span>Descuento</span><span id="posDescuentoTotal">−$0.00</span>
                </div>
                <div id="posPropinaRow" class="flex justify-between text-sm text-green-600 hidden">
                    <span>Propina</span><span id="posPropinaTotal">+$0.00</span>
                </div>
                <div class="flex justify-between text-xl font-black text-gray-900 border-t pt-2 mt-1">
                    <span>TOTAL</span><span id="posTotal">$0.00</span>
                </div>
            </div>

            <div class="px-4 py-3 border-t bg-gray-50 flex-shrink-0">
                <p class="text-xs font-bold text-gray-500 uppercase mb-2">Método de pago</p>
                <div class="grid grid-cols-3 gap-2">
                    <button onclick="posState.metodoPago='efectivo'; window.actualizarOrdenPOS()" id="btnPagoEfectivo"
                        class="py-2 rounded-lg text-xs font-bold border transition-all bg-green-500 text-white border-green-500">
                        💵 Efectivo
                    </button>
                    <button onclick="posState.metodoPago='tarjeta'; posState.numTarjeta=''; window.actualizarOrdenPOS()" id="btnPagoTarjeta"
                        class="py-2 rounded-lg text-xs font-bold border transition-all bg-white text-gray-600">
                        💳 Tarjeta
                    </button>
                    <button onclick="posState.metodoPago='mixto'; window.actualizarOrdenPOS()" id="btnPagoMixto"
                        class="py-2 rounded-lg text-xs font-bold border transition-all bg-white text-gray-600">
                        🔀 Mixto
                    </button>
                </div>

                <div id="posMixtoFields" class="hidden mt-3">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-xs text-gray-500">Efectivo</label>
                            <input type="number" id="posEfectivoMixto" min="0" value="0"
                                oninput="posState.efectivoPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS()"
                                class="w-full border p-2 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none">
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">Tarjeta</label>
                            <input type="number" id="posTarjetaMixto" min="0" value="0"
                                oninput="posState.tarjetaPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS()"
                                class="w-full border p-2 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none">
                        </div>
                    </div>
                    <div id="posMixtoValidacion" class="mt-2 text-xs text-center font-bold hidden"></div>
                </div>

                <div id="posCambioField" class="mt-3">
                    <div class="flex gap-2 items-center">
                        <label class="text-xs text-gray-500 whitespace-nowrap">Con cuánto paga:</label>
                        <input type="number" id="posEfectivoRecibido" min="0" value="0"
                            oninput="posState.efectivoPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS()"
                            class="flex-1 border p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-400 outline-none">
                    </div>
                    <div id="posCambioDisplay" class="mt-2 text-center text-sm font-bold hidden"></div>
                </div>
                <div id="posTarjetaField" class="mt-3 hidden">
                    <label class="text-xs text-gray-500 block mb-1">4 últimos dígitos (opcional):</label>
                    <div class="flex gap-2 items-center">
                        <input type="text" id="posNumTarjeta" maxlength="16" placeholder="•••• •••• •••• ____"
                            oninput="posState.numTarjeta=this.value; window.actualizarOrdenPOS()"
                            class="flex-1 border p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none font-mono tracking-widest">
                        <span id="posTarjetaTipo" class="text-xs font-black text-slate-500 whitespace-nowrap min-w-[80px]"></span>
                    </div>
                </div>
            </div>

            <div class="p-4 border-t flex-shrink-0">
                <button onclick="window.posCobrar()"
                    class="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-xl font-black text-lg shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
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

    // Actualizar color de botones de categoría
    document.querySelectorAll('[id^="catBtn-"]').forEach(btn => {
        btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all bg-white text-gray-600 hover:bg-gray-50";
    });
    const activeBtn = document.getElementById(posState.categoriaFiltro ? `catBtn-${posState.categoriaFiltro.replace(/\s+/g,'_')}` : 'catBtn-todos');
    if (activeBtn) activeBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500";

    if (recetas.length === 0) {
        container.innerHTML = `<div class="col-span-2 md:col-span-3 xl:col-span-4 text-center py-12 text-gray-400">
            <i data-lucide="search-x" class="w-10 h-10 mx-auto mb-2 opacity-30"></i>
            <p>No se encontraron platillos</p>
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
            class="relative bg-white border-2 rounded-xl p-4 text-left transition-all
                   ${stockOk ? 'hover:shadow-md hover:-translate-y-0.5 hover:border-orange-400 cursor-pointer' : 'opacity-40 cursor-not-allowed border-gray-100'}
                   ${enOrden ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}">
            ${enOrden ? `<span class="absolute top-2 right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">${enOrden.cantidad}</span>` : ''}
            <div class="mb-2 text-2xl">${getCategoriaEmoji(r.categoria)}</div>
            <p class="font-bold text-gray-800 text-sm leading-tight mb-1">${r.nombre}</p>
            <p class="text-xs text-gray-400 font-mono mb-2">${r.codigo_pos || '---'}</p>
            <p class="font-black text-orange-600 text-sm">${precio}</p>
            ${!stockOk ? '<p class="text-xs text-red-500 mt-1 font-bold">⚠ Sin stock</p>' : ''}
        </button>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

// ─── LÓGICA DE ESCÁNER DE CÓDIGO DE BARRAS ────────────────────────────────────
window.posEscanearCodigo = (codigoBuscado) => {
    const receta = DB.recetas.find(r => (r.codigo_pos || '').toUpperCase() === codigoBuscado.toUpperCase());
    if (receta) {
        window.posAgregarReceta(receta.id);
        showNotification(`Agregado: ${receta.nombre}`, 'success');
    } else {
        showNotification(`El código de barras ${codigoBuscado} no existe en el menú`, 'error');
    }
};

// ─── AGREGAR RECETA Y NOTAS ───────────────────────────────────────────────────
window.posAgregarReceta = (id) => {
    const receta = DB.recetas.find(r => r.id === id);
    if (!receta) return;

    const existente = posState.orden.find(x => x.receta.id === id);
    const cantNueva = existente ? existente.cantidad + 1 : 1;

    const check = verificarStock(receta, cantNueva);
    if (!check.ok) return showNotification(`⚠️ Stock insuficiente de ingrediente: ${check.nombre}`, 'error');

    if (existente) {
        existente.cantidad++;
        existente.subtotal = existente.cantidad * existente.precioUnit;
    } else {
        posState.orden.push({
            receta,
            cantidad: 1,
            precioUnit: receta.precio_venta || 0,
            subtotal: receta.precio_venta || 0,
            nota: '' // Campo nuevo para instrucciones a cocina
        });
    }

    window.actualizarOrdenPOS();
    window.actualizarGridRecetas();
};

window.posAgregarNota = (idx) => {
    const notaActual = posState.orden[idx].nota || '';
    const nuevaNota = prompt(`Nota especial para: ${posState.orden[idx].receta.nombre}\n(Ej: Sin cebolla, bien cocido, para llevar)`, notaActual);
    if (nuevaNota !== null) {
        posState.orden[idx].nota = nuevaNota.trim();
        window.actualizarOrdenPOS();
    }
};

// ─── Actualizar panel de orden ────────────────────────────────────────────────
window.actualizarOrdenPOS = () => {
    const { subtotal, descuentoAmt, propinaAmt, total } = calcTotales();

    const itemsDiv = document.getElementById('posOrdenItems');
    if (itemsDiv) {
        itemsDiv.innerHTML = posState.orden.length === 0
            ? `<p class="text-center text-gray-400 text-sm py-8">
                <i data-lucide="shopping-bag" class="w-8 h-8 mx-auto mb-2 opacity-30"></i><br>
                Selecciona platillos del catálogo o usa el escáner
               </p>`
            : posState.orden.map((item, idx) => `
                <div class="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border relative group">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-gray-800 truncate">${item.receta.nombre}</p>
                        <p class="text-xs text-gray-500">${formatCurrency(item.precioUnit)} c/u</p>
                        ${item.nota ? `<p class="text-[10px] text-orange-600 font-bold italic mt-0.5 bg-orange-100/50 px-1 rounded inline-block truncate max-w-full">Nota: ${item.nota}</p>` : ''}
                    </div>
                    
                    <button onclick="window.posAgregarNota(${idx})" class="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-colors" title="Agregar nota a cocina">
                        <i data-lucide="message-square-edit" class="w-4 h-4"></i>
                    </button>

                    <div class="flex items-center gap-1">
                        <button onclick="window.posQuitarUno(${idx})" class="w-6 h-6 bg-white border rounded-full text-gray-600 hover:bg-red-50 hover:text-red-500 text-sm font-bold flex items-center justify-center">−</button>
                        <span class="w-6 text-center text-sm font-black">${item.cantidad}</span>
                        <button onclick="window.posAgregarUno(${idx})" class="w-6 h-6 bg-white border rounded-full text-gray-600 hover:bg-green-50 hover:text-green-500 text-sm font-bold flex items-center justify-center">+</button>
                    </div>
                    <span class="text-sm font-black text-gray-800 w-16 text-right">${formatCurrency(item.subtotal)}</span>
                    <button onclick="window.posEliminarItem(${idx})" class="text-red-400 hover:text-red-600 p-1">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>
            `).join('');
    }

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

    const colores = {
        efectivo: 'bg-green-500 text-white border-green-500',
        tarjeta:  'bg-blue-500 text-white border-blue-500',
        mixto:    'bg-purple-500 text-white border-purple-500'
    };
    ['efectivo', 'tarjeta', 'mixto'].forEach(m => {
        const btn = document.getElementById(`btnPago${m.charAt(0).toUpperCase() + m.slice(1)}`);
        if (btn) btn.className = `py-2 rounded-lg text-xs font-bold border transition-all ${posState.metodoPago === m ? colores[m] : 'bg-white text-gray-600 hover:bg-gray-50'}`;
    });

    const mixtoFields = document.getElementById('posMixtoFields');
    const cambioField = document.getElementById('posCambioField');
    if (mixtoFields) mixtoFields.classList.toggle('hidden', posState.metodoPago !== 'mixto');
    if (cambioField) cambioField.classList.toggle('hidden', posState.metodoPago !== 'efectivo');

    // Mostrar/ocultar campo de tarjeta y detectar tipo
    const tarjetaField = document.getElementById('posTarjetaField');
    if (tarjetaField) tarjetaField.classList.toggle('hidden', posState.metodoPago !== 'tarjeta');
    if (posState.metodoPago === 'tarjeta' && posState.numTarjeta) {
        const info = window.detectarTipoTarjeta ? window.detectarTipoTarjeta(posState.numTarjeta) : null;
        const tipoEl = document.getElementById('posTarjetaTipo');
        if (tipoEl) tipoEl.textContent = info ? `${info.icono} ${info.tipo}` : '';
    }

    const mixtoValidacion = document.getElementById('posMixtoValidacion');
    if (mixtoValidacion && posState.metodoPago === 'mixto') {
        const suma = posState.efectivoPagado + posState.tarjetaPagado;
        const diff = suma - total;
        if (posState.efectivoPagado > 0 || posState.tarjetaPagado > 0) {
            mixtoValidacion.classList.remove('hidden');
            if (Math.abs(diff) < 0.01) {
                mixtoValidacion.className = 'mt-2 text-xs text-center font-bold text-green-600';
                mixtoValidacion.textContent = '✓ Pago completo';
            } else if (diff < 0) {
                mixtoValidacion.className = 'mt-2 text-xs text-center font-bold text-red-500';
                mixtoValidacion.textContent = `Faltan ${formatCurrency(Math.abs(diff))}`;
            } else {
                mixtoValidacion.className = 'mt-2 text-xs text-center font-bold text-blue-500';
                mixtoValidacion.textContent = `Sobrante (Cambio) ${formatCurrency(diff)}`;
            }
        } else {
            mixtoValidacion.classList.add('hidden');
        }
    }

    const cambioDisplay = document.getElementById('posCambioDisplay');
    if (cambioDisplay && posState.metodoPago === 'efectivo') {
        if (posState.efectivoPagado > 0) {
            const cambio = posState.efectivoPagado - total;
            cambioDisplay.classList.remove('hidden');
            cambioDisplay.className = `mt-2 text-center text-sm font-bold ${cambio >= 0 ? 'text-green-600' : 'text-red-500'}`;
            cambioDisplay.textContent = cambio >= 0 ? `Cambio a entregar: ${formatCurrency(cambio)}` : `Falta efectivo: ${formatCurrency(Math.abs(cambio))}`;
        } else {
            cambioDisplay.classList.add('hidden');
        }
    }

    if (window.lucide) window.lucide.createIcons();
};

window.posAgregarUno = (idx) => {
    const item = posState.orden[idx];
    const check = verificarStock(item.receta, item.cantidad + 1);
    if (!check.ok) return showNotification(`⚠️ Stock insuficiente de: ${check.nombre}`, 'error');
    item.cantidad++;
    item.subtotal = item.cantidad * item.precioUnit;
    window.actualizarOrdenPOS();
    window.actualizarGridRecetas();
};

window.posQuitarUno = (idx) => {
    posState.orden[idx].cantidad--;
    if (posState.orden[idx].cantidad <= 0) posState.orden.splice(idx, 1);
    else posState.orden[idx].subtotal = posState.orden[idx].cantidad * posState.orden[idx].precioUnit;
    window.actualizarOrdenPOS();
    window.actualizarGridRecetas();
};

window.posEliminarItem = (idx) => {
    posState.orden.splice(idx, 1);
    window.actualizarOrdenPOS();
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
        window.actualizarOrdenPOS();
        window.actualizarGridRecetas();
    }
};

// ─── COBRAR ───────────────────────────────────────────────────────────────────
window.posCobrar = async () => {
    if (posState.orden.length === 0) return showNotification('Agrega platillos a la orden primero', 'error');

    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotales();

    if (posState.metodoPago === 'mixto') {
        const sumPago = posState.efectivoPagado + posState.tarjetaPagado;
        if (Math.abs(sumPago - total) > 0.01) {
            return showNotification(`El pago mixto (${formatCurrency(sumPago)}) no cubre el total exacto (${formatCurrency(total)})`, 'error');
        }
    }

    if (posState.metodoPago === 'efectivo' && posState.efectivoPagado > 0 && posState.efectivoPagado < total) {
        return showNotification('El efectivo recibido es menor al total de la cuenta', 'error');
    }

    for (const item of posState.orden) {
        const check = verificarStock(item.receta, item.cantidad);
        if (!check.ok) return showNotification(`⚠️ El ingrediente '${check.nombre}' no tiene stock suficiente para completar esta orden.`, 'error');
    }

    window.openModal(`
        <div class="p-8">
            <h2 class="text-2xl font-bold mb-2 text-gray-800">Confirmar Cobro</h2>
            <p class="text-gray-500 text-sm mb-6">Verifica los datos antes de emitir el ticket</p>
            
            <div class="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm border border-gray-200">
                ${posState.orden.map(i => `
                    <div class="flex justify-between">
                        <span class="text-gray-600">${i.cantidad}x ${i.receta.nombre}</span>
                        <span class="font-bold">${formatCurrency(i.subtotal)}</span>
                    </div>
                `).join('')}
                
                <div class="border-t border-gray-200 pt-2 mt-2 space-y-1">
                    <div class="flex justify-between text-gray-500"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                    ${posState.descuento > 0 ? `<div class="flex justify-between text-red-500"><span>Descuento ${posState.descuento}%</span><span>−${formatCurrency(descuentoAmt)}</span></div>` : ''}
                    ${posState.propina > 0 ? `<div class="flex justify-between text-green-600"><span>Propina ${posState.propina}%</span><span>+${formatCurrency(propinaAmt)}</span></div>` : ''}
                    <div class="flex justify-between font-black text-xl mt-2 pt-2 border-t border-gray-200"><span>TOTAL A COBRAR</span><span class="text-orange-600">${formatCurrency(total)}</span></div>
                </div>
                
                <div class="border-t border-gray-200 pt-3 mt-3 space-y-1 bg-white p-3 rounded-lg border">
                    <div class="flex justify-between text-xs text-gray-500">
                        <span>Método de pago:</span><span class="font-bold uppercase tracking-wider text-gray-700">${posState.metodoPago}</span>
                    </div>
                    ${posState.metodoPago === 'efectivo' && posState.efectivoPagado > 0 ? `
                        <div class="flex justify-between text-xs text-green-600 font-bold mt-1">
                            <span>Cambio a entregar:</span><span>${formatCurrency(posState.efectivoPagado - total)}</span>
                        </div>` : ''}
                    ${posState.metodoPago === 'mixto' ? `
                        <div class="flex justify-between text-xs text-gray-500"><span>Efectivo:</span><span>${formatCurrency(posState.efectivoPagado)}</span></div>
                        <div class="flex justify-between text-xs text-gray-500"><span>Tarjeta:</span><span>${formatCurrency(posState.tarjetaPagado)}</span></div>
                    ` : ''}
                </div>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="closeModal()" class="flex-1 border py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors">Modificar Orden</button>
                <button onclick="window.posConfirmarCobro()" id="btnConfirmarCobro"
                    class="flex-1 bg-orange-600 text-white py-3 rounded-xl font-black hover:bg-orange-700 flex items-center justify-center gap-2 shadow-lg shadow-orange-200 transition-transform active:scale-95">
                    <i data-lucide="printer" class="w-5 h-5"></i> Cobrar e Imprimir
                </button>
            </div>
        </div>
    `);
};

window.posConfirmarCobro = async () => {
    const btn = document.getElementById('btnConfirmarCobro');
    if (btn) { btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Registrando venta...'; }

    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotales();
    const folio = `POS-${Date.now()}`;

    try {
        const productosAfectados = new Map();
        for (const item of posState.orden) {
            for (const ing of (item.receta.ingredientes || [])) {
                const actual = productosAfectados.get(ing.productoId) || 0;
                productosAfectados.set(ing.productoId, actual + (ing.cantidad * item.cantidad));
            }
        }

        // Descuento en lote de inventario
        for (const [productoId, cantDescuento] of productosAfectados) {
            const prod = DB.productos.find(p => p.id === productoId);
            const nuevoStock = prod.stock - cantDescuento;
            const { error } = await supabase.from('productos').update({ stock: nuevoStock }).eq('id', productoId);
            if (error) throw error;
            
            const descripcion = posState.orden.map(i => `${i.receta.nombre} x${i.cantidad}`).join(', ');
            await registrarMovimientoEnNube('Venta POS', productoId, -cantDescuento, `Folio ${folio}: ${descripcion}`);
        }

        // Registro de la Venta Financiera
        try {
            await supabase.from('ventas').insert({
                folio,
                items: posState.orden.map(i => ({ 
                    recetaId: i.receta.id, 
                    nombre: i.receta.nombre, 
                    cantidad: i.cantidad, 
                    precio: i.precioUnit,
                    nota: i.nota || ''
                })),
                subtotal,
                descuento: posState.descuento,
                descuento_monto: descuentoAmt,
                propina: propinaAmt,
                total,
                metodo_pago: posState.metodoPago,
                tipo_tarjeta: posState.metodoPago === 'tarjeta' && posState.numTarjeta ? (window.detectarTipoTarjeta ? (window.detectarTipoTarjeta(posState.numTarjeta)?.tipo || '') : '') : '',
                efectivo: posState.efectivoPagado,
                tarjeta: posState.tarjetaPagado,
                usuario: AppState.user?.nombre || 'Sistema',
                fecha: new Date().toISOString()
            });
        } catch(_) { console.warn("Error guardando historial de venta. Verifica la tabla ventas"); }

        await cargarDatosDeNube();

        // Verificamos si algún producto cayó por debajo del mínimo
        const productosBajos = [];
        for (const [productoId] of productosAfectados) {
            const prod = DB.productos.find(p => p.id === productoId);
            if (prod && prod.stock <= prod.min) productosBajos.push(prod);
        }

        // Imprimir Ticket Fiscal
        window.posImprimirTicket(folio, total, subtotal, descuentoAmt, propinaAmt);
        
        window.closeModal();
        showNotification(`✅ Venta cobrada correctamente (${folio})`, 'success');

        // Limpiar el estado para el siguiente cliente
        posState.orden = [];
        posState.descuento = 0;
        posState.propina = 0;
        posState.efectivoPagado = 0;
        posState.tarjetaPagado = 0;
        posState.numTarjeta = '';
        posState.busqueda = '';
        const searchInput = document.getElementById('posBusqueda');
        if(searchInput) searchInput.value = '';
        
        window.actualizarOrdenPOS();
        window.actualizarGridRecetas();

        // Lanzar alerta de stock si es necesario
        if (productosBajos.length > 0) {
            setTimeout(() => window.posModalOrdenCompraAutomatica(productosBajos), 1500);
        }

    } catch (err) {
        console.error(err);
        showNotification('Error crítico al procesar venta: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer"></i> Reintentar Cobro'; }
    }
};

// ─── Modal Orden de Compra Automática ─────────────────────────────────────────
window.posModalOrdenCompraAutomatica = (productosBajos) => {
    window.openModal(`
        <div class="p-8">
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-yellow-100 p-2 rounded-lg"><i data-lucide="alert-triangle" class="w-6 h-6 text-yellow-600"></i></div>
                <h2 class="text-xl font-bold text-gray-800">Alerta de Stock Crítico</h2>
            </div>
            <p class="text-gray-500 text-sm mb-5">Tras esta venta, los siguientes ingredientes cayeron por debajo de su límite de seguridad. ¿Deseas generar una orden de compra para reabastecer?</p>
            <div class="bg-yellow-50 rounded-xl p-4 mb-5 space-y-2 border border-yellow-200">
                ${productosBajos.map(p => `
                    <div class="flex justify-between items-center text-sm border-b border-yellow-100 pb-1 last:border-0 last:pb-0">
                        <span class="font-bold text-gray-700">${p.nombre}</span>
                        <div class="text-right">
                            <span class="text-red-600 font-black">${p.stock} ${p.unidad}</span>
                            <span class="text-gray-400 text-xs ml-1">(Mínimo exigido: ${p.min})</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mb-5">
                <label class="block text-sm font-bold text-gray-700 mb-2">Asignar a un Proveedor (Obligatorio)</label>
                <select id="posProveedorOC" class="w-full border p-3 rounded-xl bg-white focus:ring-2 focus:ring-yellow-400 outline-none">
                    <option value="">— Selecciona a quién comprarle —</option>
                    ${DB.proveedores.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="flex gap-3">
                <button onclick="closeModal()" class="flex-1 border py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors">Omitir por ahora</button>
                <button onclick="window.posGenerarOrdenCompra(${JSON.stringify(productosBajos.map(p => p.id))})"
                    class="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-black hover:bg-yellow-600 flex items-center justify-center gap-2 shadow-lg shadow-yellow-200 transition-transform active:scale-95">
                    <i data-lucide="shopping-cart" class="w-5 h-5"></i> Generar Orden Automática
                </button>
            </div>
        </div>
    `);
};

// ─── Generar Orden de Compra Automática ──────────────────────────────────────
window.posGenerarOrdenCompra = async (productoIds) => {
    const proveedorNombre = document.getElementById('posProveedorOC')?.value;

    if (!proveedorNombre) {
        return showNotification('⚠️ Selecciona un proveedor de la lista para continuar.', 'error');
    }

    const items = productoIds.map(id => {
        const prod = DB.productos.find(p => p.id === id);
        // Fórmula de abastecimiento: Pedir suficiente para llegar al doble del mínimo
        const cantSugerida = Math.max(prod.min * 2 - prod.stock, prod.min);
        return {
            productoId: prod.id,
            nombre: prod.nombre,
            cant: cantSugerida,
            cantidad: cantSugerida, 
            precio: prod.precio,
            unidad: prod.unidad
        };
    });

    const total = items.reduce((s, i) => s + i.cant * i.precio, 0);
    const numeroOC = `OC-${Date.now().toString().slice(-6)}`;

    try {
        const { data, error } = await supabase.from('ordenes_compra').insert({
            numero: numeroOC,
            proveedor: proveedorNombre,
            estado: 'pendiente',
            items,
            total,
            fecha: new Date().toISOString(),
            referencia: 'Generada automáticamente por POS',
            usuario: AppState.user?.nombre || 'Sistema'
        }).select();
        
        if (error) throw error;

        const idOrdenCreada = data[0].id;
        await cargarDatosDeNube();

        // Pop-up de Envío Inmediato
        window.openModal(`
            <div class="p-8 text-center">
                <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6 shadow-inner">
                    <i data-lucide="check" class="h-8 w-8 text-green-600"></i>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mb-2">¡Orden de Compra Lista!</h2>
                <p class="text-gray-500 mb-8 text-sm px-4">El stock bajo fue reportado y la orden <b>${numeroOC}</b> fue creada. ¿Deseas enviarla a <b>${proveedorNombre}</b> en este momento?</p>
                
                <div class="grid grid-cols-1 gap-3">
                    <button onclick="window.enviarPorWhatsApp(${idOrdenCreada})" class="w-full bg-[#25D366] text-white py-3.5 rounded-xl font-bold hover:bg-[#128C7E] flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition-transform hover:-translate-y-1">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        Enviar por WhatsApp
                    </button>
                    <button onclick="window.enviarPorCorreo(${idOrdenCreada})" class="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-transform hover:-translate-y-1">
                        <i data-lucide="mail" class="w-5 h-5"></i> Enviar por Correo Electrónico
                    </button>
                    <button onclick="window.closeModal()" class="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 mt-2 transition-colors">
                        Omitir envío (Solo guardar)
                    </button>
                </div>
            </div>
        `);
        
        if(window.lucide) window.lucide.createIcons();

    } catch (err) {
        showNotification('Error de conexión al generar OC: ' + err.message, 'error');
    }
};

// ─── TICKET TÉRMICO LEGAL (IMPRESIÓN) ─────────────────────────────────────────
window.posImprimirTicket = (folio, total, subtotal, descuentoAmt, propinaAmt) => {
    const { metodoPago, descuento, propina, efectivoPagado, tarjetaPagado } = posState;
    const cambio = metodoPago === 'efectivo' && efectivoPagado > 0 ? efectivoPagado - total : 0;
    
    // Extracción de datos fiscales desde Configuración
    const conf = DB.configuracion || {};
    const empresa = conf.nombreEmpresa || 'Stock Central';
    const rfc = conf.rfc ? `<div class="center text-sm font-mono mt-1">RFC: ${conf.rfc}</div>` : '';
    const logoHtml = conf.logo_url ? `<img src="${conf.logo_url}" class="ticket-logo">` : '';
    const direccion = conf.direccion ? `<div class="center text-sm mb-1 mt-1">${conf.direccion}</div>` : '';
    const telefono = conf.telefono ? `<div class="center text-sm mb-2">Tel: ${conf.telefono}</div>` : '';
    const mensajePie = conf.mensaje_ticket || '¡Gracias por su visita!';
    const fecha = new Date().toLocaleString('es-MX');

    // Generación de la plantilla HTML para la impresora (80mm o 58mm)
    const ticketHTML = `
        <html><head>
            <title>Ticket de Venta</title>
            <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; color: #000; line-height: 1.2; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .text-sm { font-size: 10px; }
            .mt-1 { margin-top: 3px; }
            .mb-1 { margin-bottom: 3px; }
            .mb-2 { margin-bottom: 6px; }
            .line { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin: 3px 0; }
            .total-row { font-size: 15px; font-weight: bold; margin-top: 5px; }
            /* Filtro ByN obligatorio para impresoras térmicas */
            .ticket-logo { max-width: 140px; max-height: 100px; margin: 0 auto 10px auto; display: block; object-fit: contain; filter: grayscale(100%) contrast(1.2); }
            .item-name { flex: 1; padding-right: 10px; }
            .item-price { white-space: nowrap; }
            .nota { font-size: 10px; font-style: italic; margin-left: 15px; margin-bottom: 5px; color: #333; }
            @media print { body { width: 100%; } }
        </style></head>
        <body>
            ${logoHtml}
            <div class="center bold" style="font-size:18px; text-transform: uppercase;">${empresa}</div>
            ${rfc}
            ${direccion}
            ${telefono}
            
            <div class="line"></div>
            <div class="center">${fecha}</div>
            <div class="center">Folio de Venta: <b>${folio}</b></div>
            <div class="center text-sm mt-1">Le atendió: ${AppState.user?.nombre || 'Cajero en turno'}</div>
            <div class="line"></div>
            
            ${posState.orden.map(i => `
                <div class="row">
                    <span class="item-name">${i.cantidad}x ${i.receta.nombre}</span>
                    <span class="item-price">${formatCurrency(i.subtotal)}</span>
                </div>
                ${i.nota ? `<div class="nota">>>> Nota cocina: ${i.nota}</div>` : ''}
            `).join('')}
            
            <div class="line"></div>
            <div class="row"><span>Subtotal Neto</span><span>${formatCurrency(subtotal)}</span></div>
            ${descuento > 0 ? `<div class="row text-sm"><span>Descuento aplicado (${descuento}%)</span><span>-${formatCurrency(descuentoAmt)}</span></div>` : ''}
            ${propina > 0 ? `<div class="row text-sm"><span>Propina sugerida</span><span>+${formatCurrency(propinaAmt)}</span></div>` : ''}
            <div class="row total-row"><span>TOTAL A PAGAR</span><span>${formatCurrency(total)}</span></div>
            
            <div class="center bold" style="font-size: 10px; margin-top: 4px; margin-bottom: 6px;">
                *** ESTE TOTAL INCLUYE I.V.A. ***
            </div>
            
            <div class="line"></div>
            
            <div class="row text-sm"><span>Método de pago:</span><span style="text-transform: capitalize;">${metodoPago}</span></div>
            ${metodoPago === 'efectivo' && efectivoPagado > 0 ? `
                <div class="row text-sm"><span>Efectivo Recibido:</span><span>${formatCurrency(efectivoPagado)}</span></div>
                <div class="row bold"><span>Cambio Entregado:</span><span>${formatCurrency(cambio)}</span></div>
            ` : ''}
            ${metodoPago === 'mixto' ? `
                <div class="row text-sm"><span>Abono Efectivo:</span><span>${formatCurrency(posState.efectivoPagado)}</span></div>
                <div class="row text-sm"><span>Abono Tarjeta:</span><span>${formatCurrency(posState.tarjetaPagado)}</span></div>
            ` : ''}
            
            <div class="line"></div>
            <div class="center bold" style="margin-top: 15px; font-size: 12px; text-transform: uppercase;">
                ${mensajePie}
            </div>
            
            <div class="center" style="margin-top: 10px; font-size: 9px; line-height: 1.1;">
                Comprobante simplificado de operación con el público en general. 
                <br>Para solicitar factura electrónica (CFDI), pídala en mostrador o envíe este folio y sus datos fiscales por correo dentro del mes en curso.
            </div>
            
            <div class="center" style="margin-top: 15px; font-size: 9px; color: #666; border-top: 1px dotted #ccc; padding-top: 5px;">
                Caja operada por Stock Central POS
            </div>
        </body></html>
    `;

    // Abrimos ventana oculta para forzar la impresión al instante
    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) {
        win.document.write(ticketHTML);
        win.document.close();
        win.focus();
        setTimeout(() => { 
            win.print(); 
            win.close(); 
        }, 800); // Retraso de 800ms para asegurar que el logo cargó antes de imprimir
    }
};