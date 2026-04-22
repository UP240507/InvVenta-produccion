// src/components/Pos.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { formatCurrency, showNotification, SPINNER_ICON, registrarMovimientoEnNube, detectarTipoTarjeta } from '../utils/helpers.js';

// ─── ESTADO LOCAL DEL POS ────────────────────────────────────────────────────
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

// ThermalPrinter gestionado por src/services/thermalPrinter.js (window.ThermalPrinter)

// ─── HELPERS LOCALES ─────────────────────────────────────────────────────────
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

function verificarStock(receta, cantidadOrdenada) {
    for (const ing of (receta.ingredientes || [])) {
        const prod = DB.productos.find(p => String(p.id) === String(ing.productoId));
        
        // Extraemos la merma y calculamos el rendimiento (ej. 20% merma = 0.80 rendimiento)
        const merma = parseFloat(ing.merma) || 0;
        const rendimiento = Math.max(0.01, 1 - (merma / 100)); // Evita divisiones por cero
        
        // Calculamos cuánto necesitamos sacar del refri realmente para obtener la porción neta
        const cantidadBrutaRequerida = (ing.cantidad / rendimiento) * cantidadOrdenada;

        if (!prod || prod.stock < cantidadBrutaRequerida) {
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

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────────
export function renderPos() {
    const categorias = getCategoriasRecetas();

    const isFreshMount = !document.getElementById('posOrdenItems');
    if (isFreshMount) {
        posState.orden = [];
        posState.descuento = 0;
        posState.propina = 0;
        posState.efectivoPagado = 0;
        posState.tarjetaPagado = 0;
        posState.numTarjeta = '';
        posState.busqueda = '';
        posState.categoriaFiltro = '';
    }

    setTimeout(() => {
        window.actualizarOrdenPOS();
        window.actualizarGridRecetas();
    }, 100);

    return `
    <div class="flex flex-col lg:flex-row gap-4 animate-fade-in lg:h-[calc(100vh-100px)] lg:min-h-[500px]">

        <div class="flex-1 flex flex-col gap-3 min-w-0 min-h-[50vh] lg:min-h-0 lg:overflow-hidden">
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex gap-3 items-center flex-wrap flex-none">
                <div class="relative flex-1 min-w-[200px]">
                    <input id="posBusqueda"
                        oninput="posState.busqueda=this.value; window.actualizarGridRecetas()"
                        class="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-400 outline-none text-sm font-medium transition-colors"
                        placeholder="Buscar platillo o escanear...">
                    <i data-lucide="search" class="absolute left-3 top-3 w-4 h-4 text-slate-400"></i>
                </div>
                <div class="flex gap-2 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
                    <button type="button" onclick="posState.categoriaFiltro=''; window.actualizarGridRecetas()"
                        id="catBtn-todos"
                        class="px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20">
                        Todos
                    </button>
                    ${categorias.map(c => `
                        <button type="button" onclick="posState.categoriaFiltro='${c}'; window.actualizarGridRecetas()"
                            id="catBtn-${c.replace(/\s+/g,'_')}"
                            class="px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border border-slate-200 transition-all bg-white text-slate-600 hover:bg-slate-50 shadow-sm">
                            ${c}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div id="posGridRecetas" class="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-4"></div>
            </div>
        </div>

        <div class="w-full lg:w-[380px] xl:w-[420px] flex-none flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm lg:overflow-hidden lg:h-full">

            <div class="bg-slate-900 px-5 py-4 flex items-center justify-between flex-none">
                <div>
                    <h3 class="text-white font-black text-lg leading-tight">Orden Actual</h3>
                    <p class="text-slate-400 text-[10px] uppercase tracking-widest mt-0.5">${new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'short'})}</p>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="window.ThermalPrinter?.isConnected ? window.disconnectPrinter() : window.connectPrinter()" 
                        class="p-2 rounded-lg transition-all ${window.ThermalPrinter?.isConnected ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-400 hover:text-white'}" 
                        title="${window.ThermalPrinter?.isConnected ? 'Impresora conectada (clic para desconectar)' : 'Conectar impresora ESC/POS'}">
                        <i data-lucide="${window.ThermalPrinter?.isConnected ? 'plug' : 'usb'}" class="w-5 h-5"></i>
                    </button>
                    <button type="button" onclick="window.posCancelarOrden()" class="text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded-lg transition-all" title="Limpiar orden">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>

            <div id="posOrdenItems" class="flex-1 overflow-y-auto max-h-[35vh] lg:max-h-none px-3 py-3 space-y-2 bg-slate-50/50 custom-scrollbar min-h-[150px]">
            </div>

            <div class="flex-none border-t border-slate-200 bg-white flex flex-col">
                
                <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 border-b border-slate-100">
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-orange-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex-1">Desc %</span>
                        <input type="number" id="posDescuento" min="0" max="100" value="${posState.descuento}"
                            oninput="posState.descuento=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.actualizarOrdenPOS(true)"
                            class="w-12 text-right font-black text-slate-800 bg-transparent outline-none">
                    </div>
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-green-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex-1">Prop %</span>
                        <input type="number" id="posPropina" min="0" max="100" value="${posState.propina}"
                            oninput="posState.propina=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.actualizarOrdenPOS(true)"
                            class="w-12 text-right font-black text-slate-800 bg-transparent outline-none">
                    </div>
                </div>

                <div class="px-4 py-2 space-y-1 text-sm bg-white">
                    <div class="flex justify-between text-slate-500 font-medium"><span>Subtotal Neto</span><span id="posSubtotal">$0.00</span></div>
                    <div id="posDescuentoRow" class="flex justify-between text-red-500 text-xs font-bold hidden"><span>Descuento Aplicado</span><span id="posDescuentoTotal">−$0.00</span></div>
                    <div id="posPropinaRow" class="flex justify-between text-green-600 text-xs font-bold hidden"><span>Propina Sugerida</span><span id="posPropinaTotal">+$0.00</span></div>
                    <div class="flex justify-between font-black text-xl text-slate-900 pt-1 mt-1 border-t border-slate-100">
                        <span>TOTAL</span><span id="posTotal" class="text-orange-600">$0.00</span>
                    </div>
                </div>

                <div class="px-4 py-2 bg-slate-50 border-t border-slate-200">
                    <div class="grid grid-cols-3 gap-2">
                        <button type="button" onclick="posState.metodoPago='efectivo'; window.actualizarOrdenPOS(true)" id="btnPagoEfectivo" class="py-2 rounded-xl text-[11px] font-black border transition-all">EFECTIVO</button>
                        <button type="button" onclick="posState.metodoPago='tarjeta'; posState.numTarjeta=''; window.actualizarOrdenPOS(true)" id="btnPagoTarjeta" class="py-2 rounded-xl text-[11px] font-black border transition-all">TARJETA</button>
                        <button type="button" onclick="posState.metodoPago='mixto'; window.actualizarOrdenPOS(true)" id="btnPagoMixto" class="py-2 rounded-xl text-[11px] font-black border transition-all">MIXTO</button>
                    </div>
                    <div id="posCamposPago"></div>
                </div>

                <div class="p-3 bg-white border-t border-slate-200">
                    <button type="button" onclick="window.posCobrar()" id="btnConfirmarCobro" class="w-full bg-orange-600 hover:bg-orange-700 text-white py-3.5 rounded-xl font-black text-lg shadow-xl shadow-orange-500/30 transition-transform active:scale-95 flex items-center justify-center gap-2">
                        <i data-lucide="check-circle" class="w-6 h-6"></i> COBRAR ORDEN
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

// ─── GRID DE RECETAS ──────────────────────────────────────────────────────────
window.actualizarGridRecetas = () => {
    const container = document.querySelector('#posGridRecetas > div');
    if (!container) return; 

    const recetas = getRecetasFiltradas();

    document.querySelectorAll('[id^="catBtn-"]').forEach(btn => {
        btn.className = "px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border border-slate-200 transition-all bg-white text-slate-600 hover:bg-slate-50 shadow-sm";
    });
    const activeBtn = document.getElementById(posState.categoriaFiltro ? `catBtn-${posState.categoriaFiltro.replace(/\s+/g,'_')}` : 'catBtn-todos');
    if (activeBtn) activeBtn.className = "px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20";

    if (recetas.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                <div class="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="search-x" class="w-8 h-8 text-slate-300"></i>
                </div>
                <p class="font-bold text-slate-500">No se encontraron platillos</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = recetas.map(r => {
        // Verificamos si hay stock bruto disponible (incluyendo merma) para mostrarlo activado o no
        const stockOk = (r.ingredientes || []).every(ing => {
            const p = DB.productos.find(x => String(x.id) === String(ing.productoId));
            const merma = parseFloat(ing.merma) || 0;
            const cantidadBruta = ing.cantidad / Math.max(0.01, 1 - (merma / 100));
            return p && p.stock >= cantidadBruta;
        });
        const precio = r.precio_venta ? formatCurrency(r.precio_venta) : 'Sin precio';
        const enOrden = posState.orden.find(x => String(x.receta.id) === String(r.id));

        return `
        <button type="button" onclick="window.posAgregarReceta('${r.id}')" ${!stockOk ? 'disabled' : ''}
            class="relative bg-white border-2 rounded-2xl p-4 text-left transition-all flex flex-col h-full
                   ${stockOk ? 'hover:shadow-lg hover:-translate-y-1 hover:border-orange-400 cursor-pointer' : 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50'}
                   ${enOrden ? 'border-orange-400 bg-orange-50/50 shadow-sm' : 'border-slate-200'}">
            
            ${enOrden ? `<span class="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-bounce-short">${enOrden.cantidad}</span>` : ''}
            
            <div class="mb-2 text-3xl">${getCategoriaEmoji(r.categoria)}</div>
            <p class="font-black text-slate-800 text-sm leading-tight mb-1 flex-1 pr-2">${r.nombre}</p>
            <div class="mt-auto pt-2 border-t border-slate-100">
                <p class="text-[10px] text-slate-400 font-mono mb-0.5">${r.codigo_pos || 'Sin código'}</p>
                <p class="font-black text-orange-600 text-base">${precio}</p>
            </div>
            ${!stockOk ? '<p class="text-[10px] text-red-500 mt-2 font-bold uppercase tracking-widest bg-red-50 px-2 py-1 rounded-md text-center">Sin stock</p>' : ''}
        </button>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

// ─── LÓGICA DE ESCÁNER DE CÓDIGO DE BARRAS ────────────────────────────────────
window.posEscanearCodigo = (codigoBuscado) => {
    const receta = DB.recetas.find(r => String(r.codigo_pos || '').toUpperCase() === String(codigoBuscado).toUpperCase());
    if (receta) {
        window.posAgregarReceta(receta.id);
        showNotification(`✅ ${receta.nombre} agregado`, 'success');
    } else {
        showNotification(`El código ${codigoBuscado} no existe en el menú`, 'error');
    }
};

// ─── AGREGAR RECETA Y NOTAS ───────────────────────────────────────────────────
window.posAgregarReceta = (id) => {
    const receta = DB.recetas.find(r => String(r.id) === String(id));
    if (!receta) return;

    const existente = posState.orden.find(x => String(x.receta.id) === String(id));
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
            nota: '' 
        });
    }

    window.actualizarOrdenPOS(false);
    window.actualizarGridRecetas();
};

window.posAgregarNota = (idx) => {
    const notaActual = posState.orden[idx].nota || '';
    const nuevaNota = prompt(`Nota especial para cocina: ${posState.orden[idx].receta.nombre}\n(Ej: Sin cebolla, para llevar)`, notaActual);
    if (nuevaNota !== null) {
        posState.orden[idx].nota = nuevaNota.trim();
        window.actualizarOrdenPOS(false);
    }
};

// ─── ACTUALIZAR PANEL DE ORDEN ────────────────────────────────────────────────
window.actualizarOrdenPOS = (skipItems = false) => {
    const { subtotal, descuentoAmt, propinaAmt, total } = calcTotales();

    if (!skipItems) {
        const itemsDiv = document.getElementById('posOrdenItems');
        if (itemsDiv) {
            itemsDiv.innerHTML = posState.orden.length === 0
                ? `<div class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 py-6">
                    <i data-lucide="shopping-bag" class="w-12 h-12 mb-3"></i>
                    <p class="text-sm font-bold uppercase tracking-widest">Orden Vacía</p>
                    <p class="text-[10px] mt-1">Toca un platillo para empezar</p>
                   </div>`
                : posState.orden.map((item, idx) => `
                    <div class="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm relative group flex flex-col gap-1.5">
                        <div class="flex justify-between items-start">
                            <div class="flex-1 pr-2 min-w-0">
                                <p class="text-sm font-black text-slate-800 leading-tight truncate">${item.receta.nombre}</p>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">${formatCurrency(item.precioUnit)} c/u</p>
                            </div>
                            <div class="flex flex-col items-end gap-1">
                                <span class="text-sm font-black text-slate-900">${formatCurrency(item.subtotal)}</span>
                                <button type="button" onclick="window.posEliminarItem(${idx})" class="text-slate-300 hover:text-red-500 transition-colors" title="Quitar platillo">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-2 mt-1">
                            <div class="relative flex-1">
                                <i data-lucide="edit-2" class="absolute left-2 top-1.5 w-3.5 h-3.5 text-orange-400"></i>
                                <input type="text" placeholder="Nota a cocina..."
                                    value="${item.nota || ''}"
                                    oninput="posState.orden[${idx}].nota = this.value"
                                    class="w-full pl-7 pr-2 py-1.5 text-[10px] border border-slate-200 rounded-md bg-slate-50 focus:bg-white outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 text-slate-700 transition-all font-medium">
                            </div>
                            <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200 p-0.5 flex-shrink-0">
                                <button type="button" onclick="window.posQuitarUno(${idx})" class="w-7 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-red-500 shadow-sm font-black transition-colors">−</button>
                                <span class="w-6 text-center text-xs font-black text-slate-800">${item.cantidad}</span>
                                <button type="button" onclick="window.posAgregarUno(${idx})" class="w-7 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-green-600 shadow-sm font-black transition-colors">+</button>
                            </div>
                        </div>
                    </div>
                `).join('');
        }
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('posSubtotal', formatCurrency(subtotal));
    set('posTotal', formatCurrency(total));
    set('posDescuentoTotal', `−${formatCurrency(descuentoAmt)}`);
    set('posPropinaTotal', `+${formatCurrency(propinaAmt)}`);

    const descRow = document.getElementById('posDescuentoRow');
    const propRow = document.getElementById('posPropinaRow');
    if (descRow) descRow.classList.toggle('hidden', descuentoAmt === 0);
    if (propRow) propRow.classList.toggle('hidden', propinaAmt === 0);

    const pagoDin = document.getElementById('posCamposPago');
    const focusEnPago = pagoDin && pagoDin.contains(document.activeElement);  
    
    if (pagoDin && !focusEnPago) {
        if (posState.metodoPago === 'efectivo') {
            const cambio = posState.efectivoPagado - total;
            pagoDin.innerHTML = `
                <div class="flex items-center gap-3 mt-2 bg-white p-1.5 rounded-xl border border-slate-200 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100 transition-all">
                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 flex-1">Recibido $</label>
                    <input type="number" min="0" value="${posState.efectivoPagado || ''}" placeholder="0.00"
                        oninput="posState.efectivoPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS(true)"
                        class="w-20 text-right bg-transparent font-black text-slate-800 text-sm outline-none pr-1">
                </div>
                ${posState.efectivoPagado > 0 ? `
                    <div class="mt-1.5 text-center text-xs font-black uppercase py-1.5 rounded-lg border ${cambio >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-100'}">
                        ${cambio >= 0 ? `Cambio a entregar: ${formatCurrency(cambio)}` : `Faltan: ${formatCurrency(Math.abs(cambio))}`}
                    </div>
                ` : ''}
            `;
        } else if (posState.metodoPago === 'tarjeta') {
            const info = posState.numTarjeta ? (window.detectarTipoTarjeta ? window.detectarTipoTarjeta(posState.numTarjeta) : null) : null;
            pagoDin.innerHTML = `
                <div class="flex items-center gap-2 mt-2 bg-white border border-slate-200 rounded-xl p-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">4 Dígitos</label>
                    <input type="text" maxlength="4" value="${posState.numTarjeta || ''}" placeholder="Ej: 4509"
                        oninput="posState.numTarjeta=this.value; window.actualizarOrdenPOS(true)"
                        class="flex-1 text-center bg-transparent text-sm font-mono font-black tracking-widest outline-none text-slate-800">
                    <div class="w-6 text-center text-lg">${info ? info.icono : ''}</div>
                </div>
            `;
        } else if (posState.metodoPago === 'mixto') {
            const diff = (posState.efectivoPagado + posState.tarjetaPagado) - total;
            pagoDin.innerHTML = `
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-purple-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase ml-1 flex-1">EFE</span>
                        <input type="number" value="${posState.efectivoPagado || ''}" placeholder="0.00" oninput="posState.efectivoPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS(true)" class="w-16 text-right font-black text-sm text-slate-800 bg-transparent outline-none">
                    </div>
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-purple-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase ml-1 flex-1">TAR</span>
                        <input type="number" value="${posState.tarjetaPagado || ''}" placeholder="0.00" oninput="posState.tarjetaPagado=parseFloat(this.value)||0; window.actualizarOrdenPOS(true)" class="w-16 text-right font-black text-sm text-slate-800 bg-transparent outline-none">
                    </div>
                </div>
                ${(posState.efectivoPagado > 0 || posState.tarjetaPagado > 0) ? `
                    <div class="mt-1.5 text-center text-xs font-black uppercase py-1.5 rounded-lg border ${Math.abs(diff)<0.01 ? 'bg-green-50 text-green-700 border-green-200' : diff<0 ? 'bg-red-50 text-red-500 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}">
                        ${Math.abs(diff)<0.01 ? '✓ Monto Completo' : diff<0 ? `Faltan: ${formatCurrency(Math.abs(diff))}` : `Sobrante: ${formatCurrency(diff)}`}
                    </div>
                ` : ''}
            `;
        } else {
            pagoDin.innerHTML = '';
        }
    }

    const colores = {
        efectivo: 'bg-green-500 text-white border-green-600 shadow-md shadow-green-500/30',
        tarjeta:  'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/30',
        mixto:    'bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-600/30'
    };
    ['efectivo', 'tarjeta', 'mixto'].forEach(m => {
        const btn = document.getElementById(`btnPago${m.charAt(0).toUpperCase() + m.slice(1)}`);
        if (btn) btn.className = `py-2 rounded-xl text-[11px] font-black tracking-widest uppercase border transition-all ${posState.metodoPago === m ? colores[m] : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`;
    });

    if (window.lucide) window.lucide.createIcons();
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
    if (confirm('¿Estás seguro de cancelar y vaciar la orden actual?')) {
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

// ─── COBRAR Y DESCONTAR INVENTARIO REAL ───────────────────────────────────────
window.posCobrar = async () => {
    if (posState.orden.length === 0) return showNotification('Agrega platillos a la orden primero', 'error');

    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotales();

    if (posState.metodoPago === 'mixto') {
        const sumPago = posState.efectivoPagado + posState.tarjetaPagado;
        if (Math.abs(sumPago - total) > 0.01) {
            return showNotification(`El pago mixto (${formatCurrency(sumPago)}) no cubre el total exacto (${formatCurrency(total)})`, 'error');
        }
    }

    if (posState.metodoPago === 'efectivo' && (!posState.efectivoPagado || posState.efectivoPagado === 0)) {
        posState.efectivoPagado = total; 
    }
    if (posState.metodoPago === 'efectivo' && posState.efectivoPagado < total) {
        return showNotification('El efectivo recibido es menor al total de la cuenta', 'error');
    }

    for (const item of posState.orden) {
        const check = verificarStock(item.receta, item.cantidad);
        if (!check.ok) return showNotification(`⚠️ El ingrediente '${check.nombre}' no tiene stock suficiente para esta orden.`, 'error');
    }

    window.openModal(`
        <div class="p-8">
            <h2 class="text-2xl font-black mb-1 text-slate-800">Confirmar Cobro Final</h2>
            <p class="text-slate-500 text-sm mb-6 font-bold uppercase tracking-widest">Caja Rápida Mostrador</p>
            
            <div class="bg-white rounded-xl border-2 border-slate-200 p-5 mb-5 shadow-sm">
                <div class="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    ${posState.orden.map(i => `
                        <div class="flex justify-between text-sm items-center border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                            <div>
                                <span class="font-bold text-slate-700">${i.cantidad}x ${i.receta.nombre}</span>
                                ${i.nota ? `<p class="text-xs text-orange-500 italic font-medium">↳ ${i.nota}</p>` : ''}
                            </div>
                            <span class="font-black text-slate-800">${formatCurrency(i.subtotal)}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="bg-slate-50 p-4 rounded-xl space-y-1.5 border border-slate-100">
                    <div class="flex justify-between text-slate-500 text-sm"><span>Subtotal Neto</span><span class="font-bold">${formatCurrency(subtotal)}</span></div>
                    ${posState.descuento > 0 ? `<div class="flex justify-between text-red-500 text-sm font-bold"><span>Descuento (${posState.descuento}%)</span><span>−${formatCurrency(descuentoAmt)}</span></div>` : ''}
                    ${posState.propina > 0 ? `<div class="flex justify-between text-green-600 text-sm font-bold"><span>Propina (${posState.propina}%)</span><span>+${formatCurrency(propinaAmt)}</span></div>` : ''}
                    <div class="flex justify-between font-black text-2xl mt-2 pt-2 border-t border-slate-200 text-slate-900"><span>TOTAL</span><span class="text-orange-600">${formatCurrency(total)}</span></div>
                </div>
            </div>

            <div class="bg-orange-50 p-4 rounded-xl border border-orange-200 mb-6 flex justify-between items-center">
                <div>
                    <p class="text-[10px] font-black text-orange-600 uppercase tracking-widest">Método</p>
                    <p class="font-bold text-orange-800 uppercase text-lg">${posState.metodoPago}</p>
                </div>
                <div class="text-right">
                    ${posState.metodoPago === 'efectivo' ? `
                        <p class="text-xs text-orange-600 font-bold">Recibido: ${formatCurrency(posState.efectivoPagado)}</p>
                        <p class="text-sm font-black text-green-600 bg-green-100 px-2 py-0.5 rounded mt-1">Cambio: ${formatCurrency(posState.efectivoPagado - total)}</p>
                    ` : posState.metodoPago === 'mixto' ? `
                        <p class="text-xs font-bold text-orange-800">EFE: ${formatCurrency(posState.efectivoPagado)} | TAR: ${formatCurrency(posState.tarjetaPagado)}</p>
                    ` : '<i data-lucide="credit-card" class="w-6 h-6 text-orange-500"></i>'}
                </div>
            </div>

            <div class="flex gap-3">
                <button type="button" onclick="closeModal()" class="flex-1 border-2 border-slate-200 py-3.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors">Volver</button>
                <button type="button" onclick="window.posConfirmarCobro()" id="btnConfirmarCobro"
                    class="flex-[2] bg-orange-600 text-white py-3.5 rounded-xl font-black text-lg hover:bg-orange-700 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-transform active:scale-95">
                    <i data-lucide="printer" class="w-5 h-5"></i> Cobrar e Imprimir
                </button>
            </div>
        </div>
    `);
    if (window.lucide) window.lucide.createIcons();
};

window.posConfirmarCobro = async () => {
    const btn = document.getElementById('btnConfirmarCobro');
    if (btn) { btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Procesando...'; }

    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotales();
    const folio = `POS-${Date.now().toString().slice(-6)}`;

    try {
        // Construimos los descuentos reales por ingrediente aplicando merma/rendimiento.
        const productosAfectados = new Map();
        for (const item of posState.orden) {
            for (const ing of (item.receta.ingredientes || [])) {
                const merma = parseFloat(ing.merma) || 0;
                const rendimiento = Math.max(0.01, 1 - (merma / 100));
                const cantidadBrutaRequerida = (ing.cantidad / rendimiento) * item.cantidad;
                const actual = productosAfectados.get(ing.productoId) || 0;
                productosAfectados.set(ing.productoId, actual + cantidadBrutaRequerida);
            }
        }

        const descripcion = posState.orden.map(i => `${i.receta.nombre} x${i.cantidad}`).join(', ');
        const usuario = AppState.user?.nombre || 'Sistema';

        // IMPORTANTE:
        // Aquí usamos RPC atómico por producto para evitar la race condition de "leer stock y luego restar".
        // Aun así, desde frontend NO podemos garantizar una transacción global entre múltiples RPCs
        // y la inserción financiera en "ventas". Si una operación posterior falla, puede requerirse
        // conciliación manual en backoffice.
        for (const [productoId, cantDescuento] of productosAfectados) {
            const cantidadRedondeada = Number(cantDescuento.toFixed(4));
            const { error } = await supabase.rpc('decrementar_stock', {
                p_producto_id: productoId,
                p_delta: cantidadRedondeada,
                p_referencia: `Folio ${folio}: ${descripcion}`,
                p_usuario: usuario,
                p_tipo: 'Salida POS'
            });

            if (error) throw error;
        }

        // La venta financiera es obligatoria. Si falla, abortamos el flujo de éxito.
        const { error: ventaError } = await supabase.from('ventas').insert({
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
            usuario,
            fecha: new Date().toISOString()
        });

        if (ventaError) throw ventaError;

        await cargarDatosDeNube();

        const productosBajos = [];
        for (const [productoId] of productosAfectados) {
            const prod = DB.productos.find(p => String(p.id) === String(productoId));
            if (prod && prod.stock <= prod.min) productosBajos.push(prod);
        }

        await window.posImprimirTicket(folio, total, subtotal, descuentoAmt, propinaAmt);

        window.closeModal();
        showNotification(`✅ Venta cobrada correctamente (${folio})`, 'success');

        // ── Ofrecer factura si el negocio tiene RFC y Facturama configurado ─────
        const _cfgPos = (DB.configuracion || {}).cfdi_config || {};
        if ((DB.configuracion || {}).rfc && _cfgPos.facturama_user) {
            const _ventaPos = {
                folio, total, subtotal,
                metodo_pago: posState.metodoPago,
                items: posState.orden.map(i => ({ nombre: i.receta.nombre, cantidad: i.cantidad, precio: i.precioUnit, subtotal: i.subtotal }))
            };
            setTimeout(() => {
                window.openModal(`
                    <div class="p-8 text-center">
                        <div class="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="file-text" class="w-8 h-8 text-blue-600"></i>
                        </div>
                        <h2 class="text-xl font-black text-slate-800 mb-2">¿El cliente necesita factura?</h2>
                        <p class="text-slate-500 text-sm mb-6">Venta <b>${folio}</b> · <b>${formatCurrency(total)}</b></p>
                        <div class="flex gap-3">
                            <button onclick="closeModal()" class="flex-1 border-2 border-slate-200 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50">No, gracias</button>
                            <button onclick="closeModal(); window.abrirModalFactura(${JSON.stringify(_ventaPos).replace(/"/g,'&quot;')})"
                                class="flex-[2] bg-blue-600 text-white py-3 rounded-xl font-black hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 active:scale-95">
                                <i data-lucide="file-text" class="w-5 h-5"></i> Sí, emitir CFDI
                            </button>
                        </div>
                    </div>`);
                if (window.lucide) window.lucide.createIcons();
            }, 600);
        }

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

        if (productosBajos.length > 0) {
            setTimeout(() => window.posModalOrdenCompraAutomatica(productosBajos), 1500);
        }

    } catch (err) {
        console.error('[POS] Error en venta:', err);
        // Mostrar detalle completo: mensaje + hint de Supabase si existe
        const detalle = err?.details || err?.hint || '';
        const msg = err?.message || String(err);
        showNotification(`Error: ${msg}${detalle ? ' — ' + detalle : ''}`, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer" class="w-5 h-5"></i> Reintentar Cobro'; }
        if (window.lucide) window.lucide.createIcons();
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
                <button type="button" onclick="closeModal()" class="flex-1 border py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors">Omitir por ahora</button>
                <button type="button" onclick="window.posGenerarOrdenCompra(${JSON.stringify(productosBajos.map(p => p.id))})"
                    class="flex-[2] bg-yellow-500 text-white py-3 rounded-xl font-black hover:bg-yellow-600 flex items-center justify-center gap-2 shadow-lg shadow-yellow-200 transition-transform active:scale-95">
                    <i data-lucide="shopping-cart" class="w-5 h-5"></i> Generar Orden
                </button>
            </div>
        </div>
    `);
    if(window.lucide) window.lucide.createIcons();
};

window.posGenerarOrdenCompra = async (productoIds) => {
    const proveedorNombre = document.getElementById('posProveedorOC')?.value;

    if (!proveedorNombre) {
        return showNotification('⚠️ Selecciona un proveedor de la lista para continuar.', 'error');
    }

    const items = productoIds.map(id => {
        const prod = DB.productos.find(p => String(p.id) === String(id));
        const cantSugerida = Math.max(prod.min * 2 - prod.stock, prod.min);
        return {
            productoId: prod.id, nombre: prod.nombre, cant: cantSugerida,
            cantidad: cantSugerida, precio: prod.precio, unidad: prod.unidad
        };
    });

    const total = items.reduce((s, i) => s + i.cant * i.precio, 0);
    const numeroOC = `OC-${Date.now().toString().slice(-6)}`;

    try {
        const { data, error } = await supabase.from('ordenes_compra').insert({
            numero: numeroOC, proveedor: proveedorNombre, estado: 'pendiente',
            items, total, fecha: new Date().toISOString(),
            referencia: 'Generada automáticamente por POS',
            usuario: AppState.user?.nombre || 'Sistema'
        }).select();
        
        if (error) throw error;
        const idOrdenCreada = data[0].id;
        await cargarDatosDeNube();

        window.openModal(`
            <div class="p-8 text-center">
                <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6 shadow-inner">
                    <i data-lucide="check" class="h-8 w-8 text-green-600"></i>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mb-2">¡Orden de Compra Lista!</h2>
                <p class="text-gray-500 mb-8 text-sm px-4">El stock bajo fue reportado y la orden <b>${numeroOC}</b> fue creada. ¿Deseas enviarla a <b>${proveedorNombre}</b> en este momento?</p>
                <div class="grid grid-cols-1 gap-3">
                    <button type="button" onclick="window.enviarPorWhatsApp(${idOrdenCreada})" class="w-full bg-[#25D366] text-white py-3.5 rounded-xl font-bold hover:bg-[#128C7E] flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition-transform hover:-translate-y-1">
                        Enviar por WhatsApp
                    </button>
                    <button type="button" onclick="window.enviarPorCorreo(${idOrdenCreada})" class="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-transform hover:-translate-y-1">
                        <i data-lucide="mail" class="w-5 h-5"></i> Enviar por Correo Electrónico
                    </button>
                    <button type="button" onclick="window.closeModal()" class="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 mt-2 transition-colors">
                        Omitir envío
                    </button>
                </div>
            </div>
        `);
        if(window.lucide) window.lucide.createIcons();
    } catch (err) {
        showNotification('Error de conexión al generar OC: ' + err.message, 'error');
    }
};

// ─── GENERADOR DE TICKET (ESC/POS RAW O HTML PDF) ────────────────────────────
window.posImprimirTicket = async (folio, total, subtotal, descuentoAmt, propinaAmt) => {
    const conf   = DB.configuracion || {};
    const iva    = parseFloat(conf.iva) || 0;
    const ivaAmt = iva > 0 ? subtotal * iva : 0;
    const cambio = posState.metodoPago === 'efectivo' ? Math.max(0, (posState.efectivoPagado || 0) - total) : 0;

    const ticketData = {
        header: {
            nombre:    conf.nombre_empresa || conf.nombreEmpresa || 'Restaurante',
            rfc:       conf.rfc || '',
            direccion: conf.direccion || '',
            telefono:  conf.telefono || '',
            folio,
            fecha:     new Date().toLocaleString('es-MX', { hour12: false }),
            cajero:    AppState.user?.nombre || 'Sistema',
        },
        lines: posState.orden.map(i => ({
            cantidad: i.cantidad,
            nombre:   i.receta.nombre,
            precio:   formatCurrency(i.subtotal),
            nota:     i.nota || '',
        })),
        footer: {
            subtotal:  formatCurrency(subtotal),
            descuento: descuentoAmt > 0 ? formatCurrency(descuentoAmt) : null,
            iva:       ivaAmt > 0 ? formatCurrency(ivaAmt) : null,
            total:     formatCurrency(total),
            metodo:    posState.metodoPago,
            recibido:  posState.efectivoPagado > 0 ? formatCurrency(posState.efectivoPagado) : null,
            cambio:    cambio > 0 ? formatCurrency(cambio) : null,
            mensaje:   conf.mensaje_ticket || '¡Gracias por su preferencia!',
        },
    };

    // Impresora térmica ESC/POS (WebSerial)
    if (window.ThermalPrinter?.isConnected) {
        try {
            window.ThermalPrinter.enqueue(window.ThermalPrinter.buildTicket(ticketData));
            return;
        } catch (err) { console.warn('[POS] Fallback a print():', err); }
    }

    // Fallback: ventana de impresión del navegador
    const { header, lines, footer } = ticketData;
    const pw = window.open('', '_blank', 'width=340,height=600');
    if (!pw) return;
    const row = (l, r) => `<div style="display:flex;justify-content:space-between"><span>${l}</span><span>${r}</span></div>`;
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Courier New',monospace;font-size:12px;width:72mm;padding:4mm}
        .center{text-align:center}.big{font-size:16px;font-weight:bold}
        .hr{border-top:1px dashed #000;margin:4px 0}.item{display:flex;justify-content:space-between}
    </style></head><body>
    <div class="center big">${header.nombre}</div>
    ${header.rfc ? `<div class="center">RFC: ${header.rfc}</div>` : ''}
    ${header.direccion ? `<div class="center">${header.direccion}</div>` : ''}
    ${header.telefono  ? `<div class="center">Tel: ${header.telefono}</div>` : ''}
    <div class="hr"></div>
    <div>Folio: <b>${header.folio}</b></div>
    <div>Fecha: ${header.fecha}</div>
    <div>Cajero: ${header.cajero}</div>
    <div class="hr"></div>
    ${lines.map(l => `<div class="item"><span>${l.cantidad}x ${l.nombre.substring(0,22)}</span><span>${l.precio}</span></div>${l.nota ? `<div style="padding-left:12px;color:#555">* ${l.nota}</div>` : ''}`).join('')}
    <div class="hr"></div>
    ${footer.descuento ? row('Descuento:', '-'+footer.descuento) : ''}
    ${footer.iva       ? row('IVA:', footer.iva) : ''}
    ${row('TOTAL:', '<b>'+footer.total+'</b>')}
    ${footer.recibido  ? row('Recibido:', footer.recibido) : ''}
    ${footer.cambio    ? row('Cambio:', '<b>'+footer.cambio+'</b>') : ''}
    <div class="hr"></div>
    <div class="center" style="margin-top:6px">${footer.mensaje}</div>
    <br><br></body></html>`);
    pw.document.close();
    setTimeout(() => { pw.print(); pw.close(); }, 400);
};

