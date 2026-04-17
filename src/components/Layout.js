// src/components/Layout.js
import { AppState, DB } from '../store/state.js';
import { showNotification, formatCurrency } from '../utils/helpers.js';

// ─── RBAC: MATRIZ DE PERMISOS POR ROL ─────────────────────────────────────────
export function obtenerPermisosRolActual() {
    const rol = AppState.user?.rol || 'Mesero';
    switch (rol) {
        case 'Admin':
            return ['dashboard','mesas','pos','compras_crear','entradas_mercancia','ajustes_inventario','productos','recetas','proveedores','reportes','configuracion','perfil'];
        case 'Gerente':
            return ['dashboard','mesas','pos','compras_crear','entradas_mercancia','ajustes_inventario','productos','proveedores','reportes','configuracion','perfil'];
        case 'Cajero':
            return ['mesas','pos','perfil'];
        case 'Mesero':
            return ['mesas','perfil'];
        default:
            return ['perfil'];
    }
}

export function esSoloLectura(pantalla) {
    const rol = AppState.user?.rol || 'Mesero';
    if (rol === 'Gerente' && (pantalla === 'productos' || pantalla === 'configuracion')) return true;
    return false;
}

export function puedeGestionarTurno() {
    const rol = AppState.user?.rol || 'Mesero';
    return ['Admin', 'Gerente', 'Cajero'].includes(rol);
}

export function puedeCobrar() {
    const rol = AppState.user?.rol || 'Mesero';
    return ['Admin', 'Gerente', 'Cajero'].includes(rol);
}

window.irAPantallaDesdeNotif = (pantallaDestino) => {
    window.toggleNotifPanel();
    AppState.currentScreen = pantallaDestino;
    if (window.render) window.render();
};

function getAlertasLeidas() {
    try { return JSON.parse(localStorage.getItem('pos_alertas_leidas') || '[]'); } catch { return []; }
}

window.descartarAlerta = (id) => {
    const leidas = getAlertasLeidas();
    if (!leidas.includes(id)) leidas.push(id);
    try { localStorage.setItem('pos_alertas_leidas', JSON.stringify(leidas)); } catch {}
    const panel = document.getElementById('notifPanel');
    if (panel) panel.classList.add('hidden');
    window.render();
};

window.restablecerAlertas = () => {
    try { localStorage.removeItem('pos_alertas_leidas'); } catch {}
    window.render();
    showNotification && showNotification('Alertas restablecidas', 'success');
};

function generarNotificaciones() {
    const notifs = [];
    const alertasLeidas = getAlertasLeidas();
    const permisosReales = obtenerPermisosRolActual();

    if (permisosReales.includes('productos')) {
        DB.productos.forEach(p => {
            if (p.stock <= p.min && !alertasLeidas.includes(`stock-${p.id}`)) {
                notifs.push({ id:`stock-${p.id}`, tipo:'stock', titulo:'Stock bajo', mensaje:`${p.nombre}: ${p.stock} ${p.unidad} (mín: ${p.min})`, icono:'alert-triangle', color:'text-red-500', bg:'bg-red-50', border:'border-red-100', destino:'productos', accionLabel:'Ver catálogo' });
            }
        });
    }
    if (permisosReales.includes('entradas_mercancia') || permisosReales.includes('compras')) {
        const ocPendientes = DB.ordenesCompra.filter(oc => (oc.estado || '').toLowerCase() === 'pendiente');
        if (ocPendientes.length > 0 && !alertasLeidas.includes('oc-pendientes')) {
            notifs.push({ id:'oc-pendientes', tipo:'compra', titulo:'Órdenes pendientes', mensaje:`${ocPendientes.length} orden${ocPendientes.length>1?'es':''} de compra sin procesar`, icono:'shopping-cart', color:'text-yellow-600', bg:'bg-yellow-50', border:'border-yellow-100', destino:'entradas_mercancia', accionLabel:'Ver órdenes' });
        }
    }
    if (permisosReales.includes('reportes') && DB.ventas && DB.ventas.length > 0) {
        const hace24h = new Date(Date.now() - 24*60*60*1000);
        const ventasRecientes = DB.ventas.filter(v => new Date(v.fecha) > hace24h);
        if (ventasRecientes.length > 0 && !alertasLeidas.includes('ventas-recientes')) {
            const totalVentas = ventasRecientes.reduce((s,v) => s+(v.total||0), 0);
            notifs.push({ id:'ventas-recientes', tipo:'venta', titulo:'Ventas hoy', mensaje:`${ventasRecientes.length} venta${ventasRecientes.length>1?'s':''} · $${totalVentas.toFixed(2)} MXN`, icono:'trending-up', color:'text-green-600', bg:'bg-green-50', border:'border-green-100', destino:'reportes', accionLabel:'Ver reportes' });
        }
    }
    return notifs;
}
window.generarNotificaciones = generarNotificaciones;

export function renderLayout(contenidoPrincipalHTML) {
    const menuGroups = [
        { title: null, items: [
            { id:'dashboard', l:'Dashboard',   i:'layout-dashboard' },
            { id:'mesas',     l:'Mesas',        i:'layout-grid' },
            { id:'pos',       l:'Caja POS',     i:'monitor-smartphone' }
        ]},
        { title: 'Inventario y Compras', items: [
            { id:'compras_crear',      l:'Gestión de Compras',     i:'shopping-cart' },
            { id:'entradas_mercancia', l:'Recepción de Mercancía', i:'download' },
            { id:'ajustes_inventario', l:'Ajustes y Mermas',       i:'clipboard-list' }
        ]},
        { title: 'Catálogos Base', items: [
            { id:'productos',   l:'Ingredientes',    i:'package' },
            { id:'recetas',     l:'Recetas de Menú', i:'chef-hat' },
            { id:'proveedores', l:'Proveedores',     i:'users' }
        ]},
        { title: 'Análisis',  items: [{ id:'reportes',     l:'Reportes y Ventas',     i:'bar-chart-3' }] },
        { title: 'Sistema',   items: [{ id:'configuracion', l:'Configuración global',  i:'settings' }] }
    ];

    const titulosHeader = {
        'dashboard':'Dashboard Principal','pos':'Punto de Venta','mesas':'Gestión de Mesas',
        'compras_crear':'Gestión de Compras','entradas_mercancia':'Recepción de Mercancía',
        'ajustes_inventario':'Ajustes y Mermas','productos':'Catálogo de Ingredientes',
        'recetas':'Recetas del Menú','proveedores':'Directorio de Proveedores',
        'reportes':'Reportes y Analíticas','perfil':'Mi Perfil','configuracion':'Configuración del Sistema'
    };

    const tituloPantallaActual = titulosHeader[AppState.currentScreen] || AppState.currentScreen.replace(/_/g,' ');
    const permisosActivos = obtenerPermisosRolActual();
    const notifs = generarNotificaciones();
    const totalNotif = notifs.length;
    const esMesero = AppState.user?.rol === 'Mesero';

    return `
        <div class="flex h-full bg-gray-50">
            <aside class="bg-[#0f172a] text-slate-300 flex flex-col flex-shrink-0 transition-all z-40 border-r border-slate-800 ${AppState.isSidebarOpen ? 'fixed inset-y-0 left-0 w-64 shadow-2xl' : 'hidden md:flex w-64'}">
                <div class="p-6 flex items-center gap-3 border-b border-slate-800/80">
                    <div class="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl shadow-inner shadow-white/20">
                        <i data-lucide="box" class="text-white w-6 h-6"></i>
                    </div>
                    <span class="font-black text-white text-xl tracking-wide">Stock Central</span>
                </div>

                <nav class="flex-1 px-3 py-4 space-y-5 overflow-y-auto custom-scrollbar">
                    ${menuGroups.map(group => {
                        const allowedItems = group.items.filter(m => permisosActivos.includes(m.id));
                        if (allowedItems.length === 0) return '';
                        return `
                        <div>
                            ${group.title ? `<p class="px-3 mb-2 text-[10px] font-black tracking-widest text-slate-500 uppercase">${group.title}</p>` : ''}
                            <div class="space-y-1">
                                ${allowedItems.map(m => {
                                    const isPos = m.id === 'pos';
                                    const isActive = AppState.currentScreen === m.id;
                                    if (isPos) return `
                                        <button onclick="AppState.currentScreen='${m.id}'; AppState.isSidebarOpen=false; render()"
                                            class="w-full text-left flex items-center justify-between p-3 rounded-xl transition-all font-bold ${isActive ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-800/50 text-orange-400 hover:bg-slate-800 hover:text-orange-300 border border-slate-700'}">
                                            <div class="flex items-center gap-3"><i data-lucide="${m.i}" class="w-5 h-5"></i>${m.l}</div>
                                            <i data-lucide="chevron-right" class="w-4 h-4 opacity-50"></i>
                                        </button>`;
                                    return `
                                    <button onclick="AppState.currentScreen='${m.id}'; AppState.isSidebarOpen=false; render()"
                                        class="w-full text-left flex items-center gap-3 p-2.5 rounded-xl transition-all font-medium text-sm ${isActive ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}">
                                        <i data-lucide="${m.i}" class="w-5 h-5 ${isActive ? 'text-blue-500' : 'text-slate-500'}"></i>
                                        ${m.l}
                                        ${esSoloLectura(m.id) ? '<span class="ml-auto text-[9px] bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">Solo ver</span>' : ''}
                                    </button>`;
                                }).join('')}
                            </div>
                        </div>`;
                    }).join('')}
                </nav>

                <div class="p-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-3">
                    ${AppState.turnoActivo ? `
                    <div class="bg-blue-900/30 border border-blue-800/50 rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <p class="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span> Turno Activo
                            </p>
                            ${!esMesero ? `<p class="text-xs text-slate-300 font-medium mt-0.5">Fondo: ${formatCurrency(AppState.turnoActivo.fondo_inicial)}</p>` : ''}
                        </div>
                        ${puedeGestionarTurno() ? `
                        <button onclick="window.abrirModalCierreTurno()" class="bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white p-2 rounded-lg transition-colors" title="Cerrar Turno">
                            <i data-lucide="lock" class="w-4 h-4"></i>
                        </button>` : ''}
                    </div>` : ''}

                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3 min-w-0 cursor-pointer group" onclick="AppState.currentScreen='perfil'; render()">
                            <img src="${AppState.user.avatar}" class="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-700 group-hover:border-blue-500 transition-colors object-cover" title="Ir a Perfil">
                            <div class="min-w-0">
                                <p class="text-sm font-bold text-slate-200 truncate group-hover:text-blue-400 transition-colors leading-tight">${AppState.user.nombre}</p>
                                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">${AppState.user.rol}</p>
                            </div>
                        </div>
                        <button onclick="window.cerrarSesion()" class="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors" title="Cerrar Sesión">
                            <i data-lucide="power" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            </aside>

            <div onclick="AppState.isSidebarOpen=false; render()" class="fixed inset-0 bg-slate-900/60 z-30 md:hidden backdrop-blur-sm ${AppState.isSidebarOpen ? 'block' : 'hidden'}"></div>

            <main class="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-[#f8fafc]">
                <header class="bg-white border-b border-slate-200 px-6 sm:px-8 py-4 flex items-center justify-between flex-shrink-0 shadow-sm z-20">
                    <div class="flex items-center gap-4">
                        <button onclick="AppState.isSidebarOpen=true; render()" class="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"><i data-lucide="menu"></i></button>
                        <div>
                            <h2 class="font-black text-2xl text-slate-800 capitalize tracking-tight">${tituloPantallaActual}</h2>
                            <p class="text-xs text-slate-400 font-medium hidden sm:block">${(DB.configuracion?.nombre_empresa || DB.configuracion?.nombreEmpresa || 'Stock Central')} • Área de Trabajo</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <button onclick="window.toggleNotifPanel()" id="btnCampana" class="relative p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition-colors">
                                <i data-lucide="bell" class="w-5 h-5"></i>
                                ${totalNotif > 0 ? `<span class="absolute -top-1.5 -right-1.5 bg-red-500 border-2 border-white text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-sm">${totalNotif > 9 ? '9+' : totalNotif}</span>` : ''}
                            </button>
                        </div>
                    </div>
                </header>

                <div class="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 scroll-smooth relative" style="overflow-x:hidden;">
                    <div class="max-h-7xl mx-auto">
                        ${!permisosActivos.includes(AppState.currentScreen) && AppState.currentScreen !== 'perfil' ? `
                            <div class="text-center py-20 animate-fade-in">
                                <i data-lucide="shield-alert" class="w-16 h-16 mx-auto mb-4 text-red-400 opacity-50"></i>
                                <h2 class="text-2xl font-black text-slate-800">Acceso Restringido</h2>
                                <p class="text-slate-500 mt-2">Tu rol (${AppState.user.rol}) no tiene permisos para ver este módulo.</p>
                                <button onclick="AppState.currentScreen='perfil'; render()" class="mt-6 px-6 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 transition-colors">Volver a Mi Perfil</button>
                            </div>
                        ` : contenidoPrincipalHTML}
                    </div>
                </div>
            </main>
        </div>
    `;
}

window.toggleNotifPanel = () => {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        setTimeout(() => {
            document.addEventListener('click', function cerrar(e) {
                if (!panel.contains(e.target) && e.target.id !== 'btnCampana' && !e.target.closest('#btnCampana')) {
                    panel.classList.add('hidden');
                }
                document.removeEventListener('click', cerrar);
            });
        }, 100);
    }
};