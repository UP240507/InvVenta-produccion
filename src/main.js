// src/main.js
import { AppState, DB, cargarDatosDeNube } from './store/state.js';
import { showNotification, SPINNER_ICON, formatCurrency, abrirModalConfirmacion } from './utils/helpers.js';
import { supabase } from './api/supabase.js';
import { renderLayout, obtenerPermisosRolActual, puedeGestionarTurno } from './components/Layout.js';
import { renderLogin } from './components/Login.js';
import { renderDashboard } from './components/Dashboard.js';
import { renderProductos } from './components/Products.js';
import { renderProveedores } from './components/Proveedores.js';
import { renderOrdenCompraForm, renderEntradasMercancia } from './components/Compras.js';
import { renderAjustesInventario } from './components/Ajustes.js';
import { renderRecetas } from './components/Recetas.js';
import { renderReportes } from './components/Reportes.js';
import { renderConfiguracion } from './components/Configuracion.js';
import { renderPerfil } from './components/Perfil.js';
import { renderPos } from './components/Pos.js';
import { renderMesas } from './components/Mesas.js';
import { renderFacturacion, abrirModalFactura } from './components/Facturacion.js';
import { mountPrinterWidget } from './components/PrinterStatus.js';
import './services/thermalPrinter.js';

window.AppState = AppState;
window.DB = DB;
window.abrirModalFactura = abrirModalFactura;

window.openModal = function(content) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
        <div class="modal-backdrop fixed inset-0 bg-black bg-opacity-50 z-[90] flex items-center justify-center p-4" onclick="if(event.target===this) closeModal()">
            <div class="modal-content bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                ${content}
            </div>
        </div>`;
    if (window.lucide) lucide.createIcons();
};

window.closeModal = function() {
    document.getElementById('modal-root').innerHTML = '';
};

// ─── Ruta inicial según rol ───────────────────────────────────────────────────
function irAPrimeraPantallaPermitida() {
    const permisos = obtenerPermisosRolActual();
    if (permisos.includes('dashboard'))  { AppState.currentScreen = 'dashboard'; return; }
    if (permisos.includes('mesas'))      { AppState.currentScreen = 'mesas';     return; }
    if (permisos.includes('pos'))        { AppState.currentScreen = 'pos';       return; }
    AppState.currentScreen = 'perfil';
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
window.handleLogin = async (e) => {
    if (e) e.preventDefault();

    const btn = document.getElementById('btn-login');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Accediendo...'; }

    const username = (document.getElementById('login-u')?.value || '').trim().toLowerCase();
    const password = (document.getElementById('login-p')?.value || '').trim();

    if (!username || !password) {
        showNotification('Ingresa tu usuario y contraseña', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
        return;
    }

    const email = `${username}@stockcentral.com`;

    try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw new Error('Usuario o contraseña incorrectos');

        const { data: userData, error: userError } = await supabase
            .from('usuarios').select('*').eq('username', username).single();
        if (userError || !userData) throw new Error('El usuario no tiene un perfil asignado en el sistema');

        AppState.user = userData;
        irAPrimeraPantallaPermitida();
        window.render();
        showNotification(`¡Bienvenido, ${userData.nombre}!`, 'success');

    } catch (err) {
        showNotification(err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
        if (window.lucide) window.lucide.createIcons();
    }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
window.cerrarSesion = async () => {
    abrirModalConfirmacion('Cerrar Sesión', '¿Seguro que deseas salir del sistema?', async () => {
        await supabase.auth.signOut();
        AppState.user = null;
        AppState.turnoActivo = null;
        window.render();
    });
};

// ─── ABRIR TURNO ──────────────────────────────────────────────────────────────
window.iniciarTurno = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnAbrirTurno');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = SPINNER_ICON + ' Abriendo Caja...';

    const fondo = parseFloat(e.target.fondo_inicial.value) || 0;

    try {
        const { data, error } = await supabase.from('turnos').insert({
            usuario: AppState.user.nombre,
            fondo_inicial: fondo,
            estado: 'abierto',
            fecha_apertura: new Date().toISOString()
        }).select();

        if (error) throw error;

        if (data && data.length > 0) {
            AppState.turnoActivo = data[0];
            if (!DB.turnos) DB.turnos = [];
            DB.turnos.unshift(data[0]);
        }

        cargarDatosDeNube();
        showNotification('Turno abierto con éxito. ¡Buen turno!', 'success');
        window.render();
    } catch (err) {
        showNotification('Error al abrir turno: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        if (window.lucide) window.lucide.createIcons();
    }
};

// ─── CERRAR TURNO (CORTE Z) ───────────────────────────────────────────────────
window.abrirModalCierreTurno = () => {
    if (!AppState.turnoActivo) return showNotification('No hay un turno abierto', 'error');

    const turno = AppState.turnoActivo;
    const ventasTurno = DB.ventas.filter(v => new Date(v.fecha) >= new Date(turno.fecha_apertura));

    const totalVentas = ventasTurno.reduce((s, v) => s + (v.total || 0), 0);
    const totalEfectivoVentas = ventasTurno.reduce((s, v) => s + (v.metodo_pago === 'efectivo' ? v.total : (v.metodo_pago === 'mixto' ? (v.efectivo || 0) : 0)), 0);
    const totalTarjeta = ventasTurno.reduce((s, v) => s + (v.metodo_pago === 'tarjeta' ? v.total : (v.metodo_pago === 'mixto' ? (v.tarjeta || 0) : 0)), 0);
    const efectivoEsperado = turno.fondo_inicial + totalEfectivoVentas;

    const billetes = [1000, 500, 200, 100, 50, 20];
    const monedas = [10, 5, 2, 1, 0.5];

    window.openModal(`
        <div class="p-6 sm:p-8">
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-red-100 p-2 rounded-lg"><i data-lucide="lock" class="text-red-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Corte Z - Arqueo de Caja</h2>
            </div>
            <p class="text-slate-500 mb-6 text-sm">Cuenta el dinero físico en la gaveta. Ingresa la cantidad de billetes y monedas.</p>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><i data-lucide="calculator" class="w-4 h-4"></i> Calculadora Rápida</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Billetes</p>
                            <div class="space-y-2">
                                ${billetes.map(d => `
                                    <div class="flex items-center gap-2">
                                        <span class="w-12 text-right text-xs font-bold text-slate-600">$${d}</span>
                                        <span class="text-slate-400 text-xs">x</span>
                                        <input type="number" min="0" id="denom_${d}" oninput="window.calcularArqueo()" class="w-full border border-slate-300 p-1.5 rounded-lg text-center font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-400" placeholder="0">
                                    </div>`).join('')}
                            </div>
                        </div>
                        <div>
                            <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Monedas</p>
                            <div class="space-y-2">
                                ${monedas.map(d => `
                                    <div class="flex items-center gap-2">
                                        <span class="w-12 text-right text-xs font-bold text-slate-600">$${d}</span>
                                        <span class="text-slate-400 text-xs">x</span>
                                        <input type="number" min="0" id="denom_${d === 0.5 ? '05' : d}" oninput="window.calcularArqueo()" class="w-full border border-slate-300 p-1.5 rounded-lg text-center font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-400" placeholder="0">
                                    </div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col">
                    <div class="bg-white rounded-xl p-5 mb-6 border border-slate-200 shadow-sm space-y-3 text-sm flex-1">
                        <div class="flex justify-between text-slate-600"><span>Fondo Inicial:</span><span class="font-bold">${formatCurrency(turno.fondo_inicial)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Ventas en Efectivo:</span><span class="font-bold text-green-600">+${formatCurrency(totalEfectivoVentas)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Vouchers (Tarjeta):</span><span class="font-bold text-blue-600">${formatCurrency(totalTarjeta)}</span></div>
                        <div class="flex justify-between text-slate-800 border-t border-slate-200 pt-3 mt-3">
                            <span class="font-black uppercase tracking-widest text-xs mt-1">Efectivo Esperado:</span>
                            <span class="font-black text-slate-400 text-xl">${formatCurrency(efectivoEsperado)}</span>
                        </div>
                    </div>
                    <form onsubmit="window.confirmarCierreTurno(event, ${totalVentas}, ${efectivoEsperado})" class="mt-auto">
                        <div class="mb-5">
                            <label class="block text-xs font-bold text-blue-600 uppercase tracking-widest mb-2 text-center">Total Contado (Efectivo Físico)</label>
                            <div class="relative w-full">
                                <span class="absolute left-4 top-3.5 text-slate-400 font-bold text-xl">$</span>
                                <input type="number" id="inputEfectivoReal" name="efectivo_declarado" min="0" step="0.01" required placeholder="0.00"
                                    class="w-full border-2 border-blue-200 py-4 pl-8 pr-4 rounded-xl focus:ring-2 focus:border-blue-500 focus:ring-blue-200 outline-none text-3xl font-black text-blue-700 transition-all bg-white shadow-sm text-center">
                            </div>
                        </div>
                        <div class="flex gap-3">
                            <button type="button" onclick="window.closeModal()" class="flex-1 border-2 border-slate-200 py-3.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                            <button type="submit" id="btnCerrarTurnoFinal" class="flex-[2] bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-xl font-black text-lg shadow-lg shadow-red-600/30 transition-transform active:scale-95 flex items-center justify-center gap-2">
                                <i data-lucide="lock" class="w-5 h-5"></i> Cierre Definitivo
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `);
};

window.calcularArqueo = () => {
    const denoms = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];
    let total = 0;
    denoms.forEach(d => {
        const id = d === 0.5 ? '05' : d;
        const qty = parseInt(document.getElementById(`denom_${id}`)?.value) || 0;
        total += qty * d;
    });
    const inputTotal = document.getElementById('inputEfectivoReal');
    if (inputTotal) inputTotal.value = total > 0 ? total.toFixed(2) : '';
};

window.confirmarCierreTurno = async (e, totalVentas, efectivoEsperado) => {
    e.preventDefault();
    const btn = document.getElementById('btnCerrarTurnoFinal');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = SPINNER_ICON + ' Cerrando...';

    const efectivoDeclarado = parseFloat(e.target.efectivo_declarado.value) || 0;
    const diferencia = efectivoDeclarado - efectivoEsperado;
    const turnoActual = AppState.turnoActivo;

    try {
        const { error } = await supabase.from('turnos').update({
            estado: 'cerrado',
            fecha_cierre: new Date().toISOString(),
            ventas_totales: totalVentas,
            efectivo_esperado: efectivoEsperado,
            efectivo_declarado: efectivoDeclarado,
            diferencia
        }).eq('id', turnoActual.id);

        if (error) throw error;

        const empresa = DB.configuracion?.nombreEmpresa || DB.configuracion?.nombre_empresa || 'Stock Central';
        const logoHtml = DB.configuracion?.logo_url ? `<img src="${DB.configuracion.logo_url}" class="ticket-logo">` : '';
        const ventasTurno = DB.ventas.filter(v => new Date(v.fecha) >= new Date(turnoActual.fecha_apertura));
        const efectivoVentas = ventasTurno.reduce((s, v) => s + (v.metodo_pago === 'efectivo' ? v.total : (v.metodo_pago === 'mixto' ? (v.efectivo || 0) : 0)), 0);
        const tarjetaVentas = ventasTurno.reduce((s, v) => s + (v.metodo_pago === 'tarjeta' ? v.total : (v.metodo_pago === 'mixto' ? (v.tarjeta || 0) : 0)), 0);
        const propinasT = ventasTurno.reduce((s, v) => s + (v.propina || 0), 0);

        const ticketCorteHTML = `
            <html><head><title>Corte Z</title>
            <style>
            body{font-family:'Courier New',monospace;font-size:12px;width:280px;margin:0 auto;padding:10px;color:#000;line-height:1.2}
            .center{text-align:center}.bold{font-weight:bold}.text-sm{font-size:10px}
            .line{border-top:1px dashed #000;margin:8px 0}
            .row{display:flex;justify-content:space-between;margin:4px 0}
            .ticket-logo{max-width:140px;max-height:80px;margin:0 auto 10px auto;display:block;filter:grayscale(100%)}
            @media print{body{width:100%}}
            </style></head><body>
            ${logoHtml}
            <div class="center bold" style="font-size:16px;text-transform:uppercase;">${empresa}</div>
            <div class="center bold" style="font-size:18px;margin-top:5px;">*** CORTE Z ***</div>
            <div class="center text-sm">Cajero: ${turnoActual.usuario.toUpperCase()}</div>
            <div class="center text-sm">Apertura: ${new Date(turnoActual.fecha_apertura).toLocaleString('es-MX')}</div>
            <div class="center text-sm">Cierre: ${new Date().toLocaleString('es-MX')}</div>
            <div class="line"></div>
            <div class="center bold" style="margin-bottom:5px;">RESUMEN DE VENTAS</div>
            <div class="row"><span>Total Tickets:</span><span>${ventasTurno.length}</span></div>
            <div class="row bold" style="font-size:14px;margin-top:5px;"><span>VENTA TOTAL:</span><span>${formatCurrency(totalVentas)}</span></div>
            <div class="row text-sm"><span>En Efectivo:</span><span>${formatCurrency(efectivoVentas)}</span></div>
            <div class="row text-sm"><span>En Tarjeta:</span><span>${formatCurrency(tarjetaVentas)}</span></div>
            <div class="row text-sm"><span>Propinas:</span><span>${formatCurrency(propinasT)}</span></div>
            <div class="line"></div>
            <div class="center bold" style="margin-bottom:5px;">ARQUEO DE GAVETA</div>
            <div class="row"><span>Fondo Inicial:</span><span>${formatCurrency(turnoActual.fondo_inicial)}</span></div>
            <div class="row"><span>Efectivo Ventas:</span><span>+${formatCurrency(efectivoVentas)}</span></div>
            <div class="row bold" style="margin-top:5px;"><span>DEBE HABER:</span><span>${formatCurrency(efectivoEsperado)}</span></div>
            <div class="row"><span>REPORTADO:</span><span>${formatCurrency(efectivoDeclarado)}</span></div>
            <div class="line"></div>
            <div class="row bold" style="font-size:14px;">
                <span>${Math.abs(diferencia) < 0.1 ? 'CUADRE PERFECTO' : (diferencia > 0 ? 'SOBRANTE:' : 'FALTANTE:')}</span>
                <span>${Math.abs(diferencia) < 0.1 ? '✓' : formatCurrency(Math.abs(diferencia))}</span>
            </div>
            <div class="center" style="margin-top:40px;font-size:10px;">_________________________<br><br>Firma Cajero</div>
            <div class="center" style="margin-top:30px;font-size:10px;">_________________________<br><br>Firma Gerencia / Auditor</div>
            </body></html>`;

        const win = window.open('', '_blank', 'width=320,height=600');
        if (win) { win.document.write(ticketCorteHTML); win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 800); }

        AppState.turnoActivo = null;
        cargarDatosDeNube();
        window.closeModal();

        let msg = 'Turno cerrado. ';
        if (diferencia > 0.5) msg += `Sobra ${formatCurrency(diferencia)} en caja.`;
        else if (diferencia < -0.5) msg += `Faltan ${formatCurrency(Math.abs(diferencia))} en caja.`;
        else msg += 'Caja cuadrada perfectamente.';

        showNotification(msg, diferencia < -0.5 ? 'error' : 'success');
        if (['pos', 'mesas'].includes(AppState.currentScreen)) AppState.currentScreen = 'dashboard';
        window.render();
    } catch (err) {
        showNotification('Error al cerrar turno: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        if (window.lucide) window.lucide.createIcons();
    }
};

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────────
window.render = function() {
    const root = document.getElementById('root');

    if (!AppState.user) {
        root.innerHTML = renderLogin();
        if (window.lucide) lucide.createIcons();
        const loginForm = document.getElementById('form-login');
        if (loginForm) loginForm.addEventListener('submit', window.handleLogin);
        return;
    }

    let contenidoHTML = '';
    const requiereTurno = ['pos', 'mesas'].includes(AppState.currentScreen);

    if (requiereTurno && !AppState.turnoActivo) {
        if (puedeGestionarTurno()) {
            // Admin / Gerente / Cajero: pueden abrir el turno
            contenidoHTML = `
                <div class="flex items-center justify-center h-full animate-fade-in pb-20">
                    <div class="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full text-center">
                        <div class="bg-blue-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <i data-lucide="lock" class="w-12 h-12 text-blue-600"></i>
                        </div>
                        <h2 class="text-3xl font-black text-slate-800 mb-2 tracking-tight">Caja Cerrada</h2>
                        <p class="text-slate-500 mb-8 text-sm">Para empezar a registrar ventas, declara el fondo de caja.</p>
                        <form onsubmit="window.iniciarTurno(event)" class="space-y-6 text-left">
                            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">Efectivo inicial (Morralla)</label>
                                <div class="relative w-3/4 mx-auto">
                                    <span class="absolute left-4 top-3 text-slate-400 font-bold text-xl">$</span>
                                    <input type="number" name="fondo_inicial" min="0" step="0.5" required placeholder="0.00"
                                        class="w-full border-2 border-slate-300 py-3 pl-8 pr-4 rounded-xl focus:ring-2 focus:border-blue-500 focus:ring-blue-200 outline-none text-2xl font-black text-slate-800 text-center transition-all bg-white shadow-sm">
                                </div>
                            </div>
                            <button type="submit" id="btnAbrirTurno" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-black text-lg shadow-lg shadow-blue-600/30 transition-transform active:scale-95 flex items-center justify-center gap-2">
                                <i data-lucide="key" class="w-5 h-5"></i> Abrir Caja y Comenzar
                            </button>
                        </form>
                    </div>
                </div>`;
        } else {
            // Mesero: no puede abrir turno, solo esperar
            contenidoHTML = `
                <div class="flex items-center justify-center h-full animate-fade-in pb-20">
                    <div class="bg-white p-10 rounded-3xl shadow-xl border border-slate-200 max-w-sm w-full text-center">
                        <div class="bg-amber-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <i data-lucide="clock" class="w-12 h-12 text-amber-500 animate-pulse"></i>
                        </div>
                        <h2 class="text-2xl font-black text-slate-800 mb-2">Turno no iniciado</h2>
                        <p class="text-slate-500 text-sm mt-2 leading-relaxed">
                            El turno aún no ha sido abierto.<br>
                            Espera a que el <span class="font-bold text-slate-700">Cajero o Gerente</span> abra la caja para comenzar a atender mesas.
                        </p>
                        <button onclick="window.render()" class="mt-8 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm transition-colors flex items-center gap-2 mx-auto">
                            <i data-lucide="refresh-cw" class="w-4 h-4"></i> Verificar de nuevo
                        </button>
                    </div>
                </div>`;
        }
    } else {
        switch (AppState.currentScreen) {
            case 'dashboard':           contenidoHTML = renderDashboard();           break;
            case 'productos':           contenidoHTML = renderProductos();           break;
            case 'proveedores':         contenidoHTML = renderProveedores();         break;
            case 'compras_crear':       contenidoHTML = renderOrdenCompraForm();     break;
            case 'entradas_mercancia':  contenidoHTML = renderEntradasMercancia();   break;
            case 'ajustes_inventario':  contenidoHTML = renderAjustesInventario();   break;
            case 'recetas':             contenidoHTML = renderRecetas();             break;
            case 'reportes':            contenidoHTML = renderReportes();            break;
            case 'configuracion':       contenidoHTML = renderConfiguracion();       break;
            case 'perfil':              contenidoHTML = renderPerfil();              break;
            case 'mesas':               contenidoHTML = renderMesas();               break;
            case 'pos':                 contenidoHTML = renderPos();                 break;
            case 'facturas':            contenidoHTML = renderFacturacion();         break;
            default: contenidoHTML = '<div class="text-center py-20 text-gray-400">Pantalla en construcción...</div>';
        }
    }

    root.innerHTML = renderLayout(contenidoHTML);
    if (window.lucide) lucide.createIcons();
    mountPrinterWidget();

    if (AppState.currentScreen === 'dashboard') {
        setTimeout(() => {
            if (typeof window.renderGraficoCategorias === 'function') window.renderGraficoCategorias();
        }, 50);
    }
};

// ─── ARRANQUE ─────────────────────────────────────────────────────────────────
async function iniciarApp() {
    // 1. PRIMERO cargamos la base de datos (Nube o Dexie)
    await cargarDatosDeNube();

    // 2. AHORA verificamos la sesión guardada en el navegador
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session && session.user && session.user.email) {
            // Extraemos el ID y lo forzamos a minúsculas
            const username = session.user.email.split('@')[0].toLowerCase().trim();
            
            // Búsqueda a prueba de balas (Ignora mayúsculas y minúsculas)
            const userData = DB.usuarios.find(u => (u.username || '').toLowerCase().trim() === username);
                
            if (userData) {
                AppState.user = userData;

                const turnoAbierto = (DB.turnos || []).find(turno =>
                    turno &&
                    turno.estado === 'abierto' &&
                    (turno.usuario || '').toLowerCase().trim() === (AppState.user.nombre || '').toLowerCase().trim()
                );

                AppState.turnoActivo = turnoAbierto || null;
            } else {
                console.warn(`🚨 Sesión activa para '${username}', pero no se encontró en Dexie.`);
                console.warn(`📦 Usuarios guardados en el modo Offline:`, DB.usuarios);
            }
        }
    } catch (error) { 
        console.error("Error al restaurar la sesión:", error); 
    }

    // 3. Enrutamos y dibujamos
    if (AppState.user && (!AppState.currentScreen || AppState.currentScreen === 'login')) {
        irAPrimeraPantallaPermitida(); 
    }

    window.render();
}

iniciarApp();
// ─── LECTOR DE CÓDIGOS DE BARRAS ──────────────────────────────────────────────
let barcodeBuffer = '';
let barcodeTimer = null;

window.procesarCodigoEscaneado = (codigo) => {
    if (AppState.currentScreen === 'mesas') { window.mesaScanner(codigo); return; }
    if (AppState.currentScreen === 'pos') {
        const receta = DB.recetas.find(r => (r.codigo_pos || '').toLowerCase() === codigo.toLowerCase());
        if (receta) { window.posAgregarReceta(receta.id); showNotification(`✅ ${receta.nombre} agregado`, 'success'); }
        else showNotification(`⚠️ Código POS no encontrado: ${codigo}`, 'error');
        return;
    }
    const prod = DB.productos.find(p => p.codigo.toLowerCase() === codigo.toLowerCase());
    if (!prod) return showNotification('⚠️ Código no encontrado: ' + codigo, 'error');
    if (AppState.currentScreen === 'compras_crear' && AppState.tempData.proveedor) {
        const ex = AppState.cart.find(x => x.productoId === prod.id);
        if (ex) ex.cant += 1;
        else AppState.cart.push({ productoId: prod.id, nombre: prod.nombre, precio: prod.precio, cant: 1 });
        window.render();
        showNotification(`🛒 +1 ${prod.nombre} agregado`, 'success');
    } else if (AppState.currentScreen === 'productos') {
        const searchInput = document.getElementById('txtSearch');
        if (searchInput) { searchInput.value = prod.codigo; AppState.searchTerm = prod.codigo; window.actualizarTablaProductos(); showNotification(`🔍 Producto filtrado`, 'success'); }
    } else {
        showNotification(`🏷️ Producto escaneado: ${prod.nombre}`, 'info');
    }
};

document.addEventListener('keydown', (e) => {
    if (!e || !e.key) return;
    const tag = document.activeElement?.tagName;
    const isEditable = document.activeElement?.isContentEditable;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isEditable) return;
    if (barcodeTimer) clearTimeout(barcodeTimer);
    if (e.key === 'Enter') {
        if (barcodeBuffer.length > 2) { e.preventDefault(); window.procesarCodigoEscaneado(barcodeBuffer); }
        barcodeBuffer = '';
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        barcodeBuffer += e.key;
    }
    barcodeTimer = setTimeout(() => { barcodeBuffer = ''; }, 150);
});