// src/components/Dashboard.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { formatCurrency, showNotification, registrarMovimientoEnNube } from '../utils/helpers.js';
import { supabase } from '../api/supabase.js';

// ─── Utilidad de fechas ──────────────────────────────────────────────────────
function hacerCeroHoras(fecha) {
    fecha.setHours(0, 0, 0, 0);
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

    // Productos más vendidos (Top 3)
    const conteoVentas = {};
    ventasMes.forEach(v => {
        (v.items || []).forEach(i => {
            conteoVentas[i.nombre] = (conteoVentas[i.nombre] || 0) + i.cantidad;
        });
    });
    const topPlatillos = Object.entries(conteoVentas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    // ─── CÁLCULOS DE INVENTARIO ─────────────────────────────────────────────
    const totalValue = DB.productos.reduce((sum, p) => sum + (p.stock * p.precio), 0);
    const lowStock = DB.productos.filter(p => p.stock <= p.min);
    const comprasPendientes = DB.ordenesCompra.filter(o => (o.estado || '').toLowerCase() === 'pendiente').length;
    const hayProductos = DB.productos.length > 0;

    return `
        <div class="space-y-6 animate-fade-in pb-20">
            
            <div>
                <h2 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Ingresos por Ventas POS</h2>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    <div class="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-lg shadow-emerald-500/20 text-white relative overflow-hidden group">
                        <i data-lucide="banknote" class="absolute -right-4 -bottom-4 w-32 h-32 text-white opacity-10 group-hover:scale-110 transition-transform"></i>
                        <p class="font-bold text-emerald-100 uppercase tracking-wide text-sm mb-1">Hoy</p>
                        <h3 class="text-4xl font-black">${formatCurrency(totalHoy)}</h3>
                        <p class="text-sm text-emerald-100 mt-2">${ventasHoy.length} tickets generados</p>
                    </div>
                    
                    <div class="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-center relative overflow-hidden">
                        <div class="absolute left-0 top-0 h-full w-1 bg-blue-500"></div>
                        <p class="text-slate-400 font-bold uppercase tracking-wide text-sm mb-1">Esta Semana</p>
                        <h3 class="text-3xl font-black text-slate-800">${formatCurrency(totalSemana)}</h3>
                    </div>

                    <div class="bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-center relative overflow-hidden">
                        <div class="absolute left-0 top-0 h-full w-1 bg-purple-500"></div>
                        <p class="text-slate-400 font-bold uppercase tracking-wide text-sm mb-1">Este Mes</p>
                        <h3 class="text-3xl font-black text-slate-800">${formatCurrency(totalMes)}</h3>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                
                <div class="lg:col-span-2 space-y-6">
                    <h2 class="text-sm font-black text-slate-400 uppercase tracking-widest">Salud del Inventario</h2>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div class="bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                            <div class="absolute right-0 top-0 h-full w-1 bg-slate-800"></div>
                            <div class="flex justify-between items-start">
                                <div><p class="text-slate-500 text-xs font-bold uppercase tracking-widest">Dinero Congelado</p><h3 class="text-2xl font-black text-slate-800 mt-1">${formatCurrency(totalValue)}</h3></div>
                                <div class="bg-slate-100 p-3 rounded-xl"><i data-lucide="boxes" class="text-slate-600 w-5 h-5"></i></div>
                            </div>
                        </div>
                        <div class="bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden cursor-pointer group" onclick="AppState.currentScreen='entradas_mercancia'; window.render()">
                            <div class="absolute right-0 top-0 h-full w-1 bg-yellow-500"></div>
                            <div class="flex justify-between items-start">
                                <div><p class="text-slate-500 text-xs font-bold uppercase tracking-widest group-hover:text-yellow-600 transition-colors">Órdenes en tránsito</p><h3 class="text-2xl font-black text-slate-800 mt-1">${comprasPendientes}</h3></div>
                                <div class="bg-yellow-50 p-3 rounded-xl"><i data-lucide="truck" class="text-yellow-600 w-5 h-5"></i></div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
                        <div class="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                            <h3 class="font-bold text-slate-800 flex items-center gap-2"><i data-lucide="siren" class="w-5 h-5 text-red-500"></i> Alertas de Desabasto</h3>
                            <button onclick="AppState.currentScreen='compras_crear'; window.render()" class="text-xs bg-white border px-3 py-1.5 rounded-lg text-slate-600 font-bold hover:bg-slate-100 transition-colors">Abastecer</button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead class="bg-white text-slate-400 text-xs uppercase border-b"><tr><th class="px-6 py-3 text-left font-bold">Ingrediente</th><th class="px-6 py-3 text-center font-bold">Actual</th><th class="px-6 py-3 text-center font-bold">Mínimo</th></tr></thead>
                                <tbody>
                                    ${lowStock.length ? lowStock.slice(0,4).map(p => `
                                        <tr class="border-b border-slate-50 hover:bg-red-50/50 transition-colors">
                                            <td class="px-6 py-3 font-bold text-slate-700">${p.nombre}</td>
                                            <td class="px-6 py-3 text-center font-black text-red-500">${p.stock} <span class="text-xs text-red-300">${p.unidad}</span></td>
                                            <td class="px-6 py-3 text-center text-slate-400 font-medium">${p.min}</td>
                                        </tr>
                                    `).join('') : `
                                        <tr><td colspan="3" class="p-10 text-center text-slate-400">
                                            <div class="bg-green-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"><i data-lucide="check" class="text-green-500 w-6 h-6"></i></div>
                                            <p class="font-bold">Inventario Sano</p>
                                            <p class="text-xs mt-1">Ningún producto por debajo del mínimo.</p>
                                        </td></tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="space-y-6">
                    <h2 class="text-sm font-black text-slate-400 uppercase tracking-widest hidden lg:block">Distribución</h2>
                    
                    <div class="bg-white p-6 rounded-2xl border shadow-sm flex flex-col h-[320px]">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-sm text-slate-700 uppercase tracking-wider">Valor por Categoría</h3>
                        </div>
                        <div class="flex-1 w-full relative">
                            ${hayProductos 
                                ? '<canvas id="graficoCategorias"></canvas>' 
                                : '<div class="h-full flex items-center justify-center text-slate-400 italic text-sm">Sin datos para graficar.</div>'
                            }
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-2xl border shadow-sm">
                        <h3 class="font-bold text-sm text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <i data-lucide="medal" class="w-4 h-4 text-orange-500"></i> Top Platillos del Mes
                        </h3>
                        <div class="space-y-3">
                            ${topPlatillos.length ? topPlatillos.map(([nombre, cant], i) => `
                                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div class="flex items-center gap-3">
                                        <span class="font-black text-slate-300 text-lg">#${i+1}</span>
                                        <span class="font-bold text-slate-700 text-sm">${nombre}</span>
                                    </div>
                                    <span class="bg-orange-100 text-orange-700 text-xs font-black px-2 py-1 rounded">${cant} uds</span>
                                </div>
                            `).join('') : '<p class="text-slate-400 text-xs text-center py-4 italic">No hay ventas registradas este mes.</p>'}
                        </div>
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

// ─── LÓGICA DE GRÁFICA ────────────────────────────────────────────────────────
window.renderGraficoCategorias = function() {
    const canvas = document.getElementById('graficoCategorias');
    if (!canvas) return;
    
    // Si la gráfica ya existía, la destruimos para evitar "fantasmas" al redibujar
    if(window.chartCat) window.chartCat.destroy();

    // Pequeño timeout para asegurar que el canvas ya se pintó en el HTML
    setTimeout(() => {
        const ctx = canvas.getContext('2d');
        const categorias = {};
        DB.productos.forEach(p => {
            const valor = p.stock * p.precio;
            // Usamos p.categoria si existe, si no, usamos p.cat o "Sin clasificar"
            const nombreCat = p.categoria || p.cat || 'Otros';
            if (valor > 0) categorias[nombreCat] = (categorias[nombreCat] || 0) + valor;
        });

        if (Object.keys(categorias).length === 0) return;
        
        const esCelular = window.innerWidth < 768;

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
                        position: esCelular ? 'bottom' : 'right', 
                        labels: { usePointStyle: true, boxWidth: 8, font: {family: "'Inter', sans-serif", size: 11}, color: '#64748b' } 
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
                cutout: '75%' // Hace la dona más delgada y elegante
            }
        });
    }, 100);
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

        // ── FIX B-06: Acumular cambios en memoria antes de escribir ─────────
        const cambios = new Map(); // productoId → { prod, totalDescuento, descripciones[] }

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

        // ── Aplicar todos los cambios en paralelo ────────────────────────────
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
        // ─────────────────────────────────────────────────────────────────────
    };
    reader.readAsText(file);
};