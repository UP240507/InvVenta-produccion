// src/components/Mesas.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { formatCurrency, showNotification, SPINNER_ICON, registrarMovimientoEnNube } from '../utils/helpers.js';

// ─── Estado local del módulo de mesas ────────────────────────────────────────
let mesaState = {
    mesaActiva: null,
    orden: [],
    itemsEnviados: [],
    descuento: 0,
    propina: 0,
    metodoPago: 'efectivo',
    efectivoPagado: 0,
    tarjetaPagado: 0,
    busqueda: '',
    categoriaFiltro: '',
    vista: 'mapa'
};

window.mesaState = mesaState;

// ─── CONVERSOR DE NÚMEROS A LETRAS (Para el Ticket) ───────────────────────────
function numeroALetras(num) {
    const unidades = ['','UN ','DOS ','TRES ','CUATRO ','CINCO ','SEIS ','SIETE ','OCHO ','NUEVE '];
    const decenas = ['DIECI','ONCE ','DOCE ','TRECE ','CATORCE ','QUINCE ','DIECISEIS ','DIECISIETE ','DIECIOCHO ','DIECINUEVE '];
    const decenas2 = ['','','VEINTE ','TREINTA ','CUARENTA ','CINCUENTA ','SESENTA ','SETENTA ','OCHENTA ','NOVENTA '];
    const centenas = ['','CIENTO ','DOSCIENTOS ','TRESCIENTOS ','CUATROCIENTOS ','QUINIENTOS ','SEISCIENTOS ','SETECIENTOS ','OCHOCIENTOS ','NOVECIENTOS '];
    
    let enteros = Math.floor(num);
    let centavos = Math.round((num - enteros) * 100);
    if (enteros === 0) return `CERO PESOS ${centavos.toString().padStart(2, '0')}/100 M.N.`;

    function convertirGrupo(n) {
        let output = '';
        let c = Math.floor(n / 100); n = n % 100;
        let d = Math.floor(n / 10);
        let u = n % 10;
        
        if (c === 1 && d === 0 && u === 0) output += 'CIEN '; else output += centenas[c];
        
        if (d === 1 && u > 0) output += decenas[u];
        else if (d === 1 && u === 0) output += 'DIEZ ';
        else if (d === 2 && u === 0) output += 'VEINTE ';
        else if (d === 2 && u > 0) output += 'VEINTI' + unidades[u];
        else {
            output += decenas2[d];
            if (d > 2 && u > 0) output += 'Y ';
            output += unidades[u];
        }
        return output;
    }

    let letras = '';
    let miles = Math.floor(enteros / 1000);
    let resto = enteros % 1000;

    if (miles > 0) {
        if (miles === 1) letras += 'MIL ';
        else letras += convertirGrupo(miles) + 'MIL ';
    }
    if (resto > 0) letras += convertirGrupo(resto);
    
    return `SON: ${letras.trim()} PESOS ${centavos.toString().padStart(2, '0')}/100 M.N.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcTotalesMesa() {
    const subtotal = mesaState.orden.reduce((s, i) => s + i.subtotal, 0);
    const descuentoAmt = subtotal * (mesaState.descuento / 100);
    const propinaAmt = (subtotal - descuentoAmt) * (mesaState.propina / 100);
    const total = subtotal - descuentoAmt + propinaAmt;
    return { subtotal, descuentoAmt, propinaAmt, total };
}

function getMinutosAbierta(fechaStr) {
    if (!fechaStr) return 0;
    return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 60000);
}

function formatTiempo(mins) {
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function verificarStockMesa(receta, cantidad) {
    for (const ing of (receta.ingredientes || [])) {
        const prod = DB.productos.find(p => String(p.id) === String(ing.productoId));
        if (!prod || prod.stock < ing.cantidad * cantidad) {
            return { ok: false, nombre: prod?.nombre || 'Ingrediente desconocido' };
        }
    }
    return { ok: true };
}

function getZonas() {
    const mesas = DB.mesas || [];
    return [...new Set(mesas.map(m => m.zona || 'General'))];
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
export function renderMesas() {
    if (mesaState.vista === 'pos' && mesaState.mesaActiva) {
        return renderPosMesa();
    }
    return renderMapaMesas();
}

// ─── MAPA DE MESAS ────────────────────────────────────────────────────────────
function renderMapaMesas() {
    const mesas = DB.mesas || [];
    const zonas = getZonas();

    if (mesas.length === 0) {
        return `
            <div class="flex flex-col items-center justify-center h-full py-24 animate-fade-in">
                <div class="bg-slate-100 w-24 h-24 rounded-full flex items-center justify-center mb-6">
                    <i data-lucide="layout-grid" class="w-12 h-12 text-slate-400"></i>
                </div>
                <h3 class="text-xl font-bold text-slate-700 mb-2">No hay mesas configuradas</h3>
                <p class="text-slate-400 text-sm mb-6 text-center max-w-sm">Ve a Configuración → Mesas y Zonas para agregar las mesas de tu restaurante.</p>
                <button onclick="AppState.currentScreen='configuracion'; window.render()"
                    class="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-700 flex items-center gap-2">
                    <i data-lucide="settings" class="w-4 h-4"></i> Ir a Configuración
                </button>
            </div>`;
    }

    const ocupadas = mesas.filter(m => m.estado === 'ocupada').length;
    const libres = mesas.filter(m => m.estado === 'libre').length;
    const porCobrar = mesas.filter(m => m.estado === 'por_cobrar').length;

    return `
        <div class="space-y-6 animate-fade-in pb-20 mt-4 max-w-6xl mx-auto h-full">
            <div class="grid grid-cols-3 gap-4">
                <div class="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3">
                    <div class="bg-green-100 p-2.5 rounded-xl"><i data-lucide="circle-check" class="w-5 h-5 text-green-600"></i></div>
                    <div>
                        <p class="text-2xl font-black text-slate-800">${libres}</p>
                        <p class="text-xs text-slate-400 font-bold uppercase">Libres</p>
                    </div>
                </div>
                <div class="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3">
                    <div class="bg-red-100 p-2.5 rounded-xl"><i data-lucide="users" class="w-5 h-5 text-red-500"></i></div>
                    <div>
                        <p class="text-2xl font-black text-slate-800">${ocupadas}</p>
                        <p class="text-xs text-slate-400 font-bold uppercase">Ocupadas</p>
                    </div>
                </div>
                <div class="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3">
                    <div class="bg-amber-100 p-2.5 rounded-xl"><i data-lucide="receipt" class="w-5 h-5 text-amber-600"></i></div>
                    <div>
                        <p class="text-2xl font-black text-slate-800">${porCobrar}</p>
                        <p class="text-xs text-slate-400 font-bold uppercase">Por cobrar</p>
                    </div>
                </div>
            </div>

            ${zonas.map(zona => {
                const mesasZona = mesas.filter(m => (m.zona || 'General') === zona);
                return `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                    <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                        <i data-lucide="map-pin" class="w-4 h-4 text-slate-400"></i> ${zona}
                        <span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md text-[10px] ml-1">${mesasZona.length} mesas</span>
                    </h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        ${mesasZona.map(mesa => renderTarjetaMesa(mesa)).join('')}
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

function renderTarjetaMesa(mesa) {
    const libre = mesa.estado === 'libre';
    const porCobrar = mesa.estado === 'por_cobrar';
    const ocupada = mesa.estado === 'ocupada';
    const mins = getMinutosAbierta(mesa.abierta_en);
    const orden = mesa.orden_actual || { items: [], total: 0 };

    const colorBorder = libre ? 'border-slate-200 hover:border-green-400' : porCobrar ? 'border-amber-400 bg-amber-50' : 'border-orange-300 bg-orange-50';
    const colorDot = libre ? 'bg-green-400' : porCobrar ? 'bg-amber-400 animate-pulse' : 'bg-red-500 animate-pulse';
    const colorLabel = libre ? 'text-green-600 bg-green-50' : porCobrar ? 'text-amber-700 bg-amber-100' : 'text-red-600 bg-red-100';
    const labelText = libre ? 'Libre' : porCobrar ? 'Por cobrar' : 'Ocupada';

    return `
        <div onclick="window.mesaClick('${mesa.id}')"
            class="bg-white rounded-2xl border-2 ${colorBorder} p-4 cursor-pointer hover:shadow-md transition-all select-none relative group flex flex-col h-full">
            <div class="absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${colorDot}"></div>
            <p class="font-black text-slate-800 text-lg leading-tight">${mesa.nombre}</p>
            <p class="text-[10px] text-slate-400 mb-3 flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i> ${mesa.capacidad} pax</p>
            <div class="mt-auto">
                <span class="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${colorLabel}">${labelText}</span>
                ${!libre ? `
                    <div class="mt-3 pt-3 border-t border-slate-200/50 space-y-1">
                        <div class="flex justify-between text-xs items-center">
                            <span class="text-slate-400 text-[10px]">⏱ ${formatTiempo(mins)}</span>
                            <span class="font-black text-slate-800">${formatCurrency(orden.total || 0)}</span>
                        </div>
                        ${orden.items && orden.items.length > 0 ? `
                            <p class="text-[9px] text-slate-400 truncate mt-1">
                                ${orden.items.slice(0,2).map(i => i.nombre).join(', ')}${orden.items.length > 2 ? ` +${orden.items.length - 2}` : ''}
                            </p>
                        ` : ''}
                    </div>
                ` : `<p class="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-300 italic text-center">Toca para abrir</p>`}
            </div>
        </div>`;
}

// ─── Click en mesa ────────────────────────────────────────────────────────────
window.mesaClick = async (mesaId) => {
    const mesa = (DB.mesas || []).find(m => String(m.id) === String(mesaId));
    if (!mesa) return;

    if (mesa.estado === 'libre') {
        await window.mesaAbrir(mesaId);
    } else {
        window.mesaMostrarOpciones(mesa);
    }
};

window.mesaAbrir = async (mesaId) => {
    const mesa = (DB.mesas || []).find(m => String(m.id) === String(mesaId));
    if (!mesa) return;

    try {
        const { error } = await supabase.from('mesas').update({
            estado: 'ocupada',
            abierta_en: new Date().toISOString(),
            usuario: AppState.user?.nombre || 'Sistema',
            orden_actual: { items: [], total: 0 },
            total_acumulado: 0
        }).eq('id', mesaId);
        
        if (error) throw error;

        await cargarDatosDeNube();
        const mesaActualizada = (DB.mesas || []).find(m => String(m.id) === String(mesaId));

        mesaState.mesaActiva = mesaActualizada;
        mesaState.orden = [];
        mesaState.itemsEnviados = [];
        mesaState.descuento = 0;
        mesaState.propina = 0;
        mesaState.efectivoPagado = 0;
        mesaState.tarjetaPagado = 0;
        mesaState.busqueda = '';
        mesaState.categoriaFiltro = '';
        mesaState.vista = 'pos';

        window.render();
        showNotification(`Mesa ${mesa.nombre} abierta`, 'success');
    } catch (err) {
        showNotification('Error al abrir mesa: ' + err.message, 'error');
    }
};

window.mesaMostrarOpciones = (mesa) => {
    const orden = mesa.orden_actual || { items: [], total: 0 };
    const mins = getMinutosAbierta(mesa.abierta_en);
    const porCobrar = mesa.estado === 'por_cobrar';

    window.openModal(`
        <div class="p-6">
            <div class="flex items-center gap-3 mb-5">
                <div class="bg-slate-800 p-3 rounded-xl"><i data-lucide="layout-grid" class="w-6 h-6 text-white"></i></div>
                <div>
                    <h2 class="text-xl font-black text-slate-800">${mesa.nombre}</h2>
                    <p class="text-sm text-slate-400">${mesa.zona} · ${formatTiempo(mins)} abierta · ${formatCurrency(orden.total || 0)}</p>
                </div>
            </div>

            ${orden.items && orden.items.length > 0 ? `
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5 max-h-40 overflow-y-auto custom-scrollbar">
                    ${orden.items.map(i => `
                        <div class="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                            <span class="text-slate-600">${i.cantidad}x ${i.nombre}${i.nota ? ` <span class="text-orange-400 italic text-xs">↳ ${i.nota}</span>` : ''}</span>
                            <span class="font-bold text-slate-800">${formatCurrency(i.subtotal)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <div class="grid grid-cols-1 gap-2">
                <button type="button" onclick="window.mesaIrAlPos('${mesa.id}'); closeModal()"
                    class="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 flex items-center justify-center gap-2 transition-transform active:scale-95">
                    <i data-lucide="plus-circle" class="w-5 h-5"></i> Agregar platillos
                </button>
                
                ${!porCobrar ? `
                <button type="button" onclick="window.mesaMarcarPorCobrar('${mesa.id}'); closeModal()"
                    class="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 flex items-center justify-center gap-2 transition-transform active:scale-95">
                    <i data-lucide="receipt" class="w-5 h-5"></i> Solicitar cuenta impresa
                </button>
                ` : ''}
                
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <button type="button" onclick="window.mesaIrACobrar('${mesa.id}'); closeModal()"
                        class="bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 transition-transform active:scale-95">
                        <i data-lucide="banknote" class="w-5 h-5"></i> Cobrar Todo
                    </button>
                    <button type="button" onclick="window.mesaDividirCuenta('${mesa.id}'); closeModal()"
                        class="bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition-transform active:scale-95">
                        <i data-lucide="split" class="w-5 h-5"></i> Dividir
                    </button>
                </div>
                
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <button type="button" onclick="window.mesaTransferir('${mesa.id}')"
                        class="bg-blue-50 text-blue-600 border border-blue-200 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-100 flex items-center justify-center gap-1 transition-colors">
                        <i data-lucide="arrow-right-left" class="w-4 h-4"></i> Transferir Mesa
                    </button>
                    <button type="button" onclick="window.mesaCerrarVacia('${mesa.id}')"
                        class="bg-red-50 text-red-500 border border-red-200 py-2.5 rounded-xl font-bold text-sm hover:bg-red-100 flex items-center justify-center gap-1 transition-colors">
                        <i data-lucide="x-circle" class="w-4 h-4"></i> Cancelar / Cerrar
                    </button>
                </div>
            </div>
        </div>
    `);
    
    if(window.lucide) window.lucide.createIcons();
};

window.mesaIrAlPos = async (mesaId) => {
    await cargarDatosDeNube();
    const mesa = (DB.mesas || []).find(m => String(m.id) === String(mesaId));
    if (!mesa) return;

    const ordenGuardada = mesa.orden_actual || { items: [] };

    mesaState.mesaActiva = mesa;
    mesaState.orden = (ordenGuardada.items || []).map(i => ({
        receta: DB.recetas.find(r => String(r.id) === String(i.recetaId)) || { id: i.recetaId, nombre: i.nombre, ingredientes: [] },
        cantidad: i.cantidad,
        precioUnit: i.precio,
        subtotal: i.subtotal,
        nota: i.nota || ''
    })).filter(i => i.receta);

    mesaState.itemsEnviados = (ordenGuardada.items_enviados || []);
    mesaState.descuento = 0;
    mesaState.propina = 0;
    mesaState.metodoPago = 'efectivo';
    mesaState.efectivoPagado = 0;
    mesaState.tarjetaPagado = 0;
    mesaState.busqueda = '';
    mesaState.categoriaFiltro = '';
    mesaState.vista = 'pos';

    window.render();
};

window.mesaMarcarPorCobrar = async (mesaId) => {
    try {
        const { error } = await supabase.from('mesas').update({ estado: 'por_cobrar' }).eq('id', mesaId);
        if (error) throw error;
        await cargarDatosDeNube();
        window.render();
        showNotification('Mesa marcada como "Por cobrar"', 'info');
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
};

window.mesaIrACobrar = async (mesaId) => {
    await window.mesaIrAlPos(mesaId);
    setTimeout(() => window.mesaCobrar(), 100);
};

window.mesaCerrarVacia = async (mesaId) => {
    if (!confirm('¿Estás seguro de cancelar y limpiar esta mesa por completo?')) return;
    window.closeModal();
    try {
        const { error } = await supabase.from('mesas').update({
            estado: 'libre',
            orden_actual: null,
            abierta_en: null,
            usuario: null,
            total_acumulado: 0
        }).eq('id', mesaId);
        if (error) throw error;
        await cargarDatosDeNube();
        window.render();
        showNotification('Mesa liberada correctamente', 'info');
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
    }
};

window.mesaTransferir = (mesaOrigenId) => {
    const mesasLibres = (DB.mesas || []).filter(m => m.estado === 'libre' && String(m.id) !== String(mesaOrigenId));
    if (mesasLibres.length === 0) {
        return showNotification('No hay mesas libres disponibles en este momento', 'error');
    }

    // Cerrar el modal de opciones antes de abrir el selector de destino
    window.closeModal();

    setTimeout(() => {
        window.openModal(`
        <div class="p-6">
            <h2 class="text-xl font-black text-slate-800 mb-2 flex items-center gap-2">
                <i data-lucide="arrow-right-left" class="w-5 h-5 text-blue-500"></i> Transferir Mesa
            </h2>
            <p class="text-slate-400 text-sm mb-5">Selecciona la mesa destino (debe estar libre)</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                ${mesasLibres.map(m => `
                    <button onclick="window.mesaConfirmarTransferir('${mesaOrigenId}', '${m.id}')"
                        class="bg-white border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl p-4 text-center transition-all shadow-sm">
                        <p class="font-black text-slate-800 text-lg">${m.nombre}</p>
                        <p class="text-[10px] text-slate-400 uppercase tracking-widest mt-1">${m.zona}</p>
                    </button>
                `).join('')}
            </div>
            <button onclick="closeModal()" class="mt-5 w-full border border-slate-200 py-3 rounded-xl text-slate-500 font-bold hover:bg-slate-50 text-sm transition-colors">Cancelar</button>
        </div>
    `);
        if(window.lucide) window.lucide.createIcons();
    }, 150);
};

window.mesaConfirmarTransferir = async (origenId, destinoId) => {
    window.closeModal();
    const origen = (DB.mesas || []).find(m => String(m.id) === String(origenId));
    if (!origen) { return showNotification('Mesa origen no encontrada', 'error'); }

    const destino = (DB.mesas || []).find(m => String(m.id) === String(destinoId));
    if (!destino) { return showNotification('Mesa destino no encontrada', 'error'); }

    try {
        const { error: e1 } = await supabase.from('mesas').update({
            estado: origen.estado || 'ocupada',
            orden_actual: origen.orden_actual || null,
            abierta_en: origen.abierta_en || null,
            usuario: origen.usuario || null,
            total_acumulado: origen.total_acumulado || 0
        }).eq('id', String(destinoId));
        if (e1) throw e1;

        const { error: e2 } = await supabase.from('mesas').update({
            estado: 'libre',
            orden_actual: null,
            abierta_en: null,
            usuario: null,
            total_acumulado: 0
        }).eq('id', String(origenId));
        if (e2) throw e2;

        if (mesaState.mesaActiva && String(mesaState.mesaActiva.id) === String(origenId)) {
            mesaState.vista = 'mapa';
            mesaState.mesaActiva = null;
            mesaState.orden = [];
        }

        await cargarDatosDeNube();
        window.render();
        showNotification(`✅ Orden transferida de ${origen.nombre} a ${destino.nombre}`, 'success');
    } catch (err) {
        showNotification('Error al transferir: ' + err.message, 'error');
    }
};

// ─── POS DE MESA (VISTA INTERIOR FIX RESPONSIVO) ───────────────────────────────
function renderPosMesa() {
    const mesa = mesaState.mesaActiva;
    const categorias = [...new Set(DB.recetas.map(r => r.categoria || 'Sin categoría'))];
    const mins = getMinutosAbierta(mesa.abierta_en);

    setTimeout(() => {
        window.mesaActualizarOrden();
        window.mesaActualizarGrid();
    }, 100);

    return `
    <div class="flex flex-col lg:flex-row gap-4 animate-fade-in h-[calc(100vh-100px)] min-h-[500px]">

        <div class="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 flex items-center justify-between flex-none">
                <div class="flex items-center gap-4">
                    <button type="button" onclick="window.mesaVolverAlMapa()" class="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 shadow-sm">
                        <i data-lucide="arrow-left" class="w-5 h-5 text-slate-600"></i>
                    </button>
                    <div>
                        <p class="font-black text-slate-800 text-xl leading-tight">${mesa.nombre}</p>
                        <p class="text-xs text-slate-500 font-bold">${mesa.zona} · <span class="text-orange-500">⏱ ${formatTiempo(mins)} abierta</span></p>
                    </div>
                </div>
                <span class="bg-red-100 text-red-600 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest hidden sm:inline-block">Ocupada</span>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex gap-3 items-center flex-wrap flex-none">
                <div class="relative flex-1 min-w-[200px]">
                    <input id="mesaBusqueda"
                        oninput="mesaState.busqueda=this.value; window.mesaActualizarGrid()"
                        class="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-orange-400 outline-none text-sm font-medium transition-colors"
                        placeholder="Buscar platillo o código...">
                    <i data-lucide="search" class="absolute left-3 top-3 w-4 h-4 text-slate-400"></i>
                </div>
                <div class="flex gap-2 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
                    <button type="button" onclick="mesaState.categoriaFiltro=''; window.mesaActualizarGrid()"
                        id="mesaCatBtn-todos"
                        class="px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20">
                        Todos
                    </button>
                    ${categorias.map(c => `
                        <button type="button" onclick="mesaState.categoriaFiltro='${c}'; window.mesaActualizarGrid()"
                            id="mesaCatBtn-${c.replace(/\s+/g,'_')}"
                            class="px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border border-slate-200 transition-all bg-white text-slate-600 hover:bg-slate-50 shadow-sm">
                            ${c}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div id="mesaGridRecetas" class="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-4"></div>
            </div>
        </div>

        <div class="w-full lg:w-[380px] xl:w-[420px] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style="height: min(65vh, calc(100vh - 140px)); min-height: 400px; max-height: calc(100vh - 120px);">

            <div class="bg-slate-900 px-5 py-4 flex items-center justify-between flex-none">
                <div>
                    <h3 class="text-white font-black text-lg leading-tight">La Comanda</h3>
                    <p class="text-slate-400 text-[10px] uppercase tracking-widest mt-0.5">Mesa: ${mesa.nombre}</p>
                </div>
                <button type="button" onclick="window.mesaCancelarOrden()" class="text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded-lg transition-all" title="Limpiar orden">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </div>

            <div id="mesaOrdenItems" class="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50/50 custom-scrollbar">
                </div>

            <div class="flex-none border-t border-slate-200 bg-white">
                
                <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 border-b border-slate-100">
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-orange-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex-1">Desc %</span>
                        <input type="number" id="mesaDescuento" min="0" max="100" value="${mesaState.descuento}"
                            oninput="mesaState.descuento=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.mesaActualizarOrden()"
                            class="w-12 text-right font-black text-slate-800 bg-transparent outline-none">
                    </div>
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-green-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex-1">Prop %</span>
                        <input type="number" id="mesaPropina" min="0" max="100" value="${mesaState.propina}"
                            oninput="mesaState.propina=Math.min(100,Math.max(0,parseFloat(this.value)||0)); window.mesaActualizarOrden()"
                            class="w-12 text-right font-black text-slate-800 bg-transparent outline-none">
                    </div>
                </div>

                <div class="px-4 py-3 space-y-1 text-sm bg-white border-b border-slate-100">
                    <div class="flex justify-between text-slate-500 font-medium"><span>Subtotal Neto</span><span id="mesaSubtotal">$0.00</span></div>
                    <div id="mesaDescuentoRow" class="flex justify-between text-red-500 text-xs font-bold hidden"><span>Descuento Aplicado</span><span id="mesaDescuentoTotal">−$0.00</span></div>
                    <div id="mesaPropinaRow" class="flex justify-between text-green-600 text-xs font-bold hidden"><span>Propina Sugerida</span><span id="mesaPropinaTotal">+$0.00</span></div>
                    <div class="flex justify-between font-black text-xl text-slate-900 pt-2 mt-2 border-t border-slate-100">
                        <span>TOTAL</span><span id="mesaTotal" class="text-orange-600">$0.00</span>
                    </div>
                </div>

                <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <button type="button" onclick="mesaState.metodoPago='efectivo'; window.mesaActualizarOrden()" id="mesaBtnEfectivo" class="py-2.5 rounded-xl text-xs font-black border transition-all">EFECTIVO</button>
                        <button type="button" onclick="mesaState.metodoPago='tarjeta'; window.mesaActualizarOrden()" id="mesaBtnTarjeta" class="py-2.5 rounded-xl text-xs font-black border transition-all">TARJETA</button>
                        <button type="button" onclick="mesaState.metodoPago='mixto'; window.mesaActualizarOrden()" id="mesaBtnMixto" class="py-2.5 rounded-xl text-xs font-black border transition-all">MIXTO</button>
                    </div>
                    <div id="mesaPagoDinamico"></div>
                </div>

                <div class="p-3 bg-white space-y-2">
                    <button type="button" onclick="window.mesaEnviarComanda()" id="btnComanda" class="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-xl font-bold text-sm shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2">
                        <i data-lucide="printer" class="w-4 h-4"></i> Imprimir Comanda a Cocina
                    </button>
                    <div class="grid grid-cols-3 gap-2">
                        <button type="button" id="btnGuardarMesa" onclick="window.mesaGuardarYVolver()" class="bg-white border-2 border-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-xs hover:border-slate-400 transition-colors flex flex-col items-center justify-center gap-0.5">
                            <i data-lucide="save" class="w-4 h-4"></i> Guardar
                        </button>
                        <button type="button" onclick="window.mesaDividirCuenta('${mesa.id}')" class="bg-purple-50 border-2 border-purple-200 text-purple-700 py-2.5 rounded-xl font-bold text-xs hover:border-purple-400 transition-colors flex flex-col items-center justify-center gap-0.5">
                            <i data-lucide="split" class="w-4 h-4"></i> Dividir
                        </button>
                        <button type="button" onclick="window.mesaCobrar()" class="bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-black text-xs shadow-md shadow-orange-500/30 transition-transform active:scale-95 flex flex-col items-center justify-center gap-0.5">
                            <i data-lucide="banknote" class="w-4 h-4"></i> Cobrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ─── Actualizar grid de recetas ───────────────────────────────────────────────
window.mesaActualizarGrid = () => {
    const container = document.querySelector('#mesaGridRecetas > div');
    if (!container) {
        setTimeout(window.mesaActualizarGrid, 100);
        return;
    }

    const recetasFiltradas = DB.recetas.filter(r => {
        const matchBusq = r.nombre.toLowerCase().includes(mesaState.busqueda.toLowerCase()) ||
                          (r.codigo_pos || '').toLowerCase().includes(mesaState.busqueda.toLowerCase());
        const matchCat = !mesaState.categoriaFiltro || (r.categoria || 'Sin categoría') === mesaState.categoriaFiltro;
        return matchBusq && matchCat;
    });

    document.querySelectorAll('[id^="mesaCatBtn-"]').forEach(btn => {
        btn.className = "px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border border-slate-200 transition-all bg-white text-slate-600 hover:bg-slate-50 shadow-sm";
    });
    const activeBtn = document.getElementById(mesaState.categoriaFiltro ? `mesaCatBtn-${mesaState.categoriaFiltro.replace(/\s+/g,'_')}` : 'mesaCatBtn-todos');
    if (activeBtn) activeBtn.className = "px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap border transition-all bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20";

    if (recetasFiltradas.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                <div class="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"><i data-lucide="search-x" class="w-8 h-8 text-slate-300"></i></div>
                <p class="font-bold text-slate-500">No se encontraron platillos</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = recetasFiltradas.map(r => {
        const itemOrden = mesaState.orden.find(x => String(x.receta.id) === String(r.id));
        const cantActual = itemOrden ? itemOrden.cantidad : 0;
        const check = verificarStockMesa(r, cantActual + 1);
        const sinStock = !check.ok;

        return `
            <button type="button" onclick="window.mesaAgregarReceta('${r.id}')" ${sinStock ? 'disabled' : ''}
                class="relative bg-white border-2 rounded-2xl p-4 text-left transition-all flex flex-col h-full
                ${sinStock ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50' : 'hover:shadow-lg hover:-translate-y-1 hover:border-orange-400 cursor-pointer'}
                ${cantActual > 0 ? 'border-orange-400 bg-orange-50/50 shadow-sm' : 'border-slate-200'}">
                
                ${cantActual > 0 ? `
                    <span class="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-bounce-short">
                        ${cantActual}
                    </span>
                ` : ''}
                
                <div class="mb-2 text-3xl">${getCategoriaEmoji(r.categoria)}</div>
                <p class="font-black text-slate-800 text-sm leading-tight mb-1 flex-1 pr-2">${r.nombre}</p>
                <div class="mt-auto pt-2 border-t border-slate-100">
                    <p class="text-[10px] text-slate-400 font-mono mb-0.5">${r.codigo_pos || 'Sin código'}</p>
                    <p class="font-black text-orange-600 text-base">${formatCurrency(r.precio_venta || 0)}</p>
                </div>
                ${sinStock ? `
                    <p class="text-[10px] text-red-500 mt-2 font-bold uppercase tracking-widest bg-red-50 px-2 py-1 rounded-md text-center">
                        Sin stock
                    </p>
                ` : ''}
            </button>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
};

window.mesaCancelarOrden = () => {
    if (mesaState.orden.length === 0) return;
    if (confirm('¿Estás seguro de quitar todos los platillos de la orden actual?')) { 
        mesaState.orden = []; 
        window.mesaActualizarOrden(); 
        window.mesaActualizarGrid(); 
    }
};

window.mesaAgregarReceta = (id) => {
    const receta = DB.recetas.find(r => String(r.id) === String(id));
    if (!receta) return;

    const existente = mesaState.orden.find(x => String(x.receta.id) === String(id));
    const cantNueva = existente ? existente.cantidad + 1 : 1;

    const check = verificarStockMesa(receta, cantNueva);
    if (!check.ok) return showNotification(`⚠️ Stock insuficiente de ingrediente: ${check.nombre}`, 'error');

    if (existente) {
        existente.cantidad++;
        existente.subtotal = existente.cantidad * existente.precioUnit;
    } else {
        mesaState.orden.push({
            receta: receta,
            cantidad: 1,
            precioUnit: receta.precio_venta || 0,
            subtotal: receta.precio_venta || 0,
            nota: ''
        });
    }

    window.mesaActualizarOrden();
    window.mesaActualizarGrid();
};

window.mesaAgregarNota = (idx) => {
    const notaActual = mesaState.orden[idx].nota || '';
    const nuevaNota = prompt(`Nota especial para cocina: ${mesaState.orden[idx].receta.nombre}\n(Ej: Sin cebolla, bien cocido, para llevar)`, notaActual);
    if (nuevaNota !== null) {
        mesaState.orden[idx].nota = nuevaNota.trim();
        window.mesaActualizarOrden();
    }
};

window.mesaActualizarOrden = () => {
    const { subtotal, descuentoAmt, propinaAmt, total } = calcTotalesMesa();

    const itemsDiv = document.getElementById('mesaOrdenItems');
    if (itemsDiv) {
        itemsDiv.innerHTML = mesaState.orden.length === 0
            ? `
               <div class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 py-6">
                   <i data-lucide="shopping-bag" class="w-10 h-10 mb-2"></i>
                   <p class="font-bold uppercase tracking-widest text-xs">Orden Vacía</p>
                   <p class="text-[10px] mt-1">Toca un platillo para agregarlo</p>
               </div>
              `
            : mesaState.orden.map((item, idx) => `
                <div class="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm relative flex flex-col gap-1.5">
                    
                    <div class="flex justify-between items-start">
                        <div class="flex-1 pr-2 min-w-0">
                            <p class="text-sm font-black text-slate-800 leading-tight truncate">${item.receta.nombre}</p>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">${formatCurrency(item.precioUnit)} c/u</p>
                        </div>
                        <div class="flex flex-col items-end gap-1">
                            <span class="text-sm font-black text-slate-900">${formatCurrency(item.subtotal)}</span>
                            <button type="button" onclick="window.mesaEliminarItem(${idx})" class="text-slate-300 hover:text-red-500 transition-colors" title="Eliminar platillo">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 mt-1">
                        <div class="relative flex-1">
                            <i data-lucide="message-square-edit" class="absolute left-2 top-1.5 w-3.5 h-3.5 text-orange-400"></i>
                            <input type="text" placeholder="Nota a cocina (ej. sin tomate)"
                                value="${item.nota || ''}"
                                oninput="mesaState.orden[${idx}].nota = this.value"
                                class="w-full pl-7 pr-2 py-1.5 text-[10px] border border-slate-200 rounded-md bg-slate-50 focus:bg-white outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 text-slate-700 transition-all font-medium">
                        </div>
                        
                        <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200 p-0.5 flex-shrink-0">
                            <button type="button" onclick="window.mesaQuitarUno(${idx})" class="w-7 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-red-500 shadow-sm font-black transition-colors">−</button>
                            <span class="w-6 text-center text-xs font-black text-slate-800">${item.cantidad}</span>
                            <button type="button" onclick="window.mesaAgregarUno(${idx})" class="w-7 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-green-600 shadow-sm font-black transition-colors">+</button>
                        </div>
                    </div>

                </div>
            `).join('');
        if (window.lucide) window.lucide.createIcons();
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('mesaSubtotal', formatCurrency(subtotal));
    set('mesaTotal', formatCurrency(total));
    set('mesaDescuentoTotal', `−${formatCurrency(descuentoAmt)}`);
    set('mesaPropinaTotal', `+${formatCurrency(propinaAmt)}`);

    const descRow = document.getElementById('mesaDescuentoRow');
    const propRow = document.getElementById('mesaPropinaRow');
    if (descRow) descRow.classList.toggle('hidden', descuentoAmt === 0);
    if (propRow) propRow.classList.toggle('hidden', propinaAmt === 0);

    // Inputs de pago dinámicos
    const pagoDin = document.getElementById('mesaPagoDinamico');
    if (pagoDin) {
        if (mesaState.metodoPago === 'efectivo') {
            const cambio = mesaState.efectivoPagado - total;
            pagoDin.innerHTML = `
                <div class="flex items-center gap-3 mt-3 bg-white p-2 rounded-xl border border-slate-200 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100 transition-all">
                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 flex-1">Recibido $</label>
                    <input type="number" min="0" value="${mesaState.efectivoPagado || ''}" placeholder="0.00"
                        oninput="mesaState.efectivoPagado=parseFloat(this.value)||0; window.mesaActualizarOrden()"
                        class="w-24 text-right bg-transparent font-black text-slate-800 text-sm outline-none pr-1">
                </div>
                ${mesaState.efectivoPagado > 0 ? `
                    <div class="mt-2 text-center text-xs font-black uppercase p-2 rounded-xl border ${cambio >= 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-100'}">
                        ${cambio >= 0 ? `Cambio a entregar: ${formatCurrency(cambio)}` : `Faltan: ${formatCurrency(Math.abs(cambio))}`}
                    </div>
                ` : ''}
            `;
        } else if (mesaState.metodoPago === 'mixto') {
            const diff = (mesaState.efectivoPagado + mesaState.tarjetaPagado) - total;
            pagoDin.innerHTML = `
                <div class="grid grid-cols-2 gap-2 mt-3">
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-purple-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase ml-1 flex-1">EFE</span>
                        <input type="number" value="${mesaState.efectivoPagado || ''}" placeholder="0.00" oninput="mesaState.efectivoPagado=parseFloat(this.value)||0; window.mesaActualizarOrden()" class="w-16 text-right font-black text-sm text-slate-800 bg-transparent outline-none">
                    </div>
                    <div class="flex items-center bg-white border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-purple-400 transition-shadow">
                        <span class="text-[10px] font-black text-slate-400 uppercase ml-1 flex-1">TAR</span>
                        <input type="number" value="${mesaState.tarjetaPagado || ''}" placeholder="0.00" oninput="mesaState.tarjetaPagado=parseFloat(this.value)||0; window.mesaActualizarOrden()" class="w-16 text-right font-black text-sm text-slate-800 bg-transparent outline-none">
                    </div>
                </div>
                ${(mesaState.efectivoPagado > 0 || mesaState.tarjetaPagado > 0) ? `
                    <div class="mt-2 text-center text-xs font-black uppercase p-2 rounded-xl border ${Math.abs(diff)<0.01 ? 'bg-green-100 text-green-700 border-green-200' : diff<0 ? 'bg-red-50 text-red-500 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}">
                        ${Math.abs(diff)<0.01 ? '✓ Monto Completo' : diff<0 ? `Faltan: ${formatCurrency(Math.abs(diff))}` : `Sobrante: ${formatCurrency(diff)}`}
                    </div>
                ` : ''}
            `;
        } else {
            pagoDin.innerHTML = '';
        }
    }

    // Estilos botones pago
    const colores = {
        efectivo: 'bg-green-500 text-white border-green-600 shadow-md shadow-green-500/30',
        tarjeta:  'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/30',
        mixto:    'bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-600/30'
    };
    ['efectivo', 'tarjeta', 'mixto'].forEach(m => {
        const btn = document.getElementById(`mesaBtn${m.charAt(0).toUpperCase() + m.slice(1)}`);
        if (btn) btn.className = `py-2.5 rounded-xl text-xs font-black tracking-widest uppercase border transition-all ${mesaState.metodoPago === m ? colores[m] : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`;
    });
};

window.mesaQuitarUno = (idx) => {
    if (mesaState.orden[idx].cantidad <= 1) {
        mesaState.orden.splice(idx, 1);
    } else {
        mesaState.orden[idx].cantidad--;
        mesaState.orden[idx].subtotal = mesaState.orden[idx].cantidad * mesaState.orden[idx].precioUnit;
    }
    window.mesaActualizarOrden();
    window.mesaActualizarGrid();
    if (window.lucide) window.lucide.createIcons();
};

window.mesaAgregarUno = (idx) => {
    const item = mesaState.orden[idx];
    const check = verificarStockMesa(item.receta, item.cantidad + 1);
    if (!check.ok) return showNotification(`⚠️ Stock insuficiente de ${check.nombre}`, 'error');
    
    item.cantidad++;
    item.subtotal = item.cantidad * item.precioUnit;
    window.mesaActualizarOrden();
    window.mesaActualizarGrid();
};

window.mesaEliminarItem = (idx) => {
    mesaState.orden.splice(idx, 1);
    window.mesaActualizarOrden();
    window.mesaActualizarGrid();
};

window.mesaGuardarYVolver = async () => {
    if (!mesaState.mesaActiva) return;
    
    const btn = document.getElementById('btnGuardarMesa');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Guardando...'; }

    try {
        const { total } = calcTotalesMesa();

        const ordenParaGuardar = {
            items: mesaState.orden.map(i => ({
                recetaId: i.receta.id,
                nombre: i.receta.nombre,
                cantidad: i.cantidad,
                precio: i.precioUnit,
                subtotal: i.subtotal,
                nota: i.nota || ''
            })),
            items_enviados: mesaState.itemsEnviados,
            total
        };

        const { error } = await supabase.from('mesas').update({
            estado: mesaState.orden.length > 0 ? 'ocupada' : 'libre',
            orden_actual: mesaState.orden.length > 0 ? ordenParaGuardar : null,
            total_acumulado: total
        }).eq('id', mesaState.mesaActiva.id);
        
        if (error) throw error;

        await cargarDatosDeNube();
        mesaState.vista = 'mapa';
        mesaState.mesaActiva = null;
        mesaState.orden = [];
        window.render();
        showNotification('Mesa guardada correctamente', 'success');
    } catch (err) {
        showNotification('Error al guardar: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};

window.mesaVolverAlMapa = () => {
    if (mesaState.orden.length > 0) {
        if (!confirm('¿Volver al mapa? Recuerda dar click en GUARDAR si hiciste cambios, de lo contrario se perderán.')) return;
    }
    mesaState.vista = 'mapa';
    mesaState.mesaActiva = null;
    mesaState.orden = [];
    window.render();
};

// ─── COBRAR MESA ──────────────────────────────────────────────────────────────
window.mesaCobrar = () => {
    if (mesaState.orden.length === 0) return showNotification('No hay platillos en la orden para cobrar', 'error');
    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotalesMesa();

    if (mesaState.metodoPago === 'mixto') {
        const sumPago = mesaState.efectivoPagado + mesaState.tarjetaPagado;
        if (Math.abs(sumPago - total) > 0.01) {
            return showNotification(`El pago mixto (${formatCurrency(sumPago)}) no cubre el total exacto (${formatCurrency(total)})`, 'error');
        }
    }
    
    // Si eligió efectivo pero no puso cantidad, asumimos pago exacto
    if (mesaState.metodoPago === 'efectivo' && (!mesaState.efectivoPagado || mesaState.efectivoPagado === 0)) {
        mesaState.efectivoPagado = total; 
    }
    if (mesaState.metodoPago === 'efectivo' && mesaState.efectivoPagado < total) {
        return showNotification(`El efectivo recibido (${formatCurrency(mesaState.efectivoPagado)}) es menor al total`, 'error');
    }

    window.openModal(`
        <div class="p-8">
            <h2 class="text-2xl font-black mb-1 text-slate-800">Confirmar Cobro Final</h2>
            <p class="text-slate-500 text-sm mb-5 font-bold uppercase tracking-widest">${mesaState.mesaActiva?.nombre} · ${mesaState.mesaActiva?.zona}</p>
            
            <div class="bg-white rounded-xl border-2 border-slate-200 p-5 mb-5 shadow-sm">
                <div class="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    ${mesaState.orden.map(i => `
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
                    ${mesaState.descuento > 0 ? `<div class="flex justify-between text-red-500 text-sm font-bold"><span>Descuento (${mesaState.descuento}%)</span><span>−${formatCurrency(descuentoAmt)}</span></div>` : ''}
                    ${mesaState.propina > 0 ? `<div class="flex justify-between text-green-600 text-sm font-bold"><span>Propina (${mesaState.propina}%)</span><span>+${formatCurrency(propinaAmt)}</span></div>` : ''}
                    <div class="flex justify-between font-black text-2xl mt-2 pt-2 border-t border-slate-200 text-slate-900"><span>TOTAL</span><span class="text-orange-600">${formatCurrency(total)}</span></div>
                </div>
            </div>

            <div class="bg-orange-50 p-4 rounded-xl border border-orange-200 mb-6 flex justify-between items-center">
                <div>
                    <p class="text-[10px] font-black text-orange-600 uppercase tracking-widest">Método</p>
                    <p class="font-bold text-orange-800 capitalize text-lg">${mesaState.metodoPago}</p>
                </div>
                <div class="text-right">
                    ${mesaState.metodoPago === 'efectivo' ? `
                        <p class="text-xs text-orange-600 font-bold">Recibido: ${formatCurrency(mesaState.efectivoPagado)}</p>
                        <p class="text-sm font-black text-green-600 bg-green-100 px-2 py-0.5 rounded mt-1">Cambio: ${formatCurrency(mesaState.efectivoPagado - total)}</p>
                    ` : mesaState.metodoPago === 'mixto' ? `
                        <p class="text-xs font-bold text-orange-800">EFE: ${formatCurrency(mesaState.efectivoPagado)} | TAR: ${formatCurrency(mesaState.tarjetaPagado)}</p>
                    ` : '<i data-lucide="credit-card" class="w-6 h-6 text-orange-500"></i>'}
                </div>
            </div>

            <div class="flex gap-3">
                <button type="button" onclick="closeModal()" class="flex-1 border-2 border-slate-200 py-3.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors">Volver a la Orden</button>
                <button type="button" onclick="window.mesaConfirmarCobro()" id="btnConfirmarMesa"
                    class="flex-[2] bg-orange-600 text-white py-3.5 rounded-xl font-black text-lg hover:bg-orange-700 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-transform active:scale-95">
                    <i data-lucide="printer" class="w-5 h-5"></i> Imprimir Ticket
                </button>
            </div>
        </div>
    `);
    if (window.lucide) window.lucide.createIcons();
};

window.mesaConfirmarCobro = async () => {
    const btn = document.getElementById('btnConfirmarMesa');
    if (btn) { btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Procesando...'; }

    const { total, subtotal, descuentoAmt, propinaAmt } = calcTotalesMesa();
    const folio = `MESA-${mesaState.mesaActiva.nombre.replace(/\s/g,'-')}-${Date.now().toString().slice(-5)}`;

    try {
        // Descontar stock
        const productosAfectados = new Map();
        for (const item of mesaState.orden) {
            for (const ing of (item.receta.ingredientes || [])) {
                const actual = productosAfectados.get(ing.productoId) || 0;
                productosAfectados.set(ing.productoId, actual + (ing.cantidad * item.cantidad));
            }
        }
        for (const [productoId, cantDescuento] of productosAfectados) {
            const prod = DB.productos.find(p => String(p.id) === String(productoId));
            if(prod) {
                const nuevoStock = prod.stock - cantDescuento;
                await supabase.from('productos').update({ stock: nuevoStock }).eq('id', productoId);
                await registrarMovimientoEnNube('Salida POS', productoId, -cantDescuento, `Venta ${folio}`);
            }
        }

        // Guardar venta
        try {
            await supabase.from('ventas').insert({
                folio,
                items: mesaState.orden.map(i => ({
                    recetaId: i.receta.id,
                    nombre: i.receta.nombre,
                    cantidad: i.cantidad,
                    precio: i.precioUnit,
                    nota: i.nota || ''
                })),
                subtotal,
                descuento: mesaState.descuento,
                descuento_monto: descuentoAmt,
                propina: propinaAmt,
                total,
                metodo_pago: mesaState.metodoPago,
                efectivo: mesaState.efectivoPagado,
                tarjeta: mesaState.tarjetaPagado,
                mesa: mesaState.mesaActiva.nombre,
                usuario: AppState.user?.nombre || 'Sistema',
                fecha: new Date().toISOString()
            });
        } catch(_) {}

        // Liberar mesa
        await supabase.from('mesas').update({
            estado: 'libre',
            orden_actual: null,
            abierta_en: null,
            usuario: null,
            total_acumulado: 0
        }).eq('id', mesaState.mesaActiva.id);

        await cargarDatosDeNube();

        // Imprimir ticket legal (Restaurante MX Format)
        window.mesaImprimirTicket(folio, total, subtotal, descuentoAmt, propinaAmt);
        
        window.closeModal();
        showNotification(`✅ Venta cerrada. Mesa liberada.`, 'success');

        mesaState.vista = 'mapa';
        mesaState.mesaActiva = null;
        mesaState.orden = [];
        window.render();

    } catch (err) {
        console.error(err);
        showNotification('Error al cobrar: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer"></i> Reintentar Cobro'; }
    }
};

// ─── TICKET TÉRMICO LEGAL DE MESA (ESTILO SOFT RESTAURANT MX) ────────────────
window.mesaImprimirTicket = (folio, total, subtotalBase, descuentoAmt, propinaAmt) => {
    const { metodoPago } = mesaState;
    const conf = DB.configuracion || {};
    
    const nombreComercial = conf.nombreEmpresa || conf.nombre_empresa || 'Restaurante';
    const rfc = conf.rfc ? `RFC:${conf.rfc.toUpperCase()}` : '';
    const direccion = conf.direccion || '';
    const telefono = conf.telefono ? `TEL:${conf.telefono}` : '';
    
    // Desglose IVA
    const ivaTasa = conf.iva || 0.16;
    const subtotalDesglosado = total / (1 + ivaTasa);
    const ivaDesglosado = total - subtotalDesglosado;

    const mesaNom = mesaState.mesaActiva ? mesaState.mesaActiva.nombre : 'MOSTRADOR';
    const personas = mesaState.mesaActiva ? mesaState.mesaActiva.capacidad : '1';
    const mesero = AppState.user?.nombre || 'CAJERO';
    const numOrden = folio.split('-').pop(); 
    
    const fecha = new Date();
    const fechaStr = `${fecha.getDate().toString().padStart(2,'0')}/${(fecha.getMonth()+1).toString().padStart(2,'0')}/${fecha.getFullYear()} ${fecha.getHours().toString().padStart(2,'0')}:${fecha.getMinutes().toString().padStart(2,'0')}`;

    const logoHtml = conf.logo_url ? `<img src="${conf.logo_url}" class="ticket-logo">` : '';
    const letrasTotal = numeroALetras(total);

    const ticketHTML = `
        <html><head>
            <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 13px; width: 280px; margin: 0 auto; padding: 10px 0; color: #000; line-height: 1.1; }
            .center { text-align: center; } 
            .left { text-align: left; }
            .bold { font-weight: bold; } 
            .line { border-top: 1px dashed #000; margin: 8px 0; } 
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px;}
            .ticket-logo { max-width: 140px; max-height: 90px; margin: 0 auto 10px auto; display: block; filter: grayscale(100%); }
            .item-list { width: 100%; border-collapse: collapse; margin: 8px 0; }
            .item-list td { padding: 3px 0; vertical-align: top; }
            .col-cant { width: 15%; }
            .col-desc { width: 60%; padding-right: 5px; }
            .col-precio { width: 25%; text-align: right; }
            @media print { body { width: 100%; } }
            </style>
        </head><body>
            ${logoHtml}
            <div class="center">
                <div class="bold" style="font-size:16px;">${nombreComercial.toUpperCase()}</div>
                ${rfc ? `<div style="margin-top:2px;">${rfc}</div>` : ''}
                ${direccion ? `<div style="margin-top:2px;">${direccion.toUpperCase()}</div>` : ''}
                ${telefono ? `<div>${telefono}</div>` : ''}
            </div>
            
            <div class="line"></div>
            
            <div class="grid-2">
                <div>MESA:${mesaNom.toUpperCase()}</div>
                <div style="text-align:right;">ORDEN:${numOrden}</div>
                <div style="grid-column: span 2;">MESERO:${mesero.toUpperCase()}</div>
                <div>PERSONAS:${personas}</div>
                <div style="text-align:right;">PAGO:${metodoPago.toUpperCase().slice(0,3)}</div>
                <div style="grid-column: span 2;">FOLIO:${folio}</div>
                <div style="grid-column: span 2;">${fechaStr}</div>
            </div>
            
            <div class="line"></div>
            
            <table class="item-list">
                ${mesaState.orden.map(i => `
                    <tr>
                        <td class="col-cant">${i.cantidad}</td>
                        <td class="col-desc">${i.receta.nombre.toUpperCase()}</td>
                        <td class="col-precio">${formatCurrency(i.subtotal)}</td>
                    </tr>
                    ${i.nota ? `<tr><td></td><td colspan="2" style="font-size:10px; font-style:italic; color:#444;">* ${i.nota.toUpperCase()}</td></tr>` : ''}
                `).join('')}
            </table>
            
            <div class="line"></div>
            
            ${descuentoAmt > 0 ? `<div class="row" style="font-size:11px;"><span>DESC. APLICADO:</span><span>-${formatCurrency(descuentoAmt)}</span></div>` : ''}
            ${propinaAmt > 0 ? `<div class="row" style="font-size:11px;"><span>PROPINA INCLUIDA:</span><span>+${formatCurrency(propinaAmt)}</span></div>` : ''}
            
            <div class="row bold" style="font-size: 16px; margin: 10px 0;">
                <span style="margin-left: auto; padding-right: 20px;">TOTAL:</span>
                <span>${formatCurrency(total)}</span>
            </div>
            
            <div class="line"></div>
            
            <div class="left" style="margin: 10px 0; font-size: 11px;">
                <div>${letrasTotal}</div>
            </div>
            
            <div class="center" style="margin: 10px 0; font-size: 12px;">
                <span style="margin-right: 15px;">SUBTOTAL:${formatCurrency(subtotalDesglosado)}</span>
                <span>IVA:${formatCurrency(ivaDesglosado)}</span>
            </div>
            
            <div class="center" style="margin-top: 15px; font-size: 12px; font-weight:bold;">
                <div>ESTE NO ES UN COMPROBANTE FISCAL</div>
                <div style="margin-top:4px;">${conf.mensaje_ticket ? conf.mensaje_ticket.toUpperCase() : '¡GRACIAS POR SU VISITA!'}</div>
            </div>
            
            <div class="center" style="margin-top: 25px; font-size: 10px; color: #666;">
                *** STOCK CENTRAL POS ***
            </div>
        </body></html>`;

    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) { win.document.write(ticketHTML); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 800); }
};

// ─── Scanner en pantalla mesas ────────────────────────────────────────────────
window.mesaScanner = (codigo) => {
    if (mesaState.vista !== 'pos') return;
    const receta = DB.recetas.find(r => (r.codigo_pos || '').toLowerCase() === codigo.toLowerCase());
    if (receta) {
        window.mesaAgregarReceta(receta.id);
        showNotification(`✅ ${receta.nombre} agregado`, 'success');
    } else {
        showNotification(`⚠️ Código no encontrado: ${codigo}`, 'error');
    }
};

// ─── COMANDA (Envío a Cocina) ─────────────────────────────────────────────────
window.mesaEnviarComanda = () => {
    if (mesaState.orden.length === 0) return showNotification('No hay platillos en la orden', 'error');

    const nuevos = [];
    for (const item of mesaState.orden) {
        const enviado = mesaState.itemsEnviados.find(e => String(e.recetaId) === String(item.receta.id));
        const cantEnviada = enviado ? enviado.cantidad : 0;
        const cantNueva = item.cantidad - cantEnviada;
        if (cantNueva > 0) nuevos.push({ ...item, cantidadNueva: cantNueva });
    }

    if (nuevos.length === 0) return showNotification('Todos los platillos actuales ya fueron enviados a cocina', 'info');

    window.mesaImprimirComanda(nuevos);

    mesaState.itemsEnviados = mesaState.orden.map(i => ({
        recetaId: i.receta.id,
        nombre: i.receta.nombre,
        cantidad: i.cantidad
    }));

    const btn = document.getElementById('btnComanda');
    if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> ¡Enviado a Cocina!';
        btn.className = btn.className.replace('bg-slate-800 hover:bg-slate-900', 'bg-green-600 hover:bg-green-700 text-white');
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = orig;
            btn.className = btn.className.replace('bg-green-600 hover:bg-green-700 text-white', 'bg-slate-800 hover:bg-slate-900 text-white');
            if (window.lucide) window.lucide.createIcons();
        }, 3000);
    }
    showNotification(`🍳 Comanda generada (${nuevos.length} items nuevos)`, 'success');
};

window.mesaImprimirComanda = (items) => {
    const mesa = mesaState.mesaActiva;
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const mesero = AppState.user?.nombre || 'Sistema';
    const empresa = DB.configuracion?.nombreEmpresa || '';
    const esReimpresion = items.every(i => i.cantidadNueva === i.cantidad) ? '' : ' (AGREGADO)';

    const comandaHTML = `
        <html><head><style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; font-size: 14px; width: 280px; margin: 0 auto; padding: 12px; background: white; color:#000; }
            .header { text-align: center; margin-bottom: 10px; }
            .empresa { font-size: 11px; color: #444; }
            .mesa-badge { background: #000; color: #fff; font-size: 24px; font-weight: 900; text-align: center; padding: 8px; border-radius: 6px; margin: 8px 0; letter-spacing: 2px; }
            .meta { font-size: 12px; color: #333; margin-bottom: 8px; font-weight:bold; }
            .meta span { display: block; margin-bottom:2px; }
            .line-solid { border-top: 3px solid #000; margin: 10px 0; }
            .line { border-top: 1px dashed #666; margin: 8px 0; }
            .item { margin: 12px 0; overflow:hidden; }
            .item-nombre { font-size: 18px; font-weight: 900; line-height: 1.2; padding-right: 50px; }
            .item-cant { font-size: 28px; font-weight: 900; float: right; background: #000; color: #fff; padding: 2px 8px; border-radius: 4px; text-align: center; min-width: 45px; }
            .item-nota { font-size: 14px; color: #000; font-weight:bold; padding: 4px 0 0 8px; border-left: 4px solid #000; margin-top: 6px; }
            @media print { body { width: 100%; } @page { margin: 0; } }
        </style></head>
        <body>
            <div class="header">
                ${empresa ? `<div class="empresa">${empresa.toUpperCase()}</div>` : ''}
                <div style="font-size:14px; font-weight:900; text-transform:uppercase; letter-spacing:2px; margin-top:4px;">
                    ⚡ COMANDA${esReimpresion}
                </div>
            </div>
            <div class="mesa-badge">${mesa ? mesa.nombre.toUpperCase() : 'MOSTRADOR'}</div>
            <div class="meta">
                <span>🕐 HORA: ${hora}</span>
                <span>👤 MESERO: ${mesero.toUpperCase()}</span>
                ${mesa?.zona ? `<span>📍 ZONA: ${mesa.zona.toUpperCase()}</span>` : ''}
            </div>
            <div class="line-solid"></div>
            ${items.map(item => `
                <div class="item">
                    <div class="item-cant">${item.cantidadNueva || item.cantidad}</div>
                    <div class="item-nombre">${item.receta.nombre.toUpperCase()}</div>
                    ${item.nota ? `<div class="item-nota">>>> ${item.nota.toUpperCase()}</div>` : ''}
                </div>
                <div class="line"></div>
            `).join('')}
            <div class="header" style="margin-top:15px; font-size:10px;">Enviado desde Stock Central</div>
        </body></html>`;

    const win = window.open('', '_blank', 'width=320,height=500');
    if (win) { win.document.write(comandaHTML); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 500); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DIVIDIR CUENTA
// ═══════════════════════════════════════════════════════════════════════════════

let dividirState = {
    mesaId: null, modo: null, items: [], partes: [], numPersonas: 2, totalOriginal: 0, totalPagado: 0
};

window.mesaDividirCuenta = async (mesaId) => {
    await cargarDatosDeNube();
    const mesa = (DB.mesas || []).find(m => String(m.id) === String(mesaId));
    if (!mesa) return showNotification('Mesa no encontrada', 'error');

    let items = [];
    let total = 0;

    if (mesaState.vista === 'pos' && String(mesaState.mesaActiva?.id) === String(mesaId) && mesaState.orden.length > 0) {
        items = mesaState.orden.map(i => ({
            recetaId: i.receta.id,
            nombre: i.receta.nombre,
            cantidad: i.cantidad,
            precio: i.precioUnit,
            subtotal: i.subtotal,
            nota: i.nota || ''
        }));
        total = items.reduce((s, i) => s + i.subtotal, 0);
    } else {
        const orden = mesa.orden_actual || { items: [], total: 0 };
        items = orden.items || [];
        total = orden.total || 0;
    }

    if (items.length === 0) {
        showNotification('No hay platillos en la orden para dividir', 'info');
        return;
    }

    dividirState = { mesaId, mesa, modo: null, items, partes: [], numPersonas: 2, totalOriginal: total, totalPagado: 0 };
    window.dividirMostrarSelector();
};

window.dividirMostrarSelector = () => {
    const { totalOriginal, items } = dividirState;
    window.openModal(`
        <div class="p-6">
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-purple-100 p-3 rounded-xl"><i data-lucide="split" class="w-6 h-6 text-purple-600"></i></div>
                <div>
                    <h2 class="text-xl font-black text-slate-800">Dividir Cuenta</h2>
                    <p class="text-sm text-slate-500 font-bold">${dividirState.mesa?.nombre} · Total: ${formatCurrency(totalOriginal)}</p>
                </div>
            </div>
            
            <p class="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Elige el método de división:</p>
            
            <div class="grid grid-cols-1 gap-3">
                <button type="button" onclick="window.dividirModo('platillos')" class="flex items-center gap-4 p-4 bg-white border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 rounded-xl transition-all text-left shadow-sm">
                    <div class="bg-purple-100 p-2.5 rounded-lg flex-shrink-0"><i data-lucide="list" class="w-6 h-6 text-purple-600"></i></div>
                    <div>
                        <p class="font-black text-slate-800 text-lg">Por platillo</p>
                        <p class="text-xs text-slate-500 mt-0.5">Cada persona selecciona exactamente lo que consumió.</p>
                    </div>
                </button>
                
                <button type="button" onclick="window.dividirModo('iguales')" class="flex items-center gap-4 p-4 bg-white border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl transition-all text-left shadow-sm">
                    <div class="bg-blue-100 p-2.5 rounded-lg flex-shrink-0"><i data-lucide="users" class="w-6 h-6 text-blue-600"></i></div>
                    <div>
                        <p class="font-black text-slate-800 text-lg">Partes iguales</p>
                        <p class="text-xs text-slate-500 mt-0.5">Divide el monto total en partes equitativas (mitad, tercios).</p>
                    </div>
                </button>
                
                <button type="button" onclick="window.dividirModo('personalizado')" class="flex items-center gap-4 p-4 bg-white border-2 border-slate-200 hover:border-green-400 hover:bg-green-50 rounded-xl transition-all text-left shadow-sm">
                    <div class="bg-green-100 p-2.5 rounded-lg flex-shrink-0"><i data-lucide="pencil" class="w-6 h-6 text-green-600"></i></div>
                    <div>
                        <p class="font-black text-slate-800 text-lg">Monto manual</p>
                        <p class="text-xs text-slate-500 mt-0.5">Asigna una cantidad de dinero específica a cada persona.</p>
                    </div>
                </button>
            </div>
            
            <button type="button" onclick="closeModal()" class="mt-5 w-full border-2 border-slate-200 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors">Cancelar</button>
        </div>
    `);
    if(window.lucide) window.lucide.createIcons();
};

window.dividirModo = (modo) => {
    dividirState.modo = modo;
    if (modo === 'platillos') window.dividirPorPlatillos();
    else if (modo === 'iguales') window.dividirIguales();
    else window.dividirPersonalizado();
};

// ── MODO: POR PLATILLO ────────────────────────────────────────────────────────
window.dividirPorPlatillos = () => {
    const itemsExpandidos = [];
    dividirState.items.forEach(item => {
        for (let i = 0; i < item.cantidad; i++) {
            itemsExpandidos.push({
                id: `${item.recetaId}_${i}`,
                nombre: item.nombre,
                precio: item.precio,
                nota: item.nota,
                persona: null
            });
        }
    });
    
    dividirState.itemsExpandidos = itemsExpandidos;
    dividirState.partes = [
        { nombre: 'Persona 1', items: [], metodo: 'efectivo', pagado: false },
        { nombre: 'Persona 2', items: [], metodo: 'efectivo', pagado: false }
    ];
    
    window.dividirRenderPlatillos();
};

window.dividirRenderPlatillos = () => {
    const { itemsExpandidos, partes } = dividirState;
    
    window.openModal(`
        <div class="p-6 max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between mb-4 flex-shrink-0">
                <h2 class="text-lg font-black text-slate-800">Dividir por platillo</h2>
                <button type="button" onclick="window.dividirAgregarPersona()" class="text-xs bg-purple-100 text-purple-700 font-bold px-3 py-1.5 rounded-lg hover:bg-purple-200">
                    + Persona
                </button>
            </div>
            
            <div class="grid grid-cols-${Math.min(partes.length, 4)} gap-2 mb-3 flex-shrink-0">
                ${partes.map((p, pi) => `
                    <div class="bg-slate-50 rounded-xl p-2 text-center border-2 ${p.items.length > 0 ? 'border-purple-300' : 'border-slate-200'}">
                        <input value="${p.nombre}" onchange="dividirState.partes[${pi}].nombre=this.value; window.dividirRenderPlatillos()"
                            class="w-full text-xs font-black text-slate-700 bg-transparent text-center outline-none border-none">
                        <p class="text-purple-600 font-black text-sm">${formatCurrency(p.items.reduce((s,i) => s + i.precio, 0))}</p>
                        <p class="text-[10px] text-slate-400">${p.items.length} items</p>
                    </div>
                `).join('')}
            </div>
            
            <div class="flex-1 overflow-y-auto min-h-0 space-y-1 custom-scrollbar pr-2">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Toca un platillo para asignarlo:</p>
                ${itemsExpandidos.map((item, ii) => {
                    const persona = item.persona !== null ? partes[item.persona] : null;
                    return `
                        <div class="flex items-center gap-2 p-3 rounded-xl border-2 ${persona ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-white'} cursor-pointer hover:border-purple-400 transition-all"
                             onclick="window.dividirAsignarItem(${ii})">
                            <div class="flex-1">
                                <p class="text-sm font-bold text-slate-800">${item.nombre}</p>
                                <p class="text-xs font-black text-slate-500 mt-0.5">${formatCurrency(item.precio)}</p>
                            </div>
                            <div class="text-right flex-shrink-0">
                                ${persona ? `
                                    <span class="text-xs bg-purple-600 text-white px-2 py-1 rounded-md font-bold">${persona.nombre}</span>
                                ` : `
                                    <span class="text-[10px] text-slate-400 border border-dashed border-slate-300 px-2 py-1 rounded-md uppercase font-bold">Sin asignar</span>
                                `}
                            </div>
                        </div>`;
                }).join('')}
            </div>
            
            <div class="flex gap-3 mt-5 pt-4 border-t border-slate-100 flex-shrink-0">
                <button type="button" onclick="window.dividirMostrarSelector()" class="flex-1 border-2 border-slate-200 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors">Volver</button>
                <button type="button" onclick="window.dividirConfirmarPlatillos()" class="flex-[2] bg-purple-600 text-white py-3 rounded-xl font-black hover:bg-purple-700 shadow-lg shadow-purple-600/30 transition-transform active:scale-95">Continuar al Cobro →</button>
            </div>
        </div>
    `);
};

window.dividirAgregarPersona = () => { 
    dividirState.partes.push({ nombre: `Persona ${dividirState.partes.length + 1}`, items: [], metodo: 'efectivo', pagado: false }); 
    window.dividirRenderPlatillos(); 
};

window.dividirAsignarItem = (itemIdx) => {
    const item = dividirState.itemsExpandidos[itemIdx];
    item.persona = item.persona === null ? 0 : (item.persona < dividirState.partes.length - 1 ? item.persona + 1 : null);
    dividirState.partes.forEach((p, pi) => p.items = dividirState.itemsExpandidos.filter(i => i.persona === pi));
    window.dividirRenderPlatillos();
};

window.dividirConfirmarPlatillos = () => {
    const sinAsignar = dividirState.itemsExpandidos.filter(i => i.persona === null);
    if (sinAsignar.length > 0) {
        if (!confirm(`Hay ${sinAsignar.length} platillo(s) sin asignar. Serán ignorados del cobro parcial. ¿Continuar?`)) return;
    }
    
    dividirState.partes.forEach(p => p.monto = p.items.reduce((s, i) => s + i.precio, 0));
    dividirState.partes = dividirState.partes.filter(p => p.monto > 0);
    window.dividirPagarPartes();
};

// ── MODO: PARTES IGUALES ──────────────────────────────────────────────────────
window.dividirIguales = () => {
    window.openModal(`
        <div class="p-8 text-center">
            <div class="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="users" class="w-8 h-8 text-blue-600"></i></div>
            <h2 class="text-2xl font-black text-slate-800 mb-1">Partes iguales</h2>
            <p class="text-slate-500 font-bold mb-8">Total a dividir: ${formatCurrency(dividirState.totalOriginal)}</p>
            
            <p class="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">¿Entre cuántas personas?</p>
            
            <div class="flex items-center justify-center gap-6 mb-8">
                <button type="button" onclick="if(dividirState.numPersonas>2){dividirState.numPersonas--; window.dividirIguales()}"
                    class="w-14 h-14 bg-slate-100 rounded-full text-3xl font-black text-slate-600 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-colors">−</button>
                <span class="text-6xl font-black text-slate-800 w-20 text-center">${dividirState.numPersonas}</span>
                <button type="button" onclick="dividirState.numPersonas++; window.dividirIguales()"
                    class="w-14 h-14 bg-slate-100 rounded-full text-3xl font-black text-slate-600 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-colors">+</button>
            </div>
            
            <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8">
                <p class="text-xs font-bold text-blue-500 uppercase mb-1">A cada persona le toca</p>
                <p class="text-4xl font-black text-blue-700">${formatCurrency(dividirState.totalOriginal / dividirState.numPersonas)}</p>
            </div>

            <div class="flex gap-3">
                <button type="button" onclick="window.dividirMostrarSelector()" class="flex-1 border-2 border-slate-200 py-3.5 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors">Volver</button>
                <button type="button" onclick="window.dividirConfirmarIguales()" class="flex-[2] bg-blue-600 text-white py-3.5 rounded-xl font-black text-lg hover:bg-blue-700 shadow-lg shadow-blue-600/30 transition-transform active:scale-95">Ir al Cobro →</button>
            </div>
        </div>
    `);
    if(window.lucide) window.lucide.createIcons();
};

window.dividirConfirmarIguales = () => {
    const montoPorPersona = dividirState.totalOriginal / dividirState.numPersonas;
    dividirState.partes = Array.from({ length: dividirState.numPersonas }, (_, i) => ({ 
        nombre: `Persona ${i + 1}`, 
        monto: montoPorPersona, 
        metodo: 'efectivo', 
        pagado: false, 
        items: [] 
    }));
    window.dividirPagarPartes();
};

// ── MODO: PERSONALIZADO ───────────────────────────────────────────────────────
window.dividirPersonalizado = () => {
    if (dividirState.partes.length === 0) { 
        dividirState.partes = [ 
            { nombre: 'Persona 1', monto: 0, metodo: 'efectivo', pagado: false }, 
            { nombre: 'Persona 2', monto: 0, metodo: 'efectivo', pagado: false } 
        ]; 
    }
    window.dividirRenderPersonalizado();
};

window.dividirRenderPersonalizado = () => {
    const { partes, totalOriginal } = dividirState;
    const asignado = partes.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const restante = totalOriginal - asignado;

    window.openModal(`
        <div class="p-6">
            <div class="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                <div>
                    <h2 class="text-xl font-black text-slate-800">Monto Manual</h2>
                    <p class="text-xs text-slate-500 font-bold mt-1">Asigna cuánto pagará cada quién</p>
                </div>
                <button type="button" onclick="window.dividirAgregarPersonaCustom()" class="bg-green-100 text-green-700 font-black px-4 py-2 rounded-xl hover:bg-green-200 transition-colors shadow-sm">+ Añadir Persona</button>
            </div>

            <div class="space-y-3 mb-6 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                ${partes.map((p, pi) => `
                    <div class="flex items-center gap-3 bg-white rounded-xl p-3 border-2 border-slate-200 hover:border-green-300 transition-colors shadow-sm">
                        <input value="${p.nombre}" data-nombre="${pi}" onchange="dividirState.partes[${pi}].nombre=this.value"
                            class="flex-1 text-sm font-bold text-slate-700 bg-transparent outline-none border-b border-dashed border-slate-300 focus:border-green-500 pb-1">
                        <div class="flex items-center gap-1 flex-shrink-0 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                            <span class="text-slate-500 font-black pl-2">$</span>
                            <input type="number" min="0" step="0.01" value="${p.monto || ''}" placeholder="0.00" data-monto="${pi}"
                                oninput="dividirState.partes[${pi}].monto=parseFloat(this.value)||0; window.dividirActualizarRestante()"
                                class="w-24 text-right text-base font-black text-slate-800 bg-transparent outline-none">
                        </div>
                        ${partes.length > 2 ? `
                            <button type="button" onclick="dividirState.partes.splice(${pi},1); window.dividirRenderPersonalizado()" class="text-slate-300 hover:text-red-500 p-2">
                                <i data-lucide="trash-2" class="w-5 h-5"></i>
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <div class="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
                <div class="flex justify-between text-sm mb-1"><span class="text-slate-500 font-bold">Total Cuenta</span><span class="font-black text-slate-800">${formatCurrency(totalOriginal)}</span></div>
                <div class="flex justify-between text-sm mb-2"><span class="text-slate-500 font-bold">Total Asignado</span><span class="font-black text-blue-600">${formatCurrency(asignado)}</span></div>
                <div class="flex justify-between text-lg font-black pt-2 border-t border-slate-200 ${restante > 0.01 ? 'text-orange-500' : restante < -0.01 ? 'text-red-600' : 'text-green-600'}">
                    <span>Falta por asignar</span><span id="dividirRestante">${formatCurrency(restante)}</span>
                </div>
            </div>

            <button type="button" onclick="window.dividirAutoCompletar()" class="w-full bg-blue-50 text-blue-600 font-bold py-3 rounded-xl hover:bg-blue-100 flex items-center justify-center gap-2 transition-colors mb-6 border border-blue-100">
                <i data-lucide="wand-2" class="w-4 h-4"></i> Asignar resto a la última persona
            </button>

            <div class="flex gap-3">
                <button type="button" onclick="window.dividirMostrarSelector()" class="flex-1 border-2 border-slate-200 py-3.5 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors">Volver</button>
                <button type="button" onclick="window.dividirConfirmarPersonalizado()" class="flex-[2] bg-green-600 text-white py-3.5 rounded-xl font-black text-lg hover:bg-green-700 shadow-lg shadow-green-600/30 transition-transform active:scale-95">Confirmar →</button>
            </div>
        </div>
    `);
    if (window.lucide) window.lucide.createIcons();
};

window.dividirAgregarPersonaCustom = () => { 
    dividirState.partes.push({ nombre: `Persona ${dividirState.partes.length + 1}`, monto: 0, metodo: 'efectivo', pagado: false }); 
    window.dividirRenderPersonalizado(); 
};

window.dividirActualizarRestante = () => {
    const asignado = dividirState.partes.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const el = document.getElementById('dividirRestante');
    if (el) el.textContent = formatCurrency(dividirState.totalOriginal - asignado);
};

window.dividirAutoCompletar = () => {
    const asignado = dividirState.partes.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const restante = dividirState.totalOriginal - asignado;
    if (restante <= 0) return;
    const ultima = dividirState.partes[dividirState.partes.length - 1];
    ultima.monto = parseFloat(((ultima.monto || 0) + restante).toFixed(2));
    window.dividirRenderPersonalizado();
};

window.dividirConfirmarPersonalizado = () => {
    dividirState.partes.forEach((p, pi) => {
        const input = document.querySelector(`input[data-monto="${pi}"]`); 
        if (input) p.monto = parseFloat(input.value) || 0;
        
        const inputNombre = document.querySelector(`input[data-nombre="${pi}"]`); 
        if (inputNombre) p.nombre = inputNombre.value || p.nombre;
    });
    
    const asignado = dividirState.partes.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    if (asignado <= 0) return showNotification('Asigna al menos un monto a cada persona', 'error');

    const restante = dividirState.totalOriginal - asignado;
    if (restante > 0.05) {
        if (!confirm(`Faltan ${formatCurrency(restante)} sin asignar. Se guardarán como "Pendiente". ¿Continuar?`)) return;
        dividirState.partes.push({ nombre: 'Saldo Pendiente', monto: parseFloat(restante.toFixed(2)), metodo: 'efectivo', pagado: false });
    } else if (restante < -0.05) { 
        return showNotification(`Los montos exceden el total por ${formatCurrency(Math.abs(restante))}`, 'error'); 
    }

    dividirState.partes = dividirState.partes.filter(p => (parseFloat(p.monto) || 0) > 0);
    window.dividirPagarPartes();
};

// ─── Cobrar partes ────────────────────────────────────────────────────────────
window.dividirPagarPartes = () => { 
    window.dividirRenderCobro(); 
};

window.dividirRenderCobro = () => {
    const { partes, totalOriginal } = dividirState;
    const totalPagado = partes.filter(p => p.pagado).reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const pendientes = partes.filter(p => !p.pagado);
    const pagadas = partes.filter(p => p.pagado);

    window.openModal(`
        <div class="p-8 max-h-[90vh] flex flex-col bg-slate-50">
            <div class="flex items-center gap-4 mb-6 flex-shrink-0">
                <div class="bg-indigo-600 p-4 rounded-2xl shadow-lg shadow-indigo-600/30"><i data-lucide="wallet" class="w-6 h-6 text-white"></i></div>
                <div>
                    <h2 class="text-2xl font-black text-slate-800">Caja Dividida</h2>
                    <p class="text-sm font-bold text-slate-500 mt-0.5">Mesa: ${dividirState.mesa?.nombre}</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-5 flex-shrink-0">
                <div class="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                    <span>Progreso de cobro</span>
                    <span class="text-indigo-600">${formatCurrency(totalPagado)} / ${formatCurrency(totalOriginal)}</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/50">
                    <div class="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all duration-500" style="width: ${Math.min(100, (totalPagado/totalOriginal)*100)}%"></div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto min-h-0 space-y-3 custom-scrollbar pr-2 pb-4">
                ${pendientes.map((p, pi) => {
                    const idx = partes.indexOf(p);
                    return `
                    <div class="bg-white border-2 border-indigo-100 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                        <div class="flex items-center justify-between mb-4 pl-2">
                            <p class="font-black text-slate-800 text-lg">${p.nombre}</p>
                            <p class="text-2xl font-black text-indigo-700">${formatCurrency(p.monto)}</p>
                        </div>
                        <div class="grid grid-cols-3 gap-2 mb-4 pl-2">
                            ${['efectivo','tarjeta','mixto'].map(m => {
                                const sel = p.metodo === m;
                                return `<button type="button" onclick="dividirState.partes[${idx}].metodo='${m}'; window.dividirRenderCobro()"
                                    style="${sel ? 'background:#4f46e5;color:#fff;border-color:#4f46e5;' : 'background:#fff;color:#64748b;border-color:#e2e8f0;'}"
                                    class="py-2.5 rounded-xl text-xs font-bold border transition-all">
                                    ${m.charAt(0).toUpperCase() + m.slice(1)}
                                </button>`;
                            }).join('')}
                        </div>
                        <button type="button" onclick="window.dividirCobrarParte(${idx})"
                            class="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black text-sm hover:bg-slate-800 flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-slate-300">
                            <i data-lucide="check-circle" class="w-5 h-5"></i> Registrar Cobro e Imprimir
                        </button>
                    </div>`;
                }).join('')}

                ${pagadas.length > 0 ? `
                    <div class="mt-6">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <i data-lucide="check-square" class="w-3 h-3 text-green-500"></i> Cuentas ya pagadas
                        </p>
                        ${pagadas.map(p => `
                            <div class="flex justify-between items-center py-3 px-4 bg-green-50 border border-green-100 rounded-xl mb-2">
                                <div>
                                    <span class="text-sm font-bold text-green-800 block">${p.nombre}</span>
                                    <span class="text-[10px] text-green-600 uppercase font-bold">Folio: ${p.folio}</span>
                                </div>
                                <span class="text-lg font-black text-green-700">${formatCurrency(p.monto)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="mt-2 flex-shrink-0">
                ${pendientes.length > 0 ? `
                    <button type="button" onclick="window.dividirCerrarParcial()"
                        class="w-full bg-white border-2 border-slate-300 text-slate-600 py-3.5 rounded-xl font-bold hover:bg-slate-100 transition-colors shadow-sm">
                        Pausar división (Cobrar el resto más tarde)
                    </button>
                ` : ''}
            </div>
        </div>
    `);
    if (window.lucide) window.lucide.createIcons();
};

window.dividirCobrarParte = async (idx) => {
    const parte = dividirState.partes[idx];
    const folio = `DIV-${dividirState.mesa?.nombre?.replace(/\s/g,'-')}-${Date.now().toString().slice(-5)}`;

    window.dividirImprimirTicketParte(parte, folio);

    dividirState.partes[idx].pagado = true;
    dividirState.partes[idx].folio = folio;

    const totalPagado = dividirState.partes.filter(p => p.pagado).reduce((s, p) => s + p.monto, 0);
    const todoPagado = Math.abs(totalPagado - dividirState.totalOriginal) < 0.05;

    if (todoPagado) {
        await window.dividirFinalizarTodo();
    } else {
        showNotification(`✅ ${parte.nombre} cobrado exitosamente`, 'success');
        window.dividirRenderCobro();
    }
};

window.dividirFinalizarTodo = async () => {
    const { mesaId, partes, mesa } = dividirState;
    try {
        const productosAfectados = new Map();
        if (mesaState.vista === 'pos' && String(mesaState.mesaActiva?.id) === String(mesaId)) {
            for (const item of mesaState.orden) {
                for (const ing of (item.receta.ingredientes || [])) {
                    const actual = productosAfectados.get(ing.productoId) || 0;
                    productosAfectados.set(ing.productoId, actual + (ing.cantidad * item.cantidad));
                }
            }
        }
        
        for (const [productoId, cantDescuento] of productosAfectados) {
            const prod = DB.productos.find(p => String(p.id) === String(productoId));
            if (prod) {
                await supabase.from('productos').update({ stock: prod.stock - cantDescuento }).eq('id', productoId);
                await registrarMovimientoEnNube('Salida POS', productoId, -cantDescuento, `Cuenta Div. ${mesa?.nombre}`);
            }
        }

        for (const parte of partes) {
            try {
                await supabase.from('ventas').insert({
                    folio: parte.folio,
                    items: parte.items?.length > 0
                        ? parte.items.map(i => ({ nombre: i.nombre, cantidad: 1, precio: i.precio }))
                        : [{ nombre: `${parte.nombre} (Fracción de cuenta)`, cantidad: 1, precio: parte.monto }],
                    subtotal: parte.monto, descuento: 0, descuento_monto: 0, propina: 0,
                    total: parte.monto, metodo_pago: parte.metodo, mesa: mesa?.nombre || '',
                    usuario: AppState.user?.nombre || 'Sistema', fecha: new Date().toISOString()
                });
            } catch(_) {}
        }

        await supabase.from('mesas').update({
            estado: 'libre', orden_actual: null, abierta_en: null, usuario: null, total_acumulado: 0
        }).eq('id', mesaId);

        await cargarDatosDeNube();
        window.closeModal();
        showNotification('✅ Cuenta saldada por completo. Mesa liberada.', 'success');

        mesaState.vista = 'mapa';
        mesaState.mesaActiva = null;
        mesaState.orden = [];
        window.render();

    } catch (err) { 
        showNotification('Error al finalizar: ' + err.message, 'error'); 
    }
};

window.dividirCerrarParcial = async () => {
    const pagadas = dividirState.partes.filter(p => p.pagado);
    const pendientes = dividirState.partes.filter(p => !p.pagado);
    const totalPagado = pagadas.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const totalPendiente = pendientes.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);

    try {
        const ordenActual = dividirState.mesa?.orden_actual || {};
        const itemsOriginales = ordenActual.items || dividirState.items || [];
        const nuevaOrden = {
            items: itemsOriginales,
            total: totalPendiente,
            cobro_parcial: { totalOriginal: dividirState.totalOriginal, totalPagado, totalPendiente }
        };

        await supabase.from('mesas').update({ orden_actual: nuevaOrden, total_acumulado: totalPendiente }).eq('id', dividirState.mesaId);
        await cargarDatosDeNube();
        window.closeModal();

        if (String(mesaState.mesaActiva?.id) === String(dividirState.mesaId)) {
            mesaState.mesaActiva = (DB.mesas || []).find(m => String(m.id) === String(dividirState.mesaId));
            if (mesaState.orden.length > 0 && dividirState.modo !== 'platillos') {
                const factor = totalPendiente / dividirState.totalOriginal;
                mesaState.orden.forEach(item => { item.subtotal = parseFloat((item.subtotal * factor).toFixed(2)); });
            }
        }

        showNotification(`Se pausó la división. Queda pendiente: ${formatCurrency(totalPendiente)}`, 'info');
        window.render();

    } catch (err) { 
        showNotification('Error al guardar pausa: ' + err.message, 'error'); 
    }
};

window.dividirImprimirTicketParte = (parte, folio) => {
    const conf = DB.configuracion || {};
    const nombreComercial = conf.nombreEmpresa || conf.nombre_empresa || 'Restaurante';
    const rfc = conf.rfc ? `RFC:${conf.rfc.toUpperCase()}` : '';
    const direccion = conf.direccion || '';
    const telefono = conf.telefono ? `TEL:${conf.telefono}` : '';
    
    const ivaTasa = conf.iva || 0.16;
    const subtotalDesglosado = parte.monto / (1 + ivaTasa);
    const ivaDesglosado = parte.monto - subtotalDesglosado;

    const fecha = new Date();
    const fechaStr = `${fecha.getDate().toString().padStart(2,'0')}/${(fecha.getMonth()+1).toString().padStart(2,'0')}/${fecha.getFullYear()} ${fecha.getHours().toString().padStart(2,'0')}:${fecha.getMinutes().toString().padStart(2,'0')}`;
    const mesaNom = dividirState.mesa?.nombre || 'MOSTRADOR';
    const logoHtml = conf.logo_url ? `<img src="${conf.logo_url}" class="ticket-logo">` : '';
    const letrasTotal = numeroALetras(parte.monto);

    const html = `
        <html><head><style>
            body { font-family:'Courier New',monospace; font-size:13px; width:280px; margin:0 auto; padding:10px 0; line-height: 1.1; }
            .center { text-align:center; } .left { text-align:left; } .bold { font-weight:bold; }
            .line { border-top:1px dashed #000; margin:8px 0; }
            .row { display:flex; justify-content:space-between; margin:4px 0; }
            .ticket-logo { max-width:140px; max-height:90px; margin:0 auto 10px auto; display:block; filter:grayscale(100%); }
            .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:12px; }
            .item-list { width:100%; border-collapse:collapse; margin:8px 0; }
            .item-list td { padding:3px 0; vertical-align:top; }
            .col-desc { width:75%; padding-right:5px; } .col-precio { width:25%; text-align:right; }
            @media print { body { width:100%; } }
        </style></head>
        <body>
            ${logoHtml}
            <div class="center">
                <div class="bold" style="font-size:16px;">${nombreComercial.toUpperCase()}</div>
                ${rfc ? `<div style="margin-top:2px;">${rfc}</div>` : ''}
                ${direccion ? `<div style="margin-top:2px;">${direccion.toUpperCase()}</div>` : ''}
                ${telefono ? `<div>${telefono}</div>` : ''}
            </div>
            <div class="line"></div>
            
            <div class="center bold" style="font-size:15px; margin-bottom:5px; background:#000; color:#fff; padding:4px;">
                CUENTA DIVIDIDA: ${parte.nombre.toUpperCase()}
            </div>
            
            <div class="grid-2">
                <div>MESA:${mesaNom.toUpperCase()}</div>
                <div style="text-align:right;">PAGO:${parte.metodo.toUpperCase().slice(0,3)}</div>
                <div style="grid-column: span 2;">FOLIO:${folio}</div>
                <div style="grid-column: span 2;">${fechaStr}</div>
            </div>
            
            <div class="line"></div>
            
            <table class="item-list">
                ${parte.items?.length > 0
                    ? parte.items.map(i => `<tr><td class="col-desc">1x ${i.nombre.toUpperCase()}</td><td class="col-precio">${formatCurrency(i.precio)}</td></tr>`).join('')
                    : `<tr><td class="col-desc">PAGO PROPORCIONAL DE CUENTA</td><td class="col-precio">${formatCurrency(parte.monto)}</td></tr>`
                }
            </table>
            
            <div class="line"></div>
            <div class="row bold" style="font-size:16px; margin:10px 0;">
                <span style="margin-left:auto; padding-right:20px;">TOTAL PAGADO:</span>
                <span>${formatCurrency(parte.monto)}</span>
            </div>
            <div class="line"></div>
            
            <div class="left" style="margin:10px 0; font-size:11px;"><div>${letrasTotal}</div></div>
            <div class="center" style="margin:10px 0; font-size:12px;">
                <span style="margin-right:15px;">SUBTOTAL:${formatCurrency(subtotalDesglosado)}</span><span>IVA:${formatCurrency(ivaDesglosado)}</span>
            </div>
            
            <div class="center" style="margin-top:15px; font-size:12px; font-weight:bold;">
                <div>ESTE NO ES UN COMPROBANTE FISCAL</div>
                <div style="margin-top:4px;">${conf.mensaje_ticket ? conf.mensaje_ticket.toUpperCase() : '¡GRACIAS POR SU VISITA!'}</div>
            </div>
            <div class="center" style="margin-top:25px; font-size:10px; color:#666;">*** STOCK CENTRAL POS ***</div>
        </body></html>`;

    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 800); }
};