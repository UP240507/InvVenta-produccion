// src/components/Facturacion.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { formatCurrency, formatDate, showNotification, SPINNER_ICON } from '../utils/helpers.js';
import { REGIMENES_FISCALES, USOS_CFDI, timbrarCFDI, cancelarCFDI, descargarCFDI } from '../services/cfdiService.js';

export function renderFacturacion() {
    const facturas   = (DB.facturas || []).sort((a, b) => new Date(b.fecha_emision) - new Date(a.fecha_emision));
    const vigentes   = facturas.filter(f => f.estado === 'vigente');
    const totalFact  = vigentes.reduce((s, f) => s + (f.total || 0), 0);
    const canceladas = facturas.filter(f => f.estado === 'cancelado').length;

    return `
    <div class="space-y-6 animate-fade-in pb-20">
        <div class="flex justify-between items-center bg-white p-6 rounded-2xl border shadow-sm">
            <div>
                <h2 class="text-xl font-black text-slate-800 flex items-center gap-2">
                    <i data-lucide="file-text" class="w-6 h-6 text-blue-600"></i> Facturas CFDI 4.0
                </h2>
                <p class="text-sm text-slate-500 mt-1">Comprobantes fiscales emitidos</p>
            </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
            <div class="bg-white p-5 rounded-2xl border shadow-sm">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Vigentes</p>
                <p class="text-3xl font-black text-slate-800 mt-1">${vigentes.length}</p>
                <p class="text-sm font-bold text-blue-600 mt-1">${formatCurrency(totalFact)}</p>
            </div>
            <div class="bg-white p-5 rounded-2xl border shadow-sm">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Canceladas</p>
                <p class="text-3xl font-black text-red-500 mt-1">${canceladas}</p>
            </div>
            <div class="bg-white p-5 rounded-2xl border shadow-sm">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Total emitidas</p>
                <p class="text-3xl font-black text-slate-800 mt-1">${facturas.length}</p>
            </div>
        </div>

        ${facturas.length === 0 ? `
        <div class="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <div class="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i data-lucide="file-text" class="w-10 h-10 text-blue-400"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-700">Sin facturas emitidas</h3>
            <p class="text-slate-500 mt-1">Las facturas se generan desde el POS o Mesas al cobrar.</p>
        </div>` : `
        <div class="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr>
                            <th class="p-4 font-bold">Fecha</th>
                            <th class="p-4 font-bold">Folio Venta</th>
                            <th class="p-4 font-bold">RFC Receptor</th>
                            <th class="p-4 font-bold">Receptor</th>
                            <th class="p-4 text-right font-bold">Total</th>
                            <th class="p-4 text-center font-bold">Estado</th>
                            <th class="p-4 text-center font-bold">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${facturas.map(f => {
                            const vigente = f.estado === 'vigente';
                            return `<tr class="hover:bg-slate-50/50">
                                <td class="p-4 text-xs text-slate-500">${formatDate(f.fecha_emision)}</td>
                                <td class="p-4 font-mono text-xs text-slate-500">${f.folio_venta || '—'}</td>
                                <td class="p-4 font-mono text-xs font-bold text-slate-700">${f.rfc_receptor}</td>
                                <td class="p-4 text-slate-600 text-xs max-w-[180px] truncate">${f.nombre_receptor}</td>
                                <td class="p-4 text-right font-black text-slate-800">${formatCurrency(f.total)}</td>
                                <td class="p-4 text-center">
                                    <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${vigente ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">
                                        ${f.estado}
                                    </span>
                                </td>
                                <td class="p-4 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        ${f.facturama_id ? `
                                        <button onclick="window.descargarFactura('${f.facturama_id}','pdf')" class="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="PDF">
                                            <i data-lucide="file-text" class="w-4 h-4"></i>
                                        </button>
                                        <button onclick="window.descargarFactura('${f.facturama_id}','xml')" class="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="XML">
                                            <i data-lucide="code" class="w-4 h-4"></i>
                                        </button>` : ''}
                                        ${vigente && f.id ? `
                                        <button onclick="window.cancelarFactura(${f.id})" class="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Cancelar">
                                            <i data-lucide="x-circle" class="w-4 h-4"></i>
                                        </button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`}
    </div>`;
}

export function abrirModalFactura(ventaData) {
    const conf    = DB.configuracion || {};
    const cfgCfdi = conf.cfdi_config || {};
    if (!conf.rfc) { showNotification('Configura el RFC del negocio en Configuración', 'error'); return; }
    if (!cfgCfdi.facturama_user) { showNotification('Configura las credenciales de Facturama en Configuración', 'error'); return; }

    const regimenOpts = REGIMENES_FISCALES.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
    const usoOpts     = USOS_CFDI.map(u => `<option value="${u.value}">${u.label}</option>`).join('');

    window.openModal(`
        <div class="p-6 sm:p-8">
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-blue-100 p-2.5 rounded-xl"><i data-lucide="file-text" class="w-6 h-6 text-blue-600"></i></div>
                <div>
                    <h2 class="text-xl font-black text-slate-800">Emitir Factura CFDI 4.0</h2>
                    <p class="text-xs text-slate-500 mt-0.5">Venta: <b>${ventaData.folio || '—'}</b> · Total: <b>${formatCurrency(ventaData.total)}</b></p>
                </div>
            </div>
            <div class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">RFC del cliente *</label>
                        <input id="cfdi-rfc" type="text" placeholder="XAXX010101000" maxlength="13"
                            class="w-full border border-slate-300 p-3 rounded-xl font-mono uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                            oninput="this.value=this.value.toUpperCase(); window.cfdiAutoPublico()">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre / Razón Social *</label>
                        <input id="cfdi-nombre" type="text" placeholder="Nombre completo"
                            class="w-full border border-slate-300 p-3 rounded-xl uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                            oninput="this.value=this.value.toUpperCase()">
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Uso del CFDI *</label>
                        <select id="cfdi-uso" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">${usoOpts}</select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Régimen Fiscal *</label>
                        <select id="cfdi-regimen" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">${regimenOpts}</select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">CP Fiscal *</label>
                        <input id="cfdi-cp" type="text" placeholder="64000" maxlength="5"
                            class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono">
                    </div>
                </div>
                <div id="cfdi-publico-banner" class="hidden bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 font-bold">
                    ⚠️ RFC genérico · Se usará S01 · Sin efectos fiscales.
                </div>
            </div>
            <div class="flex gap-3 mt-8">
                <button onclick="closeModal()" class="flex-1 border-2 border-slate-200 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
                <button id="btn-timbrar" onclick="window.ejecutarTimbrado(${JSON.stringify(ventaData).replace(/"/g,'&quot;')})"
                    class="flex-[2] bg-blue-600 text-white py-3 rounded-xl font-black hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 active:scale-95">
                    <i data-lucide="stamp" class="w-5 h-5"></i> Timbrar CFDI
                </button>
            </div>
        </div>`);
    if (window.lucide) window.lucide.createIcons();
}

window.cfdiAutoPublico = () => {
    const rfc = document.getElementById('cfdi-rfc')?.value || '';
    const banner = document.getElementById('cfdi-publico-banner');
    const uso    = document.getElementById('cfdi-uso');
    const nombre = document.getElementById('cfdi-nombre');
    const reg    = document.getElementById('cfdi-regimen');
    const pub = rfc === 'XAXX010101000';
    if (banner) banner.classList.toggle('hidden', !pub);
    if (pub && uso)    uso.value = 'S01';
    if (pub && nombre && !nombre.value) nombre.value = 'PUBLICO EN GENERAL';
    if (pub && reg)    reg.value = '616';
};

window.ejecutarTimbrado = async (ventaData) => {
    const rfc    = document.getElementById('cfdi-rfc')?.value.trim().toUpperCase();
    const nombre = document.getElementById('cfdi-nombre')?.value.trim().toUpperCase();
    const uso    = document.getElementById('cfdi-uso')?.value;
    const regimen = document.getElementById('cfdi-regimen')?.value;
    const cp     = document.getElementById('cfdi-cp')?.value.trim();
    const btn    = document.getElementById('btn-timbrar');

    if (!rfc || !nombre || !uso || !regimen || !cp) { showNotification('Completa todos los campos', 'error'); return; }
    if (cp.length !== 5 || isNaN(cp)) { showNotification('CP debe tener 5 dígitos', 'error'); return; }

    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Timbrando...';

    try {
        const { factura } = await timbrarCFDI({ venta: ventaData, receptor: { rfc, nombre, uso_cfdi: uso, regimen, cp } });
        await cargarDatosDeNube();
        window.closeModal();
        window.openModal(`
            <div class="p-8 text-center">
                <div class="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="check-circle" class="w-10 h-10 text-green-600"></i>
                </div>
                <h2 class="text-2xl font-black text-slate-800 mb-1">¡CFDI Timbrado!</h2>
                <p class="text-slate-500 text-sm mb-6">Sellado por el SAT correctamente.</p>
                <div class="bg-slate-50 rounded-xl p-4 text-left mb-6 space-y-2 border">
                    <div class="flex justify-between text-sm"><span class="text-slate-400 font-bold uppercase text-xs">RFC Receptor</span><span class="font-mono font-bold text-slate-700">${rfc}</span></div>
                    <div class="flex justify-between text-sm"><span class="text-slate-400 font-bold uppercase text-xs">Total</span><span class="font-black text-slate-800">${formatCurrency(ventaData.total)}</span></div>
                    ${factura.folio_fiscal ? `<div class="pt-2 border-t"><p class="text-xs text-slate-400 uppercase font-bold mb-1">UUID</p><p class="font-mono text-xs text-slate-600 break-all">${factura.folio_fiscal}</p></div>` : ''}
                </div>
                <div class="flex gap-3">
                    ${factura.facturama_id ? `
                    <button onclick="window.descargarFactura('${factura.facturama_id}','pdf')" class="flex-1 flex items-center justify-center gap-2 border-2 border-red-200 text-red-600 py-3 rounded-xl font-bold hover:bg-red-50"><i data-lucide="file-text" class="w-4 h-4"></i> PDF</button>
                    <button onclick="window.descargarFactura('${factura.facturama_id}','xml')" class="flex-1 flex items-center justify-center gap-2 border-2 border-blue-200 text-blue-600 py-3 rounded-xl font-bold hover:bg-blue-50"><i data-lucide="code" class="w-4 h-4"></i> XML</button>` : ''}
                    <button onclick="closeModal()" class="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700">Cerrar</button>
                </div>
            </div>`);
        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        showNotification('Error al timbrar: ' + err.message, 'error');
        btn.disabled = false; btn.innerHTML = orig;
        if (window.lucide) window.lucide.createIcons();
    }
};

window.descargarFactura = async (fid, fmt) => {
    try { await descargarCFDI(fid, fmt); } catch (err) { showNotification('Error: ' + err.message, 'error'); }
};

window.cancelarFactura = async (id) => {
    const motivos = [
        { value:'01', label:'01 · Con errores con relación' },
        { value:'02', label:'02 · Con errores sin relación' },
        { value:'03', label:'03 · No se llevó a cabo la operación' },
        { value:'04', label:'04 · Operación nominativa en factura global' },
    ];
    window.openModal(`
        <div class="p-6 sm:p-8">
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-red-100 p-2.5 rounded-xl"><i data-lucide="x-circle" class="w-6 h-6 text-red-600"></i></div>
                <h2 class="text-xl font-black text-slate-800">Cancelar Factura</h2>
            </div>
            <p class="text-sm text-slate-500 mb-4">Selecciona el motivo (catálogo SAT):</p>
            <select id="cfdi-motivo" class="w-full border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-red-500 outline-none bg-white mb-6 text-sm">
                ${motivos.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
            </select>
            <div class="flex gap-3">
                <button onclick="closeModal()" class="flex-1 border-2 border-slate-200 py-3 rounded-xl font-bold text-slate-600">Cancelar</button>
                <button id="btn-confirm-cancel" onclick="window.confirmarCancelacion(${id})"
                    class="flex-[2] bg-red-600 text-white py-3 rounded-xl font-black hover:bg-red-700 active:scale-95">
                    Confirmar Cancelación
                </button>
            </div>
        </div>`);
    if (window.lucide) window.lucide.createIcons();
};

window.confirmarCancelacion = async (id) => {
    const motivo = document.getElementById('cfdi-motivo')?.value || '02';
    const btn = document.getElementById('btn-confirm-cancel');
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = SPINNER_ICON + ' Cancelando...';
    try {
        await cancelarCFDI(id, motivo);
        await cargarDatosDeNube();
        window.closeModal();
        showNotification('Factura cancelada', 'success');
        window.render();
    } catch (err) {
        showNotification('Error: ' + err.message, 'error');
        btn.disabled = false; btn.innerHTML = orig;
    }
};
