// src/components/Configuracion.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase, supabaseAdminAuth } from '../api/supabase.js';
import { SPINNER_ICON, showNotification, abrirModalConfirmacion } from '../utils/helpers.js';
//import {hashPassword} from '/utils/auth.js'; 

// Catálogo de todos los módulos bloqueables del sistema
const MODULOS_SISTEMA = [
    { id: 'dashboard', label: 'Dashboard y Métricas', icon: 'pie-chart' },
    { id: 'pos', label: 'Caja POS (Cobro)', icon: 'monitor' },
    { id: 'mesas', label: 'Control de Mesas', icon: 'layout-grid' },
    { id: 'productos', label: 'Catálogo de Ingredientes', icon: 'package' },
    { id: 'recetas', label: 'Menú y Recetas', icon: 'chef-hat' },
    { id: 'compras', label: 'Compras y Ajustes (Kardex)', icon: 'shopping-cart' },
    { id: 'reportes', label: 'Reportes y Cierres Z', icon: 'bar-chart-2' },
    { id: 'configuracion', label: 'Configuración y Usuarios', icon: 'settings' }
];

export function renderConfiguracion() {
    const conf = DB.configuracion || {};
    const nombreEmpresa = conf.nombre_empresa || conf.nombreEmpresa || '';
    const rfc = conf.rfc || '';
    const telefono = conf.telefono || '';
    const direccion = conf.direccion || '';
    const mensajeTicket = conf.mensaje_ticket || '¡Gracias por su preferencia!';
    const ivaPorcentaje = (conf.iva || 0.16) * 100;
    const logoUrl = conf.logo_url || '';
    const cfdiConf    = conf.cfdi_config || {};
    const cfdiUser    = cfdiConf.facturama_user  || '';
    const cfdiPass    = cfdiConf.facturama_pass  || '';
    const cfdiSandbox = cfdiConf.sandbox !== false;
    const cfdiRegimen = cfdiConf.regimen_fiscal  || '616';
    const cfdiCP      = cfdiConf.codigo_postal   || '';
    const cfdiSerie   = cfdiConf.serie           || 'A';
    const printerBaud = conf.printer_baud || 9600;
    
    // Obtener permisos actuales o inicializar vacío
    const permisosGuardados = conf.permisos_roles || {};

    // Obtener todos los roles dinámicamente
    const rolesBase = ['Admin', 'Gerente', 'Cajero'];
    const rolesExistentes = DB.usuarios.map(user => user.rol).filter(Boolean);
    const todosLosRoles = [...new Set([...rolesBase, ...rolesExistentes])]; 

    const renderListManager = (titulo, arr, key, icono) => `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
            <div class="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                <i data-lucide="${icono}" class="w-5 h-5 text-slate-400"></i>
                <h3 class="font-bold text-slate-700">${titulo}</h3>
            </div>
            <div class="p-5 flex-1 flex flex-col">
                <div class="flex gap-2 mb-4">
                    <input id="new_${key}" class="flex-1 border border-slate-300 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="Ej: Nuevo item...">
                    <button type="button" onclick="window.addItem('${key}')" class="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold hover:bg-slate-700 shadow-md transition-transform active:scale-95 flex items-center justify-center">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${(arr || []).length === 0 ? `<p class="text-xs text-slate-400 italic">No hay elementos registrados.</p>` : ''}
                    ${(arr || []).map(item => `
                        <span class="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-slate-200 group hover:border-red-300 hover:bg-red-50 transition-colors">
                            ${item}
                            <button type="button" onclick="window.delItem('${key}', '${item}')" class="text-slate-400 group-hover:text-red-500"><i data-lucide="x" class="w-3 h-3"></i></button>
                        </span>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    return `
        <div class="max-w-6xl mx-auto space-y-6 animate-fade-in pb-20 h-full mt-4">
            
            <div class="flex items-center gap-4 mb-8">
                <div class="bg-slate-900 p-3 rounded-2xl shadow-lg">
                    <i data-lucide="settings" class="w-8 h-8 text-white"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-black text-slate-800">Configuración Global</h2>
                    <p class="text-slate-500 text-sm">Personaliza el sistema, accesos y permisos de usuarios</p>
                </div>
            </div>

            <form id="formConfig" onsubmit="window.saveConfig(event)" class="space-y-6">
                
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                        <i data-lucide="store" class="w-5 h-5 text-slate-400"></i>
                        <h3 class="font-bold text-slate-700">Identidad y Parámetros Fiscales</h3>
                    </div>
                    
                    <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="md:col-span-2 space-y-5">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre de la Empresa</label>
                                    <input name="nombre_empresa" value="${nombreEmpresa}" required class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 font-bold text-lg">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">R.F.C. (Opcional)</label>
                                    <input name="rfc" value="${rfc}" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 font-mono uppercase text-lg" placeholder="Ej: XAXX010101000">
                                </div>
                            </div>
                            
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Logotipo (Tickets y Reportes)</label>
                                <input type="hidden" name="logo_url" id="logoUrlInput" value="${logoUrl}">
                                <div class="flex gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div id="logoPreview" class="h-20 w-20 rounded-xl border-2 ${logoUrl ? 'border-slate-300' : 'border-dashed border-slate-300'} bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                                        ${logoUrl
                                            ? `<img src="${logoUrl}" class="h-full w-full object-contain p-2" onerror="this.parentElement.innerHTML='<i data-lucide=\'image\' class=\'w-8 h-8 text-slate-300\'></i>'">`
                                            : `<i data-lucide="image" class="w-8 h-8 text-slate-300"></i>`
                                        }
                                    </div>
                                    <div class="flex-1 space-y-2">
                                        <button type="button" onclick="document.getElementById('logoFileInput').click()"
                                            class="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-600 hover:text-blue-700 py-2 px-4 rounded-lg text-sm font-bold transition-all shadow-sm">
                                            <i data-lucide="upload-cloud" class="w-4 h-4"></i>
                                            ${logoUrl ? 'Cambiar Logotipo' : 'Subir Logotipo'}
                                        </button>
                                        ${logoUrl ? `<button type="button" onclick="window.eliminarLogo()" class="text-xs text-red-500 hover:text-red-700 font-bold py-1 flex items-center gap-1"><i data-lucide="trash" class="w-3 h-3"></i> Quitar logo</button>` : ''}
                                        <p id="logoStatus" class="text-[10px] text-slate-400 mt-1">Formato PNG, JPG o WebP. Máx 2MB.</p>
                                    </div>
                                </div>
                                <input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" onchange="window.subirLogo(this)">
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Teléfono</label>
                                    <input name="telefono" value="${telefono}" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Dirección</label>
                                    <input name="direccion" value="${direccion}" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Mensaje en Ticket</label>
                                <textarea name="mensaje_ticket" rows="2" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm">${mensajeTicket}</textarea>
                            </div>
                        </div>
                        
                        <div class="space-y-4">
                            <div class="bg-blue-50 p-6 rounded-2xl border border-blue-100 h-full flex flex-col justify-center">
                                <label class="block text-xs font-bold text-blue-800 uppercase tracking-widest mb-3 text-center">Porcentaje de I.V.A.</label>
                                <div class="relative w-2/3 mx-auto">
                                    <input type="number" name="iva" value="${ivaPorcentaje}" step="1" min="0" max="100" required class="w-full border-2 border-blue-200 p-4 pl-4 pr-10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-blue-900 font-black text-3xl text-center bg-white shadow-sm">
                                    <span class="absolute right-4 top-4 text-blue-400 font-bold text-2xl">%</span>
                                </div>
                                <p class="text-xs text-blue-600 mt-4 text-center">Tasa impositiva utilizada para Órdenes de Compra.</p>
                                
                                <button type="submit" id="btnSaveConf" class="mt-8 w-full bg-blue-600 text-white py-4 rounded-xl font-black text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-transform active:scale-95 flex justify-center items-center gap-2">
                                    <i data-lucide="save" class="w-5 h-5"></i> Guardar Todo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="bg-slate-900 px-6 py-4 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i data-lucide="shield-check" class="w-5 h-5 text-emerald-400"></i>
                            <h3 class="font-bold text-white">Matriz de Accesos (Permisos por Rol)</h3>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-sm text-slate-500 mb-6">Selecciona a qué partes del sistema puede acceder cada rol. Si creaste roles nuevos, aparecerán aquí automáticamente.</p>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            ${todosLosRoles.map(rol => {
                                const esAdmin = rol === 'Admin';
                                const permisosRol = permisosGuardados[rol] || [];
                                
                                return `
                                <div class="border ${esAdmin ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-white'} rounded-xl p-4 shadow-sm">
                                    <h4 class="font-black text-lg mb-3 ${esAdmin ? 'text-purple-700' : 'text-slate-800'} border-b pb-2 flex justify-between items-center">
                                        ${rol}
                                        ${esAdmin ? '<i data-lucide="lock" class="w-4 h-4 opacity-50"></i>' : ''}
                                    </h4>
                                    <div class="space-y-2">
                                        ${MODULOS_SISTEMA.map(mod => {
                                            const isChecked = esAdmin || permisosRol.includes(mod.id);
                                            return `
                                            <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors ${esAdmin ? 'opacity-70 pointer-events-none' : ''}">
                                                <input type="checkbox" name="permiso|${rol}|${mod.id}" value="1" 
                                                    class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                                    ${isChecked ? 'checked' : ''} 
                                                    ${esAdmin ? 'disabled' : ''}>
                                                <span class="text-sm font-medium text-slate-700 flex items-center gap-2 flex-1">
                                                    <i data-lucide="${mod.icon}" class="w-3.5 h-3.5 text-slate-400"></i>
                                                    ${mod.label}
                                                </span>
                                            </label>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>

            </form>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700 flex items-center gap-2">
                        <i data-lucide="layout-grid" class="w-5 h-5 text-slate-400"></i> Disposición de Mesas y Zonas
                    </h3>
                    <button type="button" onclick="window.abrirModalMesa()" class="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-700 shadow-md transition-transform active:scale-95 flex items-center gap-2">
                        <i data-lucide="plus" class="w-4 h-4"></i> Añadir Mesa
                    </button>
                </div>

                ${(() => {
                    const mesas = DB.mesas || [];
                    if (mesas.length === 0) return `
                        <div class="p-10 text-center text-slate-400">
                            <i data-lucide="armchair" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
                            <p class="font-bold text-lg text-slate-600">No hay mesas configuradas</p>
                            <p class="text-sm mt-1">Crea tus zonas (ej: Terraza, Salón) y agrega las mesas.</p>
                        </div>`;

                    const zonas = [...new Set(mesas.map(m => m.zona || 'General'))];
                    return `<div class="divide-y divide-slate-100">` + zonas.map(zona => {
                        const mesasZona = mesas.filter(m => (m.zona || 'General') === zona);
                        return `
                        <div class="px-6 py-5">
                            <p class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <i data-lucide="map-pin" class="w-4 h-4 text-orange-400"></i> ${zona}
                            </p>
                            <div class="flex flex-wrap gap-3">
                                ${mesasZona.map(m => `
                                    <div class="flex flex-col bg-white border border-slate-200 shadow-sm rounded-xl p-3 min-w-[140px] group hover:border-blue-300 transition-colors relative">
                                        <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white pl-2">
                                            <button onclick="window.abrirModalMesa(${m.id})" class="text-blue-500 hover:bg-blue-50 p-1 rounded" title="Editar"><i data-lucide="edit-2" class="w-3 h-3"></i></button>
                                            <button onclick="window.eliminarMesa(${m.id})" class="text-red-500 hover:bg-red-50 p-1 rounded" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                                        </div>
                                        <span class="font-black text-slate-800 text-lg">${m.nombre}</span>
                                        <span class="text-xs text-slate-500 flex items-center gap-1 mt-1"><i data-lucide="users" class="w-3 h-3"></i> ${m.capacidad} pax</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>`;
                    }).join('') + `</div>`;
                })()}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                ${renderListManager('Categorías de Productos', DB.categorias, 'categorias', 'tags')}
                ${renderListManager('Unidades de Medida', DB.unidades, 'unidades', 'scale')}
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5 text-slate-400"></i> Usuarios y Accesos</h3>
                    <button type="button" onclick="window.abrirModalUsuario()" class="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-700 shadow-md transition-transform active:scale-95 flex items-center gap-2">
                        <i data-lucide="user-plus" class="w-4 h-4"></i> Nuevo Usuario
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-white text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-100">
                            <tr><th class="px-6 py-4 font-bold text-left">Usuario</th><th class="px-6 py-4 font-bold text-left">Login ID</th><th class="px-6 py-4 font-bold text-center">Rol Asignado</th><th class="px-6 py-4 font-bold text-right">Acciones</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50">
                            ${DB.usuarios.map(u => {
                                const colorCls = u.rol==='Admin' ? 'bg-purple-100 text-purple-700' : 
                                                 u.rol==='Gerente' ? 'bg-blue-100 text-blue-700' : 
                                                 u.rol==='Cajero' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
                                return `
                                <tr class="hover:bg-slate-50/50 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-3">
                                            <img src="${u.avatar}" class="w-10 h-10 rounded-full border border-slate-200 shadow-sm">
                                            <span class="font-bold text-slate-800">${u.nombre}</span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 font-mono text-slate-500 text-xs">${u.username}</td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${colorCls}">${u.rol}</span>
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <button onclick="window.abrirModalUsuario(${u.id})" class="text-blue-500 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                                        ${u.id !== AppState.user.id ? `<button onclick="window.eliminarUsuario(${u.id})" class="text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : `<span class="inline-block w-8"></span>`}
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-6">
                <div class="flex items-center gap-3 mb-5">
                    <div class="bg-red-100 p-2.5 rounded-xl"><i data-lucide="database" class="w-5 h-5 text-red-600"></i></div>
                    <div>
                        <h3 class="text-lg font-black text-slate-800">Mantenimiento de Datos</h3>
                        <p class="text-xs text-slate-400 mt-0.5">Limpia historiales o restablece el sistema. El inventario no se borra.</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <button onclick="window.limpiarHistorial('ventas','Historial de Ventas')" class="flex items-start gap-3 p-4 border-2 border-red-100 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded-xl transition-all text-left"><i data-lucide="receipt" class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"></i><div><p class="font-bold text-slate-800 text-sm">Limpiar Ventas</p><p class="text-xs text-slate-500 leading-snug mt-0.5">Borra todos los tickets y transacciones</p></div></button>
                    <button onclick="window.limpiarHistorial('movimientos','Movimientos de Inventario')" class="flex items-start gap-3 p-4 border-2 border-orange-100 hover:border-orange-400 bg-orange-50 hover:bg-orange-100 rounded-xl transition-all text-left"><i data-lucide="history" class="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5"></i><div><p class="font-bold text-slate-800 text-sm">Limpiar Movimientos</p><p class="text-xs text-slate-500 leading-snug mt-0.5">Borra el kardex de entradas y salidas</p></div></button>
                    <button onclick="window.limpiarHistorial('ordenes_compra','Órdenes de Compra')" class="flex items-start gap-3 p-4 border-2 border-yellow-100 hover:border-yellow-400 bg-yellow-50 hover:bg-yellow-100 rounded-xl transition-all text-left"><i data-lucide="shopping-cart" class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"></i><div><p class="font-bold text-slate-800 text-sm">Limpiar Órdenes</p><p class="text-xs text-slate-500 leading-snug mt-0.5">Borra órdenes pendientes y recibidas</p></div></button>
                    <button onclick="window.restablecerAlertas()" class="flex items-start gap-3 p-4 border-2 border-slate-100 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all text-left"><i data-lucide="bell" class="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5"></i><div><p class="font-bold text-slate-800 text-sm">Restablecer Alertas</p><p class="text-xs text-slate-500 leading-snug mt-0.5">Muestra todas las alertas descartadas</p></div></button>
                    <button onclick="window.restablecerBD()" class="flex items-start gap-3 p-4 border-2 border-purple-100 hover:border-purple-400 bg-purple-50 hover:bg-purple-100 rounded-xl transition-all text-left sm:col-span-2 lg:col-span-1"><i data-lucide="rotate-ccw" class="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5"></i><div><p class="font-bold text-slate-800 text-sm">Restablecer BD Completa</p><p class="text-xs text-slate-500 leading-snug mt-0.5">Borra ventas, movs. y órdenes.</p></div></button>
                </div>
            </div>

        </div>
    `;
}

// ─── FUNCIONES GLOBALES DE CONFIGURACIÓN ──────────────────────────────────────
window.saveConfig = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSaveConf');
    const prev = btn.innerHTML; 
    btn.disabled = true; 
    btn.innerHTML = SPINNER_ICON + ' Guardando...';

    const form = new FormData(e.target);
    const ivaDecimal = parseFloat(form.get('iva')) / 100;

    // MAGIA: Construir el JSON de permisos extrayendo los checkboxes marcados
    const permisosRolesNuevos = { Admin: MODULOS_SISTEMA.map(m => m.id) }; // El admin siempre tiene todo
    for (let [key, val] of form.entries()) {
        if (key.startsWith('permiso|')) {
            const parts = key.split('|');
            const rolName = parts[1];
            const modId = parts[2];
            if (rolName !== 'Admin') { // Ignoramos al Admin en el form para no sobrescribirlo accidentalmente
                if (!permisosRolesNuevos[rolName]) permisosRolesNuevos[rolName] = [];
                permisosRolesNuevos[rolName].push(modId);
            }
        }
    }

    const nuevosDatos = {
        id: 1, 
        nombre_empresa: form.get('nombre_empresa').trim(),
        rfc: form.get('rfc').trim().toUpperCase(),
        telefono: form.get('telefono').trim(),
        direccion: form.get('direccion').trim(),
        mensaje_ticket: form.get('mensaje_ticket').trim(),
        logo_url: form.get('logo_url').trim(),
        iva: ivaDecimal,
        printer_baud: parseInt(form.get('printer_baud')) || 9600,
        cfdi_config: {
            facturama_user: form.get('cfdi_user')?.trim()  || '',
            facturama_pass: form.get('cfdi_pass')?.trim()  || '',
            regimen_fiscal: form.get('cfdi_regimen')       || '616',
            codigo_postal:  form.get('cfdi_cp')?.trim()    || '',
            serie:          (form.get('cfdi_serie')?.trim().toUpperCase()) || 'A',
            sandbox:        form.get('cfdi_sandbox') === 'on',
        },
        permisos_roles: permisosRolesNuevos // Guardamos la matriz en la base de datos
    };

    try {
        const { error } = await supabase.from('configuracion').upsert(nuevosDatos);
        if(error) {
            if (error.code === '42P01') throw new Error("La tabla 'configuracion' no existe en Supabase.");
            throw error;
        }
        await cargarDatosDeNube();
        showNotification('Configuración y Permisos guardados', 'success');
        window.render();
    } catch(e) { 
        showNotification('Error: ' + e.message, 'error'); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = prev; 
        if(window.lucide) window.lucide.createIcons();
    }
};

window.addItem = async (key) => {
    const input = document.getElementById('new_'+key);
    const val = input.value.trim();
    const currentArr = DB[key] || []; 
    
    if(val && !currentArr.includes(val)) {
        const updateObj = { [key]: [...currentArr, val] }; 
        try {
            const { error } = await supabase.from('configuracion').update(updateObj).eq('id', 1);
            if(error) throw error;
            await cargarDatosDeNube(); 
            window.render();
            showNotification('Elemento agregado', 'success');
        } catch(e) { showNotification('Error: '+e.message, 'error'); }
    }
};

window.delItem = async (key, val) => {
    abrirModalConfirmacion('Eliminar Elemento', `¿Quitar "${val}" de la lista?`, async () => {
        const currentArr = DB[key] || [];
        const updateObj = { [key]: currentArr.filter(x => x !== val) };
        try {
            const { error } = await supabase.from('configuracion').update(updateObj).eq('id', 1);
            if(error) throw error;
            await cargarDatosDeNube();
            window.render();
            showNotification('Elemento eliminado', 'success');
        } catch(e) { showNotification('Error: '+e.message, 'error'); }
    });
};

window.subirLogo = async (input) => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showNotification('El logo no puede pesar más de 2MB', 'error');

    const statusEl = document.getElementById('logoStatus');
    const previewEl = document.getElementById('logoPreview');
    const urlInput = document.getElementById('logoUrlInput');

    if (statusEl) { statusEl.textContent = 'Subiendo...'; statusEl.className = 'text-[10px] text-blue-500 mt-1 font-bold'; }

    try {
        const ext = file.name.split('.').pop();
        const fileName = `logo_${Date.now()}.${ext}`;

        const { data, error } = await supabase.storage.from('logos').upload(fileName, file, { upsert: true, contentType: file.type });
        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);

        if (urlInput) urlInput.value = publicUrl;
        if (previewEl) {
            previewEl.className = 'h-20 w-20 rounded-xl border-2 border-slate-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm';
            previewEl.innerHTML = `<img src="${publicUrl}" class="h-full w-full object-contain p-2">`;
        }

        if (statusEl) { statusEl.textContent = '✓ Listo.'; statusEl.className = 'text-[10px] text-emerald-600 mt-1 font-bold'; }
        showNotification('Logo cargado. Guarda la configuración.', 'info');

    } catch (err) {
        if (statusEl) { statusEl.textContent = 'Error.'; statusEl.className = 'text-[10px] text-red-500 mt-1 font-bold'; }
        showNotification('Error al subir logo: ' + err.message, 'error');
    }
    input.value = '';
};

window.eliminarLogo = async () => {
    const urlInput = document.getElementById('logoUrlInput');
    const previewEl = document.getElementById('logoPreview');
    if (urlInput) urlInput.value = '';
    if (previewEl) {
        previewEl.className = 'h-20 w-20 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm';
        previewEl.innerHTML = '<i data-lucide="image" class="w-8 h-8 text-slate-300"></i>';
        if (window.lucide) window.lucide.createIcons();
    }
};

window.abrirModalMesa = (id = null) => {
    // Igual al anterior
    const m = id ? (DB.mesas || []).find(x => x.id === id) : null;
    const zonas = [...new Set((DB.mesas || []).map(x => x.zona || 'General'))];

    window.openModal(`
        <div class="p-8">
            <h2 class="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <i data-lucide="${m ? 'edit-2' : 'armchair'}" class="text-orange-500 w-6 h-6"></i>
                ${m ? 'Editar Mesa' : 'Añadir Nueva Mesa'}
            </h2>
            <form id="formMesa" class="space-y-4">
                <input type="hidden" name="id" value="${m?.id || ''}">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre / Identificador</label>
                        <input name="nombre" value="${m?.nombre || ''}" required class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 font-bold">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Capacidad (pax)</label>
                        <input name="capacidad" type="number" min="1" max="50" value="${m?.capacidad || 4}" required class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-center font-bold">
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Área / Zona</label>
                    <input name="zona" id="mesaZonaInput" value="${m?.zona || 'Salón Principal'}" required class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800">
                    ${zonas.length > 0 ? `<div class="mt-3"><div class="flex flex-wrap gap-2">${zonas.map(z => `<button type="button" onclick="document.getElementById('mesaZonaInput').value='${z}'" class="text-xs bg-slate-100 hover:bg-orange-100 text-slate-600 px-3 py-1.5 rounded-lg font-bold">${z}</button>`).join('')}</div></div>` : ''}
                </div>
                <div class="pt-6 flex gap-3">
                    <button type="button" onclick="window.closeModal()" class="flex-1 py-3 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                    <button type="submit" class="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-transform active:scale-95">Guardar Mesa</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById('formMesa').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const datos = { nombre: fd.get('nombre').trim(), zona: fd.get('zona').trim() || 'General', capacidad: parseInt(fd.get('capacidad')) || 4, estado: m?.estado || 'libre' };
        if (fd.get('id')) datos.id = parseInt(fd.get('id'));

        try {
            const { error } = await supabase.from('mesas').upsert(datos);
            if (error) throw error;
            await cargarDatosDeNube();
            window.closeModal();
            window.render();
            showNotification('Mesa configurada', 'success');
        } catch (err) { showNotification('Error: ' + err.message, 'error'); }
    };
};

window.eliminarMesa = async (id) => {
    const mesa = (DB.mesas || []).find(m => m.id === id);
    if (!mesa) return;
    if (mesa.estado !== 'libre') return showNotification('No puedes eliminar una mesa ocupada', 'error');

    abrirModalConfirmacion('Eliminar Mesa', `¿Estás seguro de quitar la "${mesa.nombre}"?`, async () => {
        try {
            const { error } = await supabase.from('mesas').delete().eq('id', id);
            if (error) throw error;
            await cargarDatosDeNube();
            window.render();
            showNotification('Mesa eliminada', 'success');
        } catch (err) { showNotification('Error: ' + err.message, 'error'); }
    });
};

// ─── MODALES DE USUARIO Y SUPABASE AUTH (ROLES DINÁMICOS) ─────────────────────
window.abrirModalUsuario = (id = null) => {
    const u = id ? DB.usuarios.find(x => x.id === id) : null;

    const rolesBase = ['Admin', 'Gerente', 'Cajero'];
    const rolesExistentes = DB.usuarios.map(user => user.rol).filter(Boolean);
    const todosLosRoles = [...new Set([...rolesBase, ...rolesExistentes])]; 

    window.openModal(`
        <div class="p-8">
            <h2 class="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <i data-lucide="${u ? 'user-cog' : 'user-plus'}" class="text-blue-500 w-6 h-6"></i>
                ${u ? 'Editar Perfil' : 'Nuevo Usuario (Auth)'}
            </h2>
            <form id="formUser" class="space-y-4">
                <input type="hidden" name="id" value="${u?.id || ''}">
                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre Completo</label>
                    <input name="nombre" value="${u?.nombre || ''}" required placeholder="Ej: Juan Pérez"
                        class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Usuario (Login ID)</label>
                        <input name="username" value="${u?.username || ''}" placeholder="Ej: juan, admin2"
                            ${u ? 'readonly title="El ID de conexión no se puede editar después de creado"' : 'required'}
                            class="w-full border border-slate-300 p-3 rounded-xl outline-none font-mono ${u ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500 text-slate-800'}">
                        ${!u ? `<p class="text-[9px] text-slate-400 mt-1">Solo letras minúsculas y números (sin espacios ni ñ).</p>` : ''}
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                            Contraseña ${u ? '<span class="text-slate-400 font-normal normal-case text-[10px]">(Protegida)</span>' : '*'}
                        </label>
                        <input name="password" type="password" 
                            placeholder="${u ? '••••••••' : 'Mínimo 6 caracteres'}" 
                            ${u ? 'disabled title="Para cambiar la contraseña ve a la configuración de tu cuenta o usa panel Supabase"' : 'required minlength="6"'}
                            class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono ${u ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-slate-800'}">
                    </div>
                </div>
                
                <div class="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <label class="block text-xs font-bold text-blue-800 uppercase tracking-widest mb-1">Rol en el Sistema</label>
                    <select id="selectRol" name="rol" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 font-bold bg-white"
                        onchange="if(this.value==='__nuevo__'){ 
                            document.getElementById('inputNuevoRol').classList.remove('hidden'); 
                            document.getElementById('inputNuevoRol').focus(); 
                            document.getElementById('inputNuevoRol').required = true; 
                        } else { 
                            document.getElementById('inputNuevoRol').classList.add('hidden'); 
                            document.getElementById('inputNuevoRol').required = false; 
                            document.getElementById('inputNuevoRol').value = ''; 
                        }">
                        ${todosLosRoles.map(r => `<option value="${r}" ${u?.rol === r ? 'selected' : ''}>${r}</option>`).join('')}
                        ${!todosLosRoles.includes(u?.rol) && u?.rol ? `<option value="${u.rol}" selected>${u.rol}</option>` : ''}
                        <option value="__nuevo__">➕ Crear nuevo rol personalizado...</option>
                    </select>
                    
                    <input type="text" id="inputNuevoRol" name="rol_nuevo" placeholder="Ej: Cocinero, Repartidor..." 
                        class="hidden mt-3 w-full border-2 border-orange-400 p-3 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-slate-800 font-bold shadow-inner">
                </div>

                <div class="pt-6 flex gap-3">
                    <button type="button" onclick="window.closeModal()" class="flex-1 py-3 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                    <button type="submit" class="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-transform active:scale-95">${u ? 'Guardar Cambios' : 'Registrar Usuario'}</button>
                </div>
            </form>
        </div>
    `);
    if(window.lucide) window.lucide.createIcons();

    document.getElementById('formUser').onsubmit = async (e) => {
        e.preventDefault();

        const btn = e.target.querySelector('button[type="submit"]');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = SPINNER_ICON + ' Guardando...';

        const fd = new FormData(e.target);
        const datos = Object.fromEntries(fd.entries());

        if (datos.id) datos.id = parseInt(datos.id);
        else delete datos.id;

        if (datos.rol === '__nuevo__') {
            datos.rol = (datos.rol_nuevo || '').trim();
            if(!datos.rol) { showNotification('Debes escribir el nombre del nuevo rol', 'error'); btn.disabled = false; btn.innerHTML = originalHTML; return; }
        }
        delete datos.rol_nuevo;

        let safeUsername = datos.username.split('@')[0].toLowerCase().trim();
        safeUsername = safeUsername.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
        safeUsername = safeUsername.replace(/[^a-z0-9_]/g, ""); 

        if (safeUsername.length < 3) {
            showNotification('El Login ID debe tener al menos 3 letras o números sin símbolos.', 'error');
            btn.disabled = false; btn.innerHTML = originalHTML; return;
        }

        datos.username = safeUsername; 
        const plainPassword = datos.password;
        
        try {
            if (!u) {
                // Es un usuario nuevo
                if (!plainPassword || plainPassword.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
                const dummyEmail = `${safeUsername}@stockcentral.com`;
                
                // 1. Registro en el Auth de Supabase
                const { error: authError } = await supabaseAdminAuth.auth.signUp({ email: dummyEmail, password: plainPassword });
                if (authError) {
                    if(authError.message.includes('already registered')) throw new Error('Ese Login ID ya está en uso.');
                    throw new Error('Error Auth: ' + authError.message);
                }
                
                // 2. BUG B-01 SOLUCIONADO: Hashear la contraseña antes de guardarla en la tabla pública
                datos.password = await hashPassword(plainPassword); 
                
                datos.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(datos.nombre)}&background=random&color=fff`;
            } else {
                // Es una edición de usuario existente, no tocamos la contraseña
                delete datos.password;
            }

            const { error } = await supabase.from('usuarios').upsert(datos);
            if (error) throw error;

            await cargarDatosDeNube();
            window.closeModal();
            window.render();
            showNotification(u ? 'Perfil actualizado' : `Usuario registrado como ${datos.rol}`, 'success');
        } catch (err) {
            showNotification(err.message, 'error');
            btn.disabled = false; btn.innerHTML = originalHTML;
        }
    };
};

window.eliminarUsuario = async (id) => {
    if (id === AppState.user.id) return showNotification('No puedes eliminar tu propio usuario en uso.', 'error');
    abrirModalConfirmacion('Desvincular Usuario', '¿Quitar el perfil de este usuario?', async () => {
        try {
            const { error } = await supabase.from('usuarios').delete().eq('id', id);
            if (error) throw error;
            await cargarDatosDeNube();
            window.render();
            showNotification('Perfil eliminado', 'success');
        } catch(e) { showNotification('Error: ' + e.message, 'error'); }
    });
};

window.limpiarHistorial = async (tabla, nombre) => {
    abrirModalConfirmacion(
        'Limpiar Historial',
        `⚠️ ¿Seguro que deseas borrar TODO el historial de ${nombre}?<br><br>Esta acción NO se puede deshacer.`,
        async () => {
            try {
                const { error } = await supabase.from(tabla).delete().neq('id', 0);
                if (error) throw error;
                await cargarDatosDeNube();
                showNotification(`✅ ${nombre} limpiado correctamente`, 'success');
                window.render();
            } catch(err) { showNotification('Error: ' + err.message, 'error'); }
        }
    );
};

window.restablecerBD = async () => {
    abrirModalConfirmacion('⚠️ RESTABLECER BASE DE DATOS', `¿Confirmas que deseas BORRAR el historial completo? Esta acción es IRREVERSIBLE.`, async () => {
        try {
            await supabase.from('ventas').delete().neq('id', 0);
            await supabase.from('movimientos').delete().neq('id', 0);
            await supabase.from('ordenes_compra').delete().neq('id', 0);
            try { localStorage.removeItem('pos_alertas_leidas'); } catch {}
            await cargarDatosDeNube();
            showNotification('✅ Base de datos restablecida.', 'success');
            window.render();
        } catch(err) { showNotification('Error al restablecer: ' + err.message, 'error'); }
    });
};