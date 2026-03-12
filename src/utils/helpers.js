// src/utils/helpers.js
import { supabase } from '../api/supabase.js';
import { DB, AppState } from '../store/state.js';

export const SPINNER_ICON = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
export const ITEMS_PER_PAGE = 8;

export function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

export function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function getSimpleDate() {
    return new Date().toISOString().split('T')[0];
}

export function showNotification(msg, type = 'info') {
    const notif = document.createElement('div');
    const colorClass = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
    notif.className = `fixed top-4 right-4 ${colorClass} text-white px-6 py-3 rounded-lg shadow-lg z-[100] animate-fade-in flex items-center gap-2`;
    notif.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

export async function registrarMovimientoEnNube(tipo, productoId, cantidad, referencia) {
    const usuario = AppState.user ? AppState.user.nombre : 'Sistema';
    const prod = DB.productos.find(p => p.id === productoId);
    const stockAnt = prod ? prod.stock : 0;
    const stockNuevo = stockAnt + cantidad;

    const { error } = await supabase.from('movimientos').insert({
        tipo: tipo,
        producto_id: productoId,
        cantidad: cantidad,
        referencia: referencia,
        usuario: usuario,
        stock_anterior: stockAnt,
        stock_nuevo: stockNuevo,
        fecha: new Date().toISOString()
    });

    if (error) console.error("Error guardando movimiento:", error);
}

export function renderPaginacion(totalItems, itemsPerPage, currentPage, screenKey) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return '';
    
    const prevDisabled = currentPage === 1 ? 'disabled opacity-50 cursor-not-allowed' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled opacity-50 cursor-not-allowed' : '';

    return `
        <div class="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
            <span class="text-sm text-gray-600">
                Página <b>${currentPage}</b> de <b>${totalPages}</b> (${totalItems} registros)
            </span>
            <div class="flex gap-2">
                <button onclick="window.cambiarPagina('${screenKey}', ${currentPage - 1})" ${prevDisabled} class="px-4 py-2 bg-white border rounded hover:bg-gray-100 flex items-center gap-1">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i> Anterior
                </button>
                <button onclick="window.cambiarPagina('${screenKey}', ${currentPage + 1})" ${nextDisabled} class="px-4 py-2 bg-white border rounded hover:bg-gray-100 flex items-center gap-1">
                    Siguiente <i data-lucide="arrow-right" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `;
}

let accionConfirmacionPendiente = null;

export function abrirModalConfirmacion(titulo, mensaje, callback) {
    accionConfirmacionPendiente = callback;
    window.openModal(`
        <div class="p-8">
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-red-100 p-2 rounded-lg"><i data-lucide="alert-triangle" class="w-6 h-6 text-red-600"></i></div>
                <h2 class="text-2xl font-bold text-gray-800">${titulo}</h2>
            </div>
            <p class="text-gray-600 mb-8">${mensaje}</p>
            <div class="flex gap-4 justify-end">
                <button onclick="closeModal()" class="px-6 py-2 border rounded-lg font-medium hover:bg-gray-50">Cancelar</button>
                <button onclick="ejecutarConfirmacion()" class="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700">Confirmar</button>
            </div>
        </div>
    `);
}

window.ejecutarConfirmacion = () => {
    if (accionConfirmacionPendiente) {
        accionConfirmacionPendiente();
        accionConfirmacionPendiente = null;
    }
    window.closeModal();
};

// ── FIX B-09: tableSelector específico en lugar de tomar la primera tabla del DOM ──
export function exportarAExcel(filename, tableSelector = 'table') {
    const table = document.querySelector(tableSelector);
    if (!table) return showNotification('No hay datos para exportar', 'error');

    let csv = [];
    const rows = table.querySelectorAll("tr");
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll("td, th");
        for (let j = 0; j < cols.length; j++) 
            row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
        csv.push(row.join(","));        
    }

    const csvFile = new Blob([csv.join("\n")], {type: "text/csv"});
    const downloadLink = document.createElement("a");
    downloadLink.download = filename + ".csv";
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    showNotification('Reporte descargado con éxito', 'success');
}

window.exportarAExcel = exportarAExcel;

export async function exportarAPDF(nombreReporte) {
    const elemento = document.getElementById('printArea');
    if (!elemento) return showNotification('No hay datos para exportar', 'error');

    showNotification('Generando PDF, por favor espera...', 'info');

    const encabezados = elemento.querySelectorAll('.print-only');
    encabezados.forEach(el => el.style.display = 'block');

    const opciones = {
        margin:       0.5,
        filename:     `${nombreReporte}_${getSimpleDate()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    try {
        await window.html2pdf().set(opciones).from(elemento).save();
        showNotification('PDF descargado con éxito', 'success');
    } catch (error) {
        console.error("Error al hacer el PDF:", error);
        showNotification('Hubo un error al generar el PDF.', 'error');
    } finally {
        encabezados.forEach(el => el.style.display = 'none');
    }
}

window.exportarAPDF = exportarAPDF;

export function detectarTipoTarjeta(numero) {
    const n = (numero || '').replace(/\D/g, '');
    if (/^4/.test(n)) return { tipo: 'Visa', icono: '💳', color: '#1a1f71' };
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return { tipo: 'Mastercard', icono: '💳', color: '#eb001b' };
    if (/^3[47]/.test(n)) return { tipo: 'American Express', icono: '💳', color: '#007bc1' };
    if (/^6(?:011|5)/.test(n)) return { tipo: 'Discover', icono: '💳', color: '#ff6600' };
    if (/^3(?:0[0-5]|[68])/.test(n)) return { tipo: 'Diners Club', icono: '💳', color: '#004a97' };
    if (n.length >= 1) return { tipo: 'Tarjeta', icono: '💳', color: '#64748b' };
    return null;
}
window.detectarTipoTarjeta = detectarTipoTarjeta;