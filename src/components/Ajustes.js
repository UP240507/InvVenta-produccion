// src/components/Ajustes.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { SPINNER_ICON, showNotification, registrarMovimientoEnNube, formatDate } from '../utils/helpers.js';

export function renderAjustesInventario() {
    // Obtenemos el historial de movimientos de la base de datos (solo mermas y ajustes manuales)
    const historialMovimientos = (DB.movimientos || [])
        .filter(m => m.tipo === 'Merma' || m.tipo.includes('Ajuste'))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 8); // Solo mostramos los últimos 8 para no saturar

    return `
        <div class="flex flex-col lg:flex-row gap-6 animate-fade-in mt-4 mb-20 h-full">
            
            <div class="lg:w-1/3 bg-white p-6 md:p-8 rounded-xl border shadow-sm h-fit">
                <div class="flex items-center gap-3 mb-6 border-b pb-4">
                    <div class="bg-red-100 p-2 rounded-lg">
                        <i data-lucide="alert-triangle" class="text-red-600 w-6 h-6"></i>
                    </div>
                    <h2 class="text-xl font-bold text-gray-800">Registrar Merma / Ajuste</h2>
                </div>
                
                <form id="formAjuste" onsubmit="window.registrarAjuste(event)" class="space-y-5">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">1. Selecciona el Producto</label>
                        <select name="pid" class="w-full border p-3 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-400 outline-none transition-colors" required>
                            <option value="">Buscar ingrediente...</option>
                            ${DB.productos.map(p => `<option value="${p.id}">${p.nombre} (Stock actual: ${Number.isInteger(p.stock) ? p.stock : parseFloat(p.stock.toFixed(2))} ${p.unidad})</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">2. Movimiento</label>
                            <select name="tipo" class="w-full border p-3 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-400 outline-none transition-colors" required>
                                <option value="Merma">📉 Merma (Se tiró/echó a perder)</option>
                                <option value="Ajuste-Salida">➖ Ajuste (Falta en inventario)</option>
                                <option value="Ajuste-Entrada">➕ Ajuste (Sobra en inventario)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">3. Cantidad</label>
                            <input name="qty" type="number" step="0.01" min="0.01" class="w-full border p-3 rounded-lg focus:ring-2 focus:ring-red-400 outline-none text-center font-bold text-gray-700" placeholder="0.00" required>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">4. Motivo / Justificación</label>
                        <textarea name="ref" rows="2" class="w-full border p-3 rounded-lg focus:ring-2 focus:ring-red-400 outline-none text-sm" placeholder="Ej: Se cayó la botella, tomate echado a perder, conteo físico del viernes..." required></textarea>
                    </div>
                    
                    <button type="submit" id="btnGuardarAjuste" class="w-full bg-red-600 text-white py-4 rounded-xl font-black hover:bg-red-700 shadow-lg shadow-red-100 transition-transform active:scale-95 flex items-center justify-center gap-2">
                        <i data-lucide="save" class="w-5 h-5"></i> APLICAR AJUSTE
                    </button>
                </form>
            </div>

            <div class="lg:w-2/3 bg-white rounded-xl border shadow-sm flex flex-col">
                <div class="bg-gray-50 px-6 py-4 border-b rounded-t-xl flex justify-between items-center">
                    <h3 class="font-bold text-gray-700 flex items-center gap-2">
                        <i data-lucide="history" class="w-5 h-5 text-gray-400"></i> Últimos movimientos manuales
                    </h3>
                </div>
                
                <div class="flex-1 p-6 overflow-y-auto">
                    ${historialMovimientos.length === 0 ? `
                        <div class="text-center py-12 text-gray-400 flex flex-col items-center">
                            <i data-lucide="clipboard-check" class="w-16 h-16 mb-3 opacity-30"></i>
                            <p class="font-medium">No hay mermas ni ajustes registrados recientemente.</p>
                        </div>
                    ` : `
                        <div class="space-y-4">
                            ${historialMovimientos.map(m => {
                                // Buscamos el nombre del producto en la DB
                                const prod = DB.productos.find(p => p.id === m.producto_id);
                                const nombreProd = prod ? prod.nombre : 'Producto Eliminado';
                                
                                // Colores dependiendo de si fue entrada o salida
                                const esEntrada = m.tipo === 'Ajuste-Entrada';
                                const colorIcono = esEntrada ? 'text-green-500 bg-green-50' : 'text-red-500 bg-red-50';
                                const icono = esEntrada ? 'trending-up' : 'trending-down';
                                const signo = esEntrada ? '+' : '-';

                                return `
                                <div class="flex items-start gap-4 p-4 border rounded-xl hover:shadow-sm transition-shadow">
                                    <div class="${colorIcono} p-3 rounded-lg flex-shrink-0">
                                        <i data-lucide="${icono}" class="w-5 h-5"></i>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex justify-between items-start mb-1">
                                            <p class="font-bold text-gray-800 text-sm md:text-base truncate">${nombreProd}</p>
                                            <p class="font-black ${esEntrada ? 'text-green-600' : 'text-red-600'} text-lg whitespace-nowrap ml-2">
                                                ${signo}${Math.abs(m.cantidad)} ${prod ? prod.unidad : ''}
                                            </p>
                                        </div>
                                        <p class="text-xs text-gray-500 font-medium mb-1">
                                            <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded mr-2 uppercase tracking-wider">${m.tipo}</span> 
                                            ${formatDate(m.fecha)}
                                        </p>
                                        <p class="text-sm text-gray-600 italic mt-2 bg-gray-50 p-2 rounded border border-gray-100">
                                            "${m.referencia || 'Sin justificación'}"
                                        </p>
                                    </div>
                                </div>
                                `
                            }).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Lógica de guardado blindada
window.registrarAjuste = async (e) => {
    e.preventDefault(); 
    
    const form = e.target;
    const btn = form.querySelector('#btnGuardarAjuste'); 
    
    const pid = parseInt(form.pid.value); 
    const qty = parseFloat(form.qty.value); 
    const tipo = form.tipo.value;
    const referencia = form.ref.value.trim();

    // Validaciones de seguridad
    if (!pid) return showNotification('Debes seleccionar un producto', 'error');
    if (isNaN(qty) || qty <= 0) return showNotification('La cantidad debe ser mayor a cero', 'error');
    if (referencia.length < 5) return showNotification('Por favor escribe un motivo más descriptivo', 'error');

    const p = DB.productos.find(x => x.id === pid);
    if (!p) return showNotification('Producto no encontrado en la base de datos', 'error');
    
    // Bloqueamos el botón para evitar doble clic
    btn.disabled = true; 
    btn.innerHTML = SPINNER_ICON + ' PROCESANDO...';
    
    // Si dice "Entrada" suma, de lo contrario resta
    const esEntrada = tipo === 'Ajuste-Entrada';
    const finalQty = esEntrada ? qty : -qty;
    const nuevoStock = parseFloat((p.stock + finalQty).toFixed(3)); // Redondeo para evitar decimales infinitos
    
    if(nuevoStock < 0) {
        showNotification(`No puedes restar ${qty}. El stock actual es solo de ${Number.isInteger(p.stock) ? p.stock : parseFloat(p.stock.toFixed(4))}`, 'error');
        btn.disabled = false; 
        btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> APLICAR AJUSTE';
        if(window.lucide) window.lucide.createIcons();
        return;
    }

    try {
        // 1. Actualizamos el stock en la tabla de productos
        const { error: errProd } = await supabase.from('productos').update({ stock: nuevoStock }).eq('id', pid);
        if(errProd) throw errProd;

        // 2. Registramos el movimiento en el historial (agregando quién lo hizo)
        const usuarioActual = AppState.user?.nombre || 'Sistema';
        const refConUsuario = `${referencia} (Registrado por: ${usuarioActual})`;
        await registrarMovimientoEnNube(tipo, pid, finalQty, refConUsuario);
        
        // 3. Recargamos los datos y limpiamos
        await cargarDatosDeNube();
        showNotification('✅ Ajuste registrado correctamente', 'success');
        
        // Recargamos la pantalla para ver el historial actualizado
        window.render();

    } catch (err) {
        console.error(err);
        showNotification('Error de conexión: ' + err.message, 'error');
        btn.disabled = false; 
        btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> APLICAR AJUSTE';
        if(window.lucide) window.lucide.createIcons();
    }
};