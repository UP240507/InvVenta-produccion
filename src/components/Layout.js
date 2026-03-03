// src/components/Layout.js
import { AppState, DB } from '../store/state.js';
import { showNotification } from '../utils/helpers.js';

const ROLES = {
    'Admin':   ['dashboard', 'mesas', 'compras_crear', 'entradas_mercancia', 'ajustes_inventario', 'productos', 'proveedores', 'recetas', 'reportes', 'configuracion', 'perfil', 'pos'],
    'Gerente': ['dashboard', 'mesas', 'compras_crear', 'entradas_mercancia', 'ajustes_inventario', 'productos', 'proveedores', 'reportes', 'perfil', 'pos'],
    'Cajero':  ['mesas', 'pos', 'perfil']
};

// ─── Alertas ya leídas/descartadas por el usuario ───────────────────────────
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

// ─── Generar notificaciones desde el estado actual de DB ─────────────────────
function generarNotificaciones() {
    const notifs = [];
    const alertasLeidas = getAlertasLeidas();
    const rol = AppState.user?.rol || 'Cajero';
    const permisos = ROLES[rol] || ROLES['Cajero'];

    // 1. Stock bajo — solo roles con acceso al catálogo de ingredientes
    if (permisos.includes('productos')) {
        DB.productos.forEach(p => {
            if (p.stock <= p.min && !alertasLeidas.includes(`stock-${p.id}`)) {
                notifs.push({
                    id: `stock-${p.id}`,
                    tipo: 'stock',
                    titulo: 'Stock bajo',
                    mensaje: `${p.nombre}: ${p.stock} ${p.unidad} (mín: ${p.min})`,
                    icono: 'alert-triangle',
                    color: 'text-red-500',
                    bg: 'bg-red-50',
                    border: 'border-red-100',
                    accion: () => { AppState.currentScreen = 'productos'; window.render(); },
                    accionLabel: 'Ver catálogo'
                });
            }
        });
    }

    // 2. OC pendientes — solo roles con acceso a recepción de mercancía
    if (permisos.includes('entradas_mercancia')) {
        const ocPendientes = DB.ordenesCompra.filter(oc => (oc.estado || '').toLowerCase() === 'pendiente');
        if (ocPendientes.length > 0 && !alertasLeidas.includes('oc-pendientes')) {
            notifs.push({
                id: 'oc-pendientes',
                tipo: 'compra',
                titulo: 'Órdenes pendientes',
                mensaje: `${ocPendientes.length} orden${ocPendientes.length > 1 ? 'es' : ''} de compra sin procesar`,
                icono: 'shopping-cart',
                color: 'text-yellow-600',
                bg: 'bg-yellow-50',
                border: 'border-yellow-100',
                accion: () => { AppState.currentScreen = 'entradas_mercancia'; window.render(); },
                accionLabel: 'Ver órdenes'
            });
        }
    }

    // 3. Ventas del día — solo roles con acceso a reportes
    if (permisos.includes('reportes') && DB.ventas && DB.ventas.length > 0) {
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const ventasRecientes = DB.ventas.filter(v => new Date(v.fecha) > hace24h);
        if (ventasRecientes.length > 0 && !alertasLeidas.includes('ventas-recientes')) {
            const totalVentas = ventasRecientes.reduce((s, v) => s + (v.total || 0), 0);
            notifs.push({
                id: 'ventas-recientes',
                tipo: 'venta',
                titulo: 'Ventas hoy',
                mensaje: `${ventasRecientes.length} venta${ventasRecientes.length > 1 ? 's' : ''} · $${totalVentas.toFixed(2)} MXN`,
                icono: 'trending-up',
                color: 'text-green-600',
                bg: 'bg-green-50',
                border: 'border-green-100',
                accion: () => { AppState.currentScreen = 'reportes'; window.render(); },
                accionLabel: 'Ver reportes'
            });
        }
    }

    return notifs;
}
window.generarNotificaciones = generarNotificaciones;

export function renderLayout(contenidoPrincipalHTML) {
    // ─── GRUPOS DEL MENÚ LATERAL ───────────────────────────────────────
    const menuGroups = [
        {
            title: null,
            items: [
                {id:'dashboard', l:'Dashboard', i:'layout-dashboard'},
                {id:'mesas', l:'Mesas', i:'layout-grid'},
                {id:'pos', l:'Caja POS', i:'monitor-smartphone'}
            ]
        },
        {
            title: 'Inventario y Compras',
            items: [
                {id:'compras_crear', l:'Gestión de Compras', i:'shopping-cart'},
                {id:'entradas_mercancia', l:'Recepción de Mercancía', i:'download'},
                {id:'ajustes_inventario', l:'Ajustes y Mermas', i:'clipboard-list'}
            ]
        },
        {
            title: 'Catálogos Base',
            items: [
                {id:'productos', l:'Ingredientes', i:'package'},
                {id:'recetas', l:'Recetas de Menú', i:'chef-hat'},
                {id:'proveedores', l:'Proveedores', i:'users'}
            ]
        },
        {
            title: 'Análisis',
            items: [
                {id:'reportes', l:'Reportes y Ventas', i:'bar-chart-3'}
            ]
        },
        {
            title: 'Sistema',
            items: [
                {id:'configuracion', l:'Configuración global', i:'settings'},
            ]
        }
    ];

    // ─── TRADUCTOR DE TÍTULOS PARA LA BARRA SUPERIOR ────────────────────
    const titulosHeader = {
        'dashboard': 'Dashboard Principal',
        'pos': 'Punto de Venta',
        'mesas': 'Gestión de Mesas',
        'compras_crear': 'Gestión de Compras',
        'entradas_mercancia': 'Recepción de Mercancía',
        'ajustes_inventario': 'Ajustes y Mermas de Inventario',
        'productos': 'Catálogo de Ingredientes',
        'recetas': 'Recetas del Menú',
        'proveedores': 'Directorio de Proveedores',
        'reportes': 'Reportes y Analíticas',
        'perfil': 'Mi Perfil',
        'configuracion': 'Configuración del Sistema'
    };
    
    // Si la pantalla no está en el diccionario, usa el nombre normal
    const tituloPantallaActual = titulosHeader[AppState.currentScreen] || AppState.currentScreen.replace(/_/g, ' ');

    const esAdmin = AppState.user.rol === 'Admin';
    const notifs = generarNotificaciones();
    const totalNotif = notifs.length;

    const stockBajos = notifs.filter(n => n.tipo === 'stock');
    const ocPendientes = notifs.filter(n => n.tipo === 'compra');
    const ventasHoy = notifs.filter(n => n.tipo === 'venta');

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
                        const allowedItems = group.items.filter(m => (ROLES[AppState.user.rol] || ROLES['Cajero']).includes(m.id));
                        if (allowedItems.length === 0) return ''; 

                        return `
                        <div>
                            ${group.title ? `<p class="px-3 mb-2 text-[10px] font-black tracking-widest text-slate-500 uppercase">${group.title}</p>` : ''}
                            <div class="space-y-1">
                                ${allowedItems.map(m => {
                                    const isPos = m.id === 'pos';
                                    const isActive = AppState.currentScreen === m.id;
                                    
                                    if (isPos) {
                                        return `
                                        <button onclick="AppState.currentScreen='${m.id}'; AppState.isSidebarOpen=false; render()"
                                            class="w-full text-left flex items-center justify-between p-3 rounded-xl transition-all font-bold ${isActive ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30' : 'bg-slate-800/50 text-orange-400 hover:bg-slate-800 hover:text-orange-300 border border-slate-700'}">
                                            <div class="flex items-center gap-3">
                                                <i data-lucide="${m.i}" class="w-5 h-5"></i>
                                                ${m.l}
                                            </div>
                                            <i data-lucide="chevron-right" class="w-4 h-4 opacity-50"></i>
                                        </button>`;
                                    }

                                    return `
                                    <button onclick="AppState.currentScreen='${m.id}'; AppState.isSidebarOpen=false; render()"
                                        class="w-full text-left flex items-center gap-3 p-2.5 rounded-xl transition-all font-medium text-sm ${isActive ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}">
                                        <i data-lucide="${m.i}" class="w-5 h-5 ${isActive ? 'text-blue-500' : 'text-slate-500'}"></i>
                                        ${m.l}
                                    </button>`;
                                }).join('')}
                            </div>
                        </div>
                        `
                    }).join('')}

                    ${totalNotif > 0 ? `
                    <div class="mt-6 pt-4 border-t border-slate-800/50">
                        <p class="text-xs font-bold text-slate-500 uppercase px-3 mb-3 flex items-center gap-2">
                            <i data-lucide="bell" class="w-3 h-3"></i>
                            Alertas Activas
                            <span class="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-auto">${totalNotif}</span>
                        </p>

                        ${stockBajos.length > 0 ? `
                        <div class="mx-1 mb-2 bg-red-950/20 border border-red-900/30 rounded-xl p-3">
                            <p class="text-[11px] font-bold text-red-400 flex items-center gap-1.5 mb-1.5">
                                <i data-lucide="alert-triangle" class="w-3 h-3"></i> Stock bajo (${stockBajos.length})
                            </p>
                            ${stockBajos.slice(0, 3).map(n => `<p class="text-[10px] text-slate-400 truncate pl-4 mb-0.5">· ${n.mensaje}</p>`).join('')}
                            <button onclick="AppState.currentScreen='productos'; render()" class="mt-1.5 text-[10px] text-red-400 hover:text-red-300 font-bold pl-4">Revisar catálogo →</button>
                        </div>` : ''}

                        ${ocPendientes.length > 0 ? `
                        <div class="mx-1 mb-2 bg-yellow-950/20 border border-yellow-900/30 rounded-xl p-3">
                            <p class="text-[11px] font-bold text-yellow-500 flex items-center gap-1.5 mb-1">
                                <i data-lucide="shopping-cart" class="w-3 h-3"></i> ${ocPendientes[0].mensaje}
                            </p>
                            <button onclick="AppState.currentScreen='entradas_mercancia'; render()" class="text-[10px] text-yellow-500 hover:text-yellow-400 font-bold pl-4 mt-1">Ver ingresos →</button>
                        </div>` : ''}
                    </div>` : ''}
                </nav>

                <div class="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
                    <div class="flex items-center gap-3 min-w-0 cursor-pointer group" onclick="AppState.currentScreen='perfil'; render()">
                        <img src="${AppState.user.avatar}" class="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-700 group-hover:border-blue-500 transition-colors object-cover" title="Ir a Perfil">
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-slate-200 truncate group-hover:text-blue-400 transition-colors leading-tight">${AppState.user.nombre}</p>
                            <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">${AppState.user.rol}</p>
                        </div>
                    </div>
                    <button onclick="if(confirm('¿Seguro que deseas salir del sistema?')){ AppState.user=null; render(); }" class="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors" title="Cerrar Sesión">
                        <i data-lucide="power" class="w-5 h-5"></i>
                    </button>
                </div>
            </aside>

            <div onclick="AppState.isSidebarOpen=false; render()" class="fixed inset-0 bg-slate-900/60 z-30 md:hidden backdrop-blur-sm ${AppState.isSidebarOpen?'block':'hidden'}"></div>

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
                            <button onclick="window.toggleNotifPanel()" id="btnCampana"
                                class="relative p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 transition-colors">
                                <i data-lucide="bell" class="w-5 h-5"></i>
                                ${totalNotif > 0 ? `
                                <span class="absolute -top-1.5 -right-1.5 bg-red-500 border-2 border-white text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                                    ${totalNotif > 9 ? '9+' : totalNotif}
                                </span>` : ''}
                            </button>

                            <div id="notifPanel" class="hidden absolute right-0 top-14 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden origin-top-right animate-fade-in">
                                <div class="bg-slate-50 px-5 py-4 flex items-center justify-between border-b">
                                    <h3 class="text-slate-800 font-bold text-sm flex items-center gap-2 uppercase tracking-wider">
                                        <i data-lucide="inbox" class="w-4 h-4 text-slate-400"></i> Centro de Alertas
                                    </h3>
                                    <button onclick="window.toggleNotifPanel()" class="text-slate-400 hover:text-slate-800 bg-white p-1 rounded-lg border shadow-sm transition-colors">
                                        <i data-lucide="x" class="w-4 h-4"></i>
                                    </button>
                                </div>

                                <div class="max-h-[400px] overflow-y-auto">
                                    ${totalNotif === 0 ? `
                                    <div class="p-10 text-center text-slate-400 flex flex-col items-center">
                                        <div class="bg-green-50 p-4 rounded-full mb-3"><i data-lucide="check-circle-2" class="w-8 h-8 text-green-500"></i></div>
                                        <p class="text-sm font-bold text-slate-700">Todo despejado</p>
                                        <p class="text-xs mt-1">No hay tareas pendientes por ahora.</p>
                                    </div>` : notifs.map(n => `
                                    <div class="px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors group relative">
                                        <div class="flex items-start gap-4 cursor-pointer pr-8" onclick="window.toggleNotifPanel(); ${n.accion.toString().replace('() => { ', '').replace(' }', '')}">
                                            <div class="${n.bg} ${n.color} p-2.5 rounded-xl flex-shrink-0 group-hover:scale-110 transition-transform">
                                                <i data-lucide="${n.icono}" class="w-5 h-5"></i>
                                            </div>
                                            <div class="flex-1 min-w-0 pt-0.5">
                                                <p class="text-sm font-bold text-slate-800">${n.titulo}</p>
                                                <p class="text-xs text-slate-500 mt-1 leading-relaxed">${n.mensaje}</p>
                                                <p class="text-[10px] font-bold ${n.color} mt-2 uppercase tracking-widest">${n.accionLabel} →</p>
                                            </div>
                                        </div>
                                        <button onclick="event.stopPropagation(); window.descartarAlerta('${n.id}')"
                                            title="Descartar alerta"
                                            class="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                                        </button>
                                    </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <div class="text-right hidden md:block border-l border-slate-200 pl-5">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Fecha del sistema</p>
                            <p class="text-sm font-bold text-slate-700">${new Date().toLocaleDateString('es-MX', {weekday: 'long', day: 'numeric', month: 'short'})}</p>
                        </div>
                    </div>
                </header>

                <div class="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 scroll-smooth relative" style="overflow-x:hidden;">
                    <div class="max-w-7xl mx-auto">
                        ${contenidoPrincipalHTML}
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