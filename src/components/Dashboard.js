// src/components/Dashboard.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { formatCurrency, showNotification } from '../utils/helpers.js';
import { supabase } from '../api/supabase.js';

// ─── Utilidad de fechas ──────────────────────────────────────────────────────
function hacerCeroHoras(fecha) {
    fecha.setHours(0, 0, 0, 0);
}

function getMinutosAbierta(fechaStr) {
    if (!fechaStr) return 0;
    return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 60000);
}

export function renderDashboard() {
    // ─── CÁLCULOS FINANCIEROS (VENTAS) ──────────────────────────────────────
    const ventas = DB.ventas || [];
    const hoy = new Date();
    hacerCeroHoras(hoy);

    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay()); // Domingo como inicio
    hacerCeroHoras(inicioSemana);

    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // Filtrar ventas por periodo
    const ventasHoy = ventas.filter(v => new Date(v.fecha) >= hoy);
    const ventasSemana = ventas.filter(v => new Date(v.fecha) >= inicioSemana);
    const ventasMes = ventas.filter(v => new Date(v.fecha) >= inicioMes);

    const totalHoy = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
    const totalSemana = ventasSemana.reduce((s, v) => s + (v.total || 0), 0);
    const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);

    // Métrica nueva: Ticket Promedio
    const ticketPromedioMes = ventasMes.length > 0 ? (totalMes / ventasMes.length) : 0;

    // Productos más vendidos (Top 5)
    const conteoVentas = {};
    ventasMes.forEach(v => {
        (v.items || []).forEach(i => {
            conteoVentas[i.nombre] = (conteoVentas[i.nombre] || 0) + i.cantidad;
        });
    });
    const topPlatillos = Object.entries(conteoVentas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // ─── CÁLCULOS DE INVENTARIO ─────────────────────────────────────────────
    const totalValue = DB.productos.reduce((sum, p) => sum + (p.stock * p.precio), 0);
    const lowStock = DB.productos.filter(p => p.stock <= p.min);
    const comprasPendientes = DB.ordenesCompra.filter(o => (o.estado || '').toLowerCase() === 'pendiente').length;
    const hayProductos = DB.productos.length > 0;

    // Últimos movimientos para el feed en tiempo real
    const ultimosMovimientos = (DB.movimientos || []).slice(0, 5);

    // ─── PLATOS PENDIENTES EN MESAS (SISTEMA KDS) ───────────────────────────
    const platosPendientes = [];
    (DB.mesas || []).forEach(m => {
        if (m.estado === 'ocupada' || m.estado === 'por_cobrar') {
            const items = m.orden_actual?.items || [];
            const mins = getMinutosAbierta(m.abierta_en);
            items.forEach((i, idx) => {
                // Solo mostramos los que NO han sido servidos
                if (!i.servido) {
                    platosPendientes.push({
                        mesaId: m.id,
                        mesa: m.nombre,
                        zona: m.zona,
                        nombre: i.nombre,
                        cantidad: i.cantidad,
                        nota: i.nota,
                        tiempo: mins,
                        itemIndex: idx // Guardamos su posición exacta para poder actualizarlo
                    });
                }
            });
        }
    });
    // Ordenar los que llevan más tiempo esperando primero
    platosPendientes.sort((a, b) => b.tiempo - a.tiempo);

    return `
        <div class="space-y-6 animate-fade-in pb-20">
            
            <div>
                <h2 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Métricas de Venta</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                    <div class="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-lg shadow-emerald-500/20 text-white relative overflow-hidden group">
                        <i data-lucide="wallet" class="absolute -right-4 -bottom-4 w-32 h-32 text-white opacity-10 group-hover:scale-110 transition-transform"></i>
                        <p class="font-bold text-emerald-100 uppercase tracking-wide text-xs mb-1">Ingresos Hoy</p>
                        <h3 class="text-4xl font-black">${formatCurrency(totalHoy)}</h3>
                        <p class="text-xs font-medium text-emerald-100 mt-2">${ventasHoy.length} ventas procesadas hoy</p>
                    </div>
                    
                    <div class="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-center relative overflow-hidden">
                        <div class="absolute left-0 top-0 h-full w-1 bg-blue-500"></div>
                        <p class="text-slate-400 font-bold uppercase tracking-wide text-xs mb-1">Esta Semana</p>
                        <h3 class="text-2xl font-black text-slate-800">${formatCurrency(totalSemana)}</h3>
                        <p class="text-xs text-slate-500 mt-1">${ventasSemana.length} tickets en la semana</p>
                    </div>

                    <div class="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-center relative overflow-hidden">
                        <div class="absolute left-0 top-0 h-full w-1 bg-purple-500"></div>
                        <p class="text-slate-400 font-bold uppercase tracking-wide text-xs mb-1">Este Mes</p>
                        <h3 class="text-2xl font-black text-slate-800">${formatCurrency(totalMes)}</h3>
                        <p class="text-xs text-slate-500 mt-1">${ventasMes.length} tickets en el mes</p>
                    </div>

                    <div class="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-center relative overflow-hidden">
                        <div class="absolute left-0 top-0 h-full w-1 bg-orange-500"></div>
                        <p class="text-slate-400 font-bold uppercase tracking-wide text-xs mb-1">Ticket Promedio</p>
                        <h3 class="text-2xl font-black text-slate-800">${formatCurrency(ticketPromedioMes)}</h3>
                        <p class="text-xs text-slate-500 mt-1">Gasto medio por cliente (Mensual)</p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                
                <div class="lg:col-span-2 space-y-6">
                    
                    <div class="bg-white p-6 rounded-2xl border shadow-sm h-80 flex flex-col">
                        <h3 class="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <i data-lucide="trending-up" class="w-4 h-4 text-blue-500"></i> Tendencia de Ventas (Últimos 7 días)
                        </h3>
                        <div class="flex-1 w-full relative">
                            <canvas id="graficoVentasSemana"></canvas>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div class="bg-white p-6 rounded-2xl border shadow-sm flex flex-col h-80">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-bold text-sm text-slate-700 uppercase tracking-wider">Valor Inventario</h3>
                            </div>
                            <div class="flex-1 w-full relative">
                                ${hayProductos 
                                    ? '<canvas id="graficoCategorias"></canvas>' 
                                    : '<div class="h-full flex items-center justify-center text-slate-400 italic text-sm">Sin datos para graficar.</div>'
                                }
                            </div>
                        </div>

                        <div class="bg-white p-6 rounded-2xl border shadow-sm overflow-hidden flex flex-col h-80">
                            <div class="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center">
                                <h3 class="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wider"><i data-lucide="siren" class="w-4 h-4 text-red-500"></i> Desabasto</h3>
                                <button onclick="AppState.currentScreen='compras_crear'; window.render()" class="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-600 hover:bg-slate-200">Abastecer</button>
                            </div>
                            <div class="overflow-y-auto flex-1 custom-scrollbar pr-2 space-y-3">
                                ${lowStock.length ? lowStock.map(p => `
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="font-bold text-slate-700 text-sm">${p.nombre}</p>
                                            <p class="text-[10px] text-slate-400">Mínimo: ${p.min}</p>
                                        </div>
                                        <span class="px-2 py-1 bg-red-100 text-red-600 font-black text-xs rounded-md">${p.stock} ${p.unidad}</span>
                                    </div>
                                `).join('') : `
                                    <div class="h-full flex flex-col items-center justify-center text-slate-400">
                                        <div class="bg-green-50 w-10 h-10 rounded-full flex items-center justify-center mb-2"><i data-lucide="check" class="text-green-500 w-5 h-5"></i></div>
                                        <p class="font-bold text-sm">Inventario Sano</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="space-y-6">
                    
                    <div class="bg-white p-5 rounded-2xl border-2 border-orange-200 shadow-sm flex flex-col h-80 relative overflow-hidden">
                        <div class="absolute right-0 top-0 h-full w-1 bg-orange-400"></div>
                        <h3 class="font-bold text-sm text-orange-600 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-orange-100 pb-2">
                            <i data-lucide="utensils-crossed" class="w-4 h-4"></i> Pendientes (Cocina)
                            <span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] ml-auto">${platosPendientes.length}</span>
                        </h3>
                        <div class="overflow-y-auto flex-1 custom-scrollbar pr-2 space-y-2">
                            ${platosPendientes.length ? platosPendientes.map(p => `
                                <div class="flex items-start justify-between p-3 bg-orange-50/50 rounded-xl border border-orange-100 hover:bg-orange-50 transition-colors group">
                                    <div class="flex-1 pr-2">
                                        <p class="font-black text-slate-800 text-sm leading-tight">${p.cantidad}x ${p.nombre}</p>
                                        <p class="text-[10px] text-slate-500 mt-1 font-bold">📍 ${p.mesa} <span class="font-normal opacity-70">(${p.zona})</span></p>
                                        ${p.nota ? `<p class="text-[10px] text-orange-600 italic mt-0.5 bg-orange-100/50 inline-block px-1.5 rounded">📝 ${p.nota}</p>` : ''}
                                    </div>
                                    <div class="flex flex-col items-end gap-2 flex-shrink-0">
                                        <span class="text-[10px] font-black uppercase tracking-widest ${p.tiempo > 20 ? 'text-red-500 bg-red-100 animate-pulse' : 'text-orange-500 bg-orange-100'} px-2 py-1 rounded-md shadow-sm">
                                            ${p.tiempo} min
                                        </span>
                                        <button onclick="window.marcarPlatoServido('${p.mesaId}', ${p.itemIndex})" class="bg-white border border-green-200 text-green-500 hover:bg-green-50 hover:text-green-600 hover:border-green-400 p-1.5 rounded-lg transition-all shadow-sm group-hover:scale-105" title="Marcar como entregado a la mesa">
                                            <i data-lucide="check" class="w-4 h-4"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('') : `
                                <div class="h-full flex flex-col items-center justify-center text-slate-400">
                                    <div class="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mb-3 opacity-50"><i data-lucide="check-circle" class="text-slate-400 w-6 h-6"></i></div>
                                    <p class="font-bold text-sm text-center">Cocina Libre</p>
                                    <p class="text-[10px] text-center mt-1">No hay comandas pendientes.</p>
                                </div>
                            `}
                        </div>
                    </div>

                    <div class="bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800 text-white">
                        <h3 class="font-bold text-sm text-slate-300 uppercase tracking-wider mb-5 flex items-center gap-2">
                            <i data-lucide="flame" class="w-4 h-4 text-orange-500"></i> Top Platillos
                        </h3>
                        <div class="space-y-4">
                            ${topPlatillos.length ? topPlatillos.map(([nombre, cant], i) => `
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <span class="font-black text-slate-600 text-sm w-4">${i+1}.</span>
                                        <span class="font-bold text-slate-200 text-sm truncate max-w-[120px]" title="${nombre}">${nombre}</span>
                                    </div>
                                    <span class="text-orange-400 font-black text-sm">${cant} <span class="text-[10px] font-normal opacity-50">uds</span></span>
                                </div>
                            `).join('') : '<p class="text-slate-500 text-xs italic">No hay ventas registradas.</p>'}
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl border shadow-sm p-6">
                        <h3 class="font-bold text-sm text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <i data-lucide="activity" class="w-4 h-4 text-slate-400"></i> Feed de Actividad
                        </h3>
                        <div class="space-y-4">
                            ${ultimosMovimientos.length ? ultimosMovimientos.map(m => {
                                const esEntrada = m.tipo.includes('Entrada');
                                const esVenta = m.tipo.includes('Salida') || m.tipo.includes('Venta');
                                const colorIcon = esEntrada ? 'text-green-500 bg-green-50 border-green-100' : (esVenta ? 'text-blue-500 bg-blue-50 border-blue-100' : 'text-red-500 bg-red-50 border-red-100');
                                const icon = esEntrada ? 'arrow-down-to-line' : (esVenta ? 'shopping-bag' : 'trash-2');
                                
                                const p = DB.productos.find(x => String(x.id) === String(m.producto_id));
                                const nombreProd = p ? p.nombre : 'Producto';
                                
                                return `
                                    <div class="flex gap-3">
                                        <div class="w-8 h-8 rounded-full border ${colorIcon} flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
                                        </div>
                                        <div>
                                            <p class="text-xs font-bold text-slate-700 leading-tight">${m.tipo}: <span class="font-normal">${nombreProd}</span></p>
                                            <p class="text-[10px] text-slate-400 mt-0.5">${new Date(m.fecha).toLocaleString('es-MX', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})} · ${m.usuario}</p>
                                        </div>
                                    </div>
                                `;
                            }).join('') : '<p class="text-slate-400 text-xs italic">Sin actividad reciente.</p>'}
                        </div>
                        <button onclick="AppState.currentScreen='reportes'; AppState.reporteActivo='kardex'; window.render()" class="w-full mt-4 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 py-2 rounded-lg transition-colors">
                            Ver todo el historial
                        </button>
                    </div>
                </div>
            </div>

            <div class="pt-4">
                <div class="bg-indigo-900 border border-indigo-800 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
                    <div class="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500 rounded-full opacity-20 blur-3xl"></div>
                    <div class="flex items-start gap-4 relative z-10">
                        <div class="bg-indigo-800/50 p-3 rounded-xl"><i data-lucide="download-cloud" class="w-6 h-6 text-indigo-300"></i></div>
                        <div>
                            <h3 class="font-bold text-white text-lg">Sincronización Externa</h3>
                            <p class="text-sm text-indigo-300 mt-1 max-w-lg">¿Usas otra caja registradora? Sube tu reporte de ventas en CSV al final del día para descontar la materia prima de este sistema automáticamente.</p>
                        </div>
                    </div>
                    <div class="flex items-center w-full md:w-auto relative z-10">
                        <input type="file" id="csvInput" accept=".csv" class="hidden" onchange="window.procesarCSVSoftRestaurant(this)">
                        <button onclick="document.getElementById('csvInput').click()" class="w-full md:w-auto bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-400 transition-all shadow-lg flex justify-center items-center gap-2">
                            <i data-lucide="file-spreadsheet" class="w-5 h-5"></i> Subir CSV de Ventas
                        </button>
                    </div>
                </div>
            </div>

        </div>
    `;
}

// ─── LÓGICA DE GRÁFICAS ───────────────────────────────────────────────────────
window.renderGraficoCategorias = function() {
    if (AppState.currentScreen !== 'dashboard') return;

    const canvasCat = document.getElementById('graficoCategorias');
    if (canvasCat) {
        if(window.chartCat) window.chartCat.destroy();

        setTimeout(() => {
            const ctx = canvasCat.getContext('2d');
            const categorias = {};
            DB.productos.forEach(p => {
                const valor = p.stock * p.precio;
                const nombreCat = p.categoria || p.cat || 'Otros';
                if (valor > 0) categorias[nombreCat] = (categorias[nombreCat] || 0) + valor;
            });

            if (Object.keys(categorias).length > 0) {
                window.chartCat = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(categorias),
                        datasets: [{
                            data: Object.values(categorias),
                            backgroundColor: ['#f97316', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#eab308', '#64748b'],
                            borderWidth: 0,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        responsive: true, 
                        maintainAspectRatio: false,
                        layout: { padding: 10 },
                        plugins: { 
                            legend: { 
                                position: 'right', 
                                labels: { usePointStyle: true, boxWidth: 8, font: {family: "'Inter', sans-serif", size: 10}, color: '#64748b' } 
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.label || '';
                                        if (label) { label += ': '; }
                                        if (context.parsed !== null) {
                                            label += new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(context.parsed);
                                        }
                                        return label;
                                    }
                                }
                            }
                        },
                        cutout: '75%'
                    }
                });
            }
        }, 100);
    }

    const canvasTendencia = document.getElementById('graficoVentasSemana');
    if (canvasTendencia) {
        if(window.chartTendencia) window.chartTendencia.destroy();

        setTimeout(() => {
            const ctx = canvasTendencia.getContext('2d');
            
            const dias = [];
            const ventasPorDia = {};
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const fechaStr = d.toISOString().split('T')[0]; 
                dias.push(d.toLocaleDateString('es-MX', { weekday: 'short' }).toUpperCase());
                ventasPorDia[fechaStr] = 0;
            }

            DB.ventas.forEach(v => {
                const fechaVenta = v.fecha.split('T')[0];
                if (ventasPorDia[fechaVenta] !== undefined) {
                    ventasPorDia[fechaVenta] += (v.total || 0);
                }
            });

            window.chartTendencia = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dias,
                    datasets: [{
                        label: 'Ingresos ($)',
                        data: Object.values(ventasPorDia),
                        borderColor: '#3b82f6', 
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#3b82f6',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4 
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(context.parsed.y);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#f1f5f9', drawBorder: false },
                            ticks: { 
                                color: '#94a3b8',
                                font: { size: 10 },
                                callback: function(value) {
                                    return '$' + value;
                                }
                            }
                        },
                        x: {
                            grid: { display: false, drawBorder: false },
                            ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } }
                        }
                    }
                }
            });
        }, 150);
    }
};

// ─── LÓGICA KDS (Marcar como Servido) ─────────────────────────────────────────
window.marcarPlatoServido = async (mesaId, itemIdx) => {
    const mesa = DB.mesas.find(m => String(m.id) === String(mesaId));
    if (!mesa || !mesa.orden_actual || !mesa.orden_actual.items) return;

    // Modificamos el item específico para que ya no salga en pendientes
    mesa.orden_actual.items[itemIdx].servido = true;

    try {
        const { error } = await supabase.from('mesas')
            .update({ orden_actual: mesa.orden_actual })
            .eq('id', mesaId);
        
        if (error) throw error;
        
        await cargarDatosDeNube(); // Refresca los datos locales
        window.render(); // Redibuja el Dashboard (el platillo desaparecerá de la lista)
        showNotification('Platillo entregado a la mesa', 'success');
    } catch (err) {
        showNotification('Error al actualizar comanda: ' + err.message, 'error');
    }
};

window.procesarCSVSoftRestaurant = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const rows = text.split('\n');
        let procesados = 0; let errores = 0; let logErrores = [];

        showNotification('Analizando archivo...', 'info');

        const cambios = new Map(); 

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i].split(',');
            const codigoSR = row[0] ? row[0].trim() : '';
            const cantidad  = parseFloat(row[2]);

            if (!codigoSR || isNaN(cantidad)) continue;

            const receta = DB.recetas.find(r => r.codigo_pos === codigoSR);
            if (receta) {
                for (const ing of receta.ingredientes) {
                    const prod = DB.productos.find(p => p.id === ing.productoId);
                    if (prod) {
                        const desc = ing.cantidad * cantidad;
                        const entry = cambios.get(prod.id) || { prod, totalDescuento: 0, descripciones: [] };
                        entry.totalDescuento += desc;
                        entry.descripciones.push(`${receta.nombre} x${cantidad}`);
                        cambios.set(prod.id, entry);
                    }
                }
                procesados++;
            } else {
                const producto = DB.productos.find(p => p.codigo === codigoSR);
                if (producto) {
                    const entry = cambios.get(producto.id) || { prod: producto, totalDescuento: 0, descripciones: [] };
                    entry.totalDescuento += cantidad;
                    entry.descripciones.push(`${producto.nombre} x${cantidad}`);
                    cambios.set(producto.id, entry);
                    procesados++;
                } else {
                    errores++; logErrores.push(codigoSR);
                }
            }
        }

        if (procesados === 0) {
            input.value = '';
            if (errores > 0) alert(`No se procesó ningún producto.\n\nCódigos no encontrados: ${logErrores.slice(0,3).join(', ')}`);
            else showNotification('El archivo no contiene datos válidos', 'error');
            return;
        }

        try {
            await Promise.all([...cambios.values()].map(async ({ prod, totalDescuento, descripciones }) => {
                const nuevoStock = prod.stock - totalDescuento;
                const { error } = await supabase.from('productos')
                    .update({ stock: nuevoStock })
                    .eq('id', prod.id);
                if (error) throw new Error(`Error actualizando ${prod.nombre}: ${error.message}`);
                await registrarMovimientoEnNube(
                    'Venta Externa', prod.id, -totalDescuento,
                    `Sincronizado CSV: ${descripciones.join(', ')}`
                );
            }));

            input.value = '';
            await cargarDatosDeNube();
            window.render();

            showNotification(`✅ ${procesados} ventas procesadas y descontadas del inventario.`, 'success');
            if (errores > 0) alert(`Hubo ${errores} códigos en tu archivo que no existen en este sistema.\n\nEjemplos: ${logErrores.slice(0,3).join(', ')}\n\nAsegúrate de que el código POS sea idéntico en ambos sistemas.`);

        } catch (err) {
            console.error('Error aplicando cambios CSV:', err);
            showNotification('Error al aplicar cambios: ' + err.message, 'error');
            input.value = '';
        }
    };
    reader.readAsText(file);
};