// src/components/Reportes.js
import { DB, AppState } from '../store/state.js';
import { formatCurrency, formatDate, getSimpleDate, showNotification } from '../utils/helpers.js';

export function renderReportes() {
    const tab = AppState.reporteActivo || 'valorizacion';
    const start = AppState.reportDateStart;
    const end = AppState.reportDateEnd;

    const filterByDate = (items) => {
        if (!start && !end) return items;
        return items.filter(i => {
            const date = (i.fecha || '').split('T')[0];
            return (!start || date >= start) && (!end || date <= end);
        });
    };

    let contentHTML = `<div id="printArea" class="bg-white p-6 sm:p-8 rounded-2xl border shadow-sm min-h-[500px]">`;
    const headerPDF = `
        <div class="text-center mb-8 pb-4 border-b print-only" style="display:none;">
            <h1 class="text-3xl font-bold text-slate-800">${(DB.configuracion?.nombreEmpresa || DB.configuracion?.nombre_empresa) || 'Mi Negocio'}</h1>
            <p class="text-slate-500 text-sm">Reporte Generado: ${new Date().toLocaleString()}</p>
        </div>`;

    // ── 1. VALORIZACIÓN ──────────────────────────────────────────────────────
    if (tab === 'valorizacion') {
        const totalStock = DB.productos.reduce((acc, p) => acc + (p.stock * p.precio), 0);
        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-blue-100 p-2 rounded-lg"><i data-lucide="circle-dollar-sign" class="text-blue-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Valorización de Inventario</h2>
            </div>
            <p class="text-slate-500 mb-6 pl-12">Dinero congelado en almacén: <b class="text-emerald-600 text-xl ml-2">${formatCurrency(totalStock)}</b></p>
            <div class="overflow-x-auto rounded-xl border">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr><th class="p-4 font-bold">Código</th><th class="p-4 font-bold">Producto</th><th class="p-4 font-bold">Categoría</th><th class="p-4 text-center font-bold">Stock</th><th class="p-4 text-right font-bold">Costo Unit.</th><th class="p-4 text-right font-bold">Total</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${DB.productos.map(p => `
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="p-4 font-mono text-xs text-slate-400">${p.codigo || '---'}</td>
                                <td class="p-4 font-bold text-slate-700">${p.nombre}</td>
                                <td class="p-4 text-slate-500">${p.cat || '---'}</td>
                                <td class="p-4 text-center"><span class="bg-slate-100 px-2 py-1 rounded-md font-bold">${p.stock} <span class="text-xs font-normal">${p.unidad}</span></span></td>
                                <td class="p-4 text-right font-medium text-slate-600">${formatCurrency(p.precio)}</td>
                                <td class="p-4 text-right font-black text-slate-800">${formatCurrency(p.stock * p.precio)}</td>
                            </tr>`).join('')}
                    </tbody>
                    <tfoot class="bg-slate-50 font-black text-slate-800 border-t-2 border-slate-200">
                        <tr><td colspan="5" class="p-4 text-right text-slate-500 uppercase text-xs tracking-widest">Valor Total:</td><td class="p-4 text-right text-lg text-emerald-600">${formatCurrency(totalStock)}</td></tr>
                    </tfoot>
                </table>
            </div>`;
    }

    // ── 2. KARDEX ────────────────────────────────────────────────────────────
    else if (tab === 'kardex') {
        let movs = filterByDate(DB.movimientos);
        movs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-indigo-100 p-2 rounded-lg"><i data-lucide="clock" class="text-indigo-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Kardex Global</h2>
            </div>
            <p class="text-slate-500 mb-6 pl-12">${start || end ? `Mostrando periodo del <b class="text-slate-700">${start||'Inicio'}</b> al <b class="text-slate-700">${end||'Hoy'}</b>` : 'Mostrando historial completo'}</p>
            <div class="overflow-x-auto rounded-xl border">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr><th class="p-4 font-bold">Fecha y Hora</th><th class="p-4 font-bold">Tipo</th><th class="p-4 font-bold">Producto</th><th class="p-4 text-center font-bold">Cant.</th><th class="p-4 font-bold">Ref / Motivo</th><th class="p-4 font-bold">Usuario</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${movs.map(m => {
                            const p = DB.productos.find(x => String(x.id) === String(m.producto_id));
                            const color = m.tipo.includes('Entrada') ? 'text-green-700 bg-green-100' : m.tipo.includes('Merma') ? 'text-red-700 bg-red-100' : 'text-blue-700 bg-blue-100';
                            const signo = m.tipo.includes('Entrada') ? '+' : '';
                            return `<tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="p-4 text-slate-500 font-mono text-xs">${formatDate(m.fecha)}</td>
                                <td class="p-4"><span class="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest font-black ${color}">${m.tipo}</span></td>
                                <td class="p-4 font-bold text-slate-700">${p ? p.nombre : 'Producto Eliminado'}</td>
                                <td class="p-4 text-center font-black ${m.cantidad > 0 ? 'text-green-600' : 'text-red-600'}">${signo}${m.cantidad}</td>
                                <td class="p-4 italic text-slate-500 max-w-xs truncate" title="${m.referencia}">${m.referencia}</td>
                                <td class="p-4 font-medium text-slate-600 text-xs">${m.usuario || 'Sistema'}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // ── 3. PARETO ABC ────────────────────────────────────────────────────────
    else if (tab === 'abc') {
        const totalValor = DB.productos.reduce((acc, p) => acc + (p.stock * p.precio), 0);
        const sorted = [...DB.productos].map(p => ({ ...p, valor: p.stock * p.precio })).sort((a, b) => b.valor - a.valor);
        let ac = 0;
        const data = sorted.map(p => {
            ac += p.valor;
            const pct = (ac / totalValor) * 100;
            return { ...p, pct, cls: pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C', clr: pct <= 80 ? 'bg-emerald-100 text-emerald-800' : pct <= 95 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800' };
        });
        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-purple-100 p-2 rounded-lg"><i data-lucide="bar-chart-horizontal" class="text-purple-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Análisis de Pareto (ABC)</h2>
            </div>
            <p class="text-slate-500 mb-6 pl-12 text-sm">Clasifica el inventario según su impacto económico para priorizar compras y cuidados.</p>
            
            <div class="grid grid-cols-3 gap-4 mb-8 text-center">
                <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm"><b class="text-emerald-700 text-2xl font-black">A</b><p class="text-xs text-emerald-600 uppercase font-bold mt-1">Vital (80% del valor)</p></div>
                <div class="bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-sm"><b class="text-amber-700 text-2xl font-black">B</b><p class="text-xs text-amber-600 uppercase font-bold mt-1">Importante (15%)</p></div>
                <div class="bg-rose-50 p-4 rounded-xl border border-rose-100 shadow-sm"><b class="text-rose-700 text-2xl font-black">C</b><p class="text-xs text-rose-600 uppercase font-bold mt-1">Bajo Impacto (5%)</p></div>
            </div>
            
            <div class="overflow-x-auto rounded-xl border">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr><th class="p-4 font-bold text-center">Clasificación</th><th class="p-4 font-bold">Producto</th><th class="p-4 text-right font-bold">Valor Total</th><th class="p-4 text-right font-bold">% Acumulado</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.map(p => `
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="p-4 text-center"><span class="px-3 py-1 rounded-md font-black text-sm shadow-sm ${p.clr}">${p.cls}</span></td>
                                <td class="p-4 font-bold text-slate-700">${p.nombre}</td>
                                <td class="p-4 text-right font-black text-slate-800">${formatCurrency(p.valor)}</td>
                                <td class="p-4 text-right font-medium text-slate-500">${p.pct.toFixed(2)}%</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // ── 4. MERMAS ────────────────────────────────────────────────────────────
    else if (tab === 'mermas') {
        let mermas = filterByDate(DB.movimientos.filter(m => m.tipo === 'Merma'));
        mermas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        const totalLost = mermas.reduce((acc, m) => {
            const p = DB.productos.find(x => String(x.id) === String(m.producto_id));
            return acc + (Math.abs(m.cantidad) * (p ? p.precio : 0));
        }, 0);
        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-red-100 p-2 rounded-lg"><i data-lucide="trending-down" class="text-red-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Reporte de Mermas</h2>
            </div>
            <p class="text-slate-500 mb-6 pl-12">Pérdida económica estimada: <b class="text-red-600 text-xl ml-2">${formatCurrency(totalLost)}</b></p>
            
            <div class="mb-8 h-72 w-full border rounded-xl p-4 bg-slate-50"><canvas id="graficoMermasReporte"></canvas></div>
            
            <div class="overflow-x-auto rounded-xl border">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr><th class="p-4 font-bold">Fecha</th><th class="p-4 font-bold">Producto</th><th class="p-4 text-center font-bold">Cantidad</th><th class="p-4 text-right font-bold">Costo Perdido</th><th class="p-4 font-bold">Motivo</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${mermas.map(m => {
                            const p = DB.productos.find(x => String(x.id) === String(m.producto_id));
                            return `<tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="p-4 text-slate-500 font-mono text-xs">${formatDate(m.fecha)}</td>
                                <td class="p-4 font-bold text-slate-700">${p ? p.nombre : 'Producto Eliminado'}</td>
                                <td class="p-4 text-center text-red-600 font-black">${Math.abs(m.cantidad)} ${p ? p.unidad : ''}</td>
                                <td class="p-4 text-right font-bold text-slate-800">${formatCurrency(p ? Math.abs(m.cantidad) * p.precio : 0)}</td>
                                <td class="p-4 italic text-slate-500 text-xs">${m.referencia}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;

        setTimeout(() => {
            const canvas = document.getElementById('graficoMermasReporte');
            if (canvas && mermas.length > 0) {
                const ctx = canvas.getContext('2d');
                const dataChart = {};
                mermas.forEach(m => {
                    const p = DB.productos.find(x => String(x.id) === String(m.producto_id));
                    if (p) dataChart[p.nombre] = (dataChart[p.nombre] || 0) + (Math.abs(m.cantidad) * p.precio);
                });
                new window.Chart(ctx, {
                    type: 'bar',
                    data: { labels: Object.keys(dataChart), datasets: [{ label: 'Pérdida ($)', data: Object.values(dataChart), backgroundColor: '#ef4444', borderRadius: 4 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        }, 100);
    }

    // ── 5. HISTORIAL DE VENTAS ───────────────────────────────────────────────
    else if (tab === 'ventas') {
        let ventas = filterByDate(DB.ventas || []);
        ventas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        const totalVentas = ventas.reduce((s, v) => s + (v.total || 0), 0);
        const totalDescuentos = ventas.reduce((s, v) => s + (v.descuento_monto || 0), 0);
        const totalPropinas = ventas.reduce((s, v) => s + (v.propina || 0), 0);
        
        // Separación inteligente de Efectivo vs Tarjeta (Considerando pagos mixtos)
        const totalEfectivo = ventas.reduce((s, v) => {
            if (v.metodo_pago === 'efectivo') return s + (v.total || 0);
            if (v.metodo_pago === 'mixto') return s + (v.efectivo || 0);
            return s;
        }, 0);
        const totalTarjeta = ventas.reduce((s, v) => {
            if (v.metodo_pago === 'tarjeta') return s + (v.total || 0);
            if (v.metodo_pago === 'mixto') return s + (v.tarjeta || 0);
            return s;
        }, 0);

        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-emerald-100 p-2 rounded-lg"><i data-lucide="receipt" class="text-emerald-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Historial de Ventas</h2>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="bg-slate-900 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <i data-lucide="banknote" class="absolute -right-4 -bottom-4 w-24 h-24 text-slate-700 opacity-50"></i>
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest relative z-10">Total Ventas</p>
                    <h3 class="text-2xl font-black mt-1 relative z-10">${formatCurrency(totalVentas)}</h3>
                    <p class="text-[10px] text-slate-500 mt-2 relative z-10">${ventas.length} transacciones</p>
                </div>
                <div class="bg-white p-5 rounded-2xl border shadow-sm relative overflow-hidden">
                    <div class="absolute right-0 top-0 h-full w-1 bg-green-500"></div>
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">En Efectivo</p>
                    <h3 class="text-xl font-black text-slate-800 mt-1">${formatCurrency(totalEfectivo)}</h3>
                </div>
                <div class="bg-white p-5 rounded-2xl border shadow-sm relative overflow-hidden">
                    <div class="absolute right-0 top-0 h-full w-1 bg-blue-500"></div>
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">En Tarjeta</p>
                    <h3 class="text-xl font-black text-slate-800 mt-1">${formatCurrency(totalTarjeta)}</h3>
                </div>
                <div class="bg-white p-5 rounded-2xl border shadow-sm relative overflow-hidden">
                    <div class="absolute right-0 top-0 h-full w-1 bg-orange-500"></div>
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Propinas (Extras)</p>
                    <h3 class="text-xl font-black text-slate-800 mt-1">${formatCurrency(totalPropinas)}</h3>
                </div>
            </div>

            ${ventas.length === 0 ? `
                <div class="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <i data-lucide="receipt" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i>
                    <p class="text-lg font-bold text-slate-500">No hay ventas en este periodo</p>
                </div>` : `
            <div class="overflow-x-auto rounded-xl border">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wider font-bold border-b">
                        <tr>
                            <th class="p-4">Folio / Fecha</th>
                            <th class="p-4">Platillos</th>
                            <th class="p-4 text-center">Método</th>
                            <th class="p-4 text-right">Extras</th>
                            <th class="p-4 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${ventas.map(v => {
                            const items = (v.items || []).map(i => `${i.nombre} x${i.cantidad}`).join(', ');
                            const mColor = v.metodo_pago === 'efectivo' ? 'bg-green-100 text-green-700' :
                                           v.metodo_pago === 'tarjeta' ? 'bg-blue-100 text-blue-700' :
                                           'bg-purple-100 text-purple-700';
                            return `<tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="p-4">
                                    <p class="font-bold text-slate-700 font-mono text-xs">${v.folio || '—'}</p>
                                    <p class="text-[10px] text-slate-500 mt-0.5">${formatDate(v.fecha)}</p>
                                </td>
                                <td class="p-4 text-slate-600 max-w-[200px] truncate text-xs" title="${items}">${items || '—'}</td>
                                <td class="p-4 text-center">
                                    <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${mColor}">${v.metodo_pago}</span>
                                </td>
                                <td class="p-4 text-right text-xs">
                                    ${v.descuento_monto > 0 ? `<p class="text-red-500 font-bold">Desc: -${formatCurrency(v.descuento_monto)}</p>` : ''}
                                    ${v.propina > 0 ? `<p class="text-orange-500 font-bold">Prop: +${formatCurrency(v.propina)}</p>` : ''}
                                    ${v.descuento_monto === 0 && v.propina === 0 ? '<span class="text-slate-300">—</span>' : ''}
                                </td>
                                <td class="p-4 text-right font-black text-slate-800 text-base">${formatCurrency(v.total || 0)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}
        `;
    }

    // ── 6. CIERRE DE CAJA (Ticket Térmico) ──────────────────────────────────
    else if (tab === 'cierre') {
        const fechaCierre = start || getSimpleDate();
        const ventasDia = (DB.ventas || []).filter(v => (v.fecha || '').split('T')[0] === fechaCierre);
        ventasDia.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        const totalDia = ventasDia.reduce((s, v) => s + (v.total || 0), 0);
        const totalEfectivoDia = ventasDia.reduce((s, v) => {
            if (v.metodo_pago === 'efectivo') return s + (v.total || 0);
            if (v.metodo_pago === 'mixto') return s + (v.efectivo || 0);
            return s;
        }, 0);
        const totalTarjetaDia = ventasDia.reduce((s, v) => {
            if (v.metodo_pago === 'tarjeta') return s + (v.total || 0);
            if (v.metodo_pago === 'mixto') return s + (v.tarjeta || 0);
            return s;
        }, 0);
        const totalPropinaDia = ventasDia.reduce((s, v) => s + (v.propina || 0), 0);

        // Platillos más vendidos del día
        const conteoPlatos = {};
        ventasDia.forEach(v => {
            (v.items || []).forEach(i => {
                conteoPlatos[i.nombre] = (conteoPlatos[i.nombre] || 0) + i.cantidad;
            });
        });
        const topPlatos = Object.entries(conteoPlatos).sort((a, b) => b[1] - a[1]).slice(0, 5);

        contentHTML += `
            ${headerPDF}
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div class="flex items-center gap-3">
                    <div class="bg-slate-900 p-2 rounded-lg"><i data-lucide="store" class="text-white w-6 h-6"></i></div>
                    <div>
                        <h2 class="text-2xl font-black text-slate-800">Corte de Caja</h2>
                        <p class="text-sm text-slate-500">Resumen operativo para arqueo de gaveta.</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-3 bg-slate-100 p-2 rounded-xl">
                    <label class="text-xs font-bold text-slate-500 uppercase ml-2">Día a consultar:</label>
                    <input type="date" value="${fechaCierre}" onchange="AppState.reportDateStart=this.value; window.render()" class="border-none bg-white p-2 rounded-lg text-sm font-bold text-slate-700 shadow-sm outline-none cursor-pointer">
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div class="space-y-6">
                    <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                        <i data-lucide="wallet" class="absolute -right-6 -bottom-6 w-32 h-32 text-slate-700 opacity-30"></i>
                        <p class="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1 relative z-10">Ingreso Bruto (Ventas)</p>
                        <h3 class="text-4xl font-black relative z-10">${formatCurrency(totalDia)}</h3>
                        <p class="text-xs text-slate-300 mt-2 relative z-10 bg-slate-800/50 inline-block px-2 py-1 rounded">Basado en ${ventasDia.length} tickets</p>
                    </div>

                    <div class="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
                        <h3 class="font-bold text-slate-400 uppercase text-xs tracking-widest border-b pb-2">Desglose de Arqueo (Metal)</h3>
                        <div class="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-100">
                            <span class="font-bold text-green-700 flex items-center gap-2"><i data-lucide="banknote" class="w-4 h-4"></i> Efectivo en Gaveta</span>
                            <span class="font-black text-green-700 text-lg">${formatCurrency(totalEfectivoDia)}</span>
                        </div>
                        <div class="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <span class="font-bold text-blue-700 flex items-center gap-2"><i data-lucide="credit-card" class="w-4 h-4"></i> Vouchers de Terminal</span>
                            <span class="font-black text-blue-700 text-lg">${formatCurrency(totalTarjetaDia)}</span>
                        </div>
                        <div class="flex justify-between items-center bg-orange-50 p-3 rounded-lg border border-orange-100">
                            <span class="font-bold text-orange-700 flex items-center gap-2"><i data-lucide="coins" class="w-4 h-4"></i> Propinas a repartir</span>
                            <span class="font-black text-orange-700 text-lg">${formatCurrency(totalPropinaDia)}</span>
                        </div>
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="bg-white rounded-2xl border shadow-sm overflow-hidden h-full flex flex-col">
                        <div class="bg-slate-50 px-5 py-4 border-b">
                            <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2"><i data-lucide="flame" class="w-4 h-4 text-orange-500"></i> Lo más vendido hoy</h3>
                        </div>
                        <div class="p-5 flex-1 flex flex-col justify-center">
                            ${topPlatos.length === 0 ? `
                                <div class="text-center text-slate-400">
                                    <i data-lucide="frown" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                                    <p class="text-sm">Aún no hay ventas registradas</p>
                                </div>
                            ` : `
                                <div class="space-y-4">
                                    ${topPlatos.map(([nombre, cant], idx) => `
                                        <div class="flex items-center gap-4">
                                            <span class="w-8 h-8 rounded-full ${idx===0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'} font-black flex items-center justify-center text-xs flex-shrink-0">#${idx + 1}</span>
                                            <div class="flex-1 border-b border-dashed border-slate-200 pb-1 flex justify-between items-end">
                                                <span class="font-bold text-slate-700 text-sm">${nombre}</span>
                                                <span class="font-black text-slate-800">${cant} <span class="text-[10px] text-slate-400 font-normal">uds</span></span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-end pt-4 border-t no-print">
                <button onclick="window.imprimirTicketCierre('${fechaCierre}')" class="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 flex items-center gap-2 shadow-xl hover:-translate-y-1 transition-all">
                    <i data-lucide="printer" class="w-5 h-5"></i> Imprimir Ticket de Corte
                </button>
            </div>
        `;
    }

    contentHTML += `</div>`;

    // ── Tabs de navegación Rediseñadas ───────────────────────────────────────
    const tabsMenu = [
        { id: 'valorizacion', label: 'Dinero Almacén', icon: 'dollar-sign' },
        { id: 'kardex',       label: 'Kardex Global', icon: 'clock' },
        { id: 'abc',          label: 'Análisis ABC', icon: 'bar-chart-2' },
        { id: 'mermas',       label: 'Pérdidas', icon: 'trending-down' },
        { id: 'ventas',       label: 'Historial Ventas', icon: 'receipt' },
        { id: 'cierre',       label: 'Corte de Caja', icon: 'store' },
    ];

    const mostrarFiltroFecha = ['kardex', 'mermas', 'ventas'].includes(tab);

    return `
        <div class="space-y-6 animate-fade-in pb-20 h-full">
            <div class="bg-white p-3 rounded-2xl border shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4">
                
                <div class="flex overflow-x-auto w-full xl:w-auto gap-2 pb-2 xl:pb-0 custom-scrollbar">
                    ${tabsMenu.map(t => `
                        <button onclick="AppState.reporteActivo='${t.id}'; window.render()"
                            class="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${tab === t.id ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}">
                            <i data-lucide="${t.icon}" class="w-4 h-4 ${tab === t.id ? 'text-white' : 'text-slate-400'}"></i>
                            ${t.label}
                        </button>
                    `).join('')}
                </div>

                <div class="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
                    ${mostrarFiltroFecha ? `
                        <div class="flex bg-slate-50 border rounded-xl p-1 gap-1">
                            <input type="date" value="${start}" onchange="AppState.reportDateStart=this.value; window.render()" class="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 cursor-pointer" title="Fecha Inicio">
                            <span class="text-slate-300">|</span>
                            <input type="date" value="${end}" onchange="AppState.reportDateEnd=this.value; window.render()" class="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 cursor-pointer" title="Fecha Fin">
                            <button onclick="AppState.reportDateStart=''; AppState.reportDateEnd=''; window.render()" class="p-1 text-slate-400 hover:text-red-500 rounded bg-white border shadow-sm" title="Limpiar Fechas"><i data-lucide="x" class="w-3 h-3"></i></button>
                        </div>
                    ` : ''}

                    <div class="flex gap-2">
                        <button onclick="window.exportarAExcel('Reporte_${tab}_${getSimpleDate()}')" class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-100 transition-colors flex items-center gap-2 text-xs">
                            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> <span class="hidden sm:inline">Excel</span>
                        </button>
                        <button onclick="window.print()" class="bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2.5 rounded-xl font-bold hover:bg-rose-100 transition-colors flex items-center gap-2 text-xs">
                            <i data-lucide="printer" class="w-4 h-4"></i> <span class="hidden sm:inline">PDF</span>
                        </button>
                    </div>
                </div>
            </div>

            ${contentHTML}
        </div>
    `;
}

// ─── IMPRIMIR TICKET TÉRMICO DE CIERRE DE CAJA ─────────────────────────────
window.imprimirTicketCierre = (fechaCierre) => {
    const ventasDia = (DB.ventas || []).filter(v => (v.fecha || '').split('T')[0] === fechaCierre);
    const mermasDia = (DB.movimientos || []).filter(m => m.tipo === 'Merma' && (m.fecha || '').split('T')[0] === fechaCierre);

    const totalVentas = ventasDia.reduce((s, v) => s + (v.total || 0), 0);
    const totalEfectivo = ventasDia.reduce((s, v) => s + (v.metodo_pago === 'efectivo' ? v.total : (v.metodo_pago === 'mixto' ? v.efectivo : 0)), 0);
    const totalTarjeta = ventasDia.reduce((s, v) => s + (v.metodo_pago === 'tarjeta' ? v.total : (v.metodo_pago === 'mixto' ? v.tarjeta : 0)), 0);
    const propinas = ventasDia.reduce((s, v) => s + (v.propina || 0), 0);
    const mermasPesos = mermasDia.reduce((s, m) => {
        const p = DB.productos.find(x => String(x.id) === String(m.producto_id));
        return s + (Math.abs(m.cantidad) * (p ? p.precio : 0));
    }, 0);

    const empresa = DB.configuracion?.nombreEmpresa || 'Restaurante';

    const ticketHTML = `
        <html><head><style>
            body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; color: #000; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .title { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 5px; text-transform: uppercase; }
            @media print { body { width: 100%; } }
        </style></head>
        <body>
            <div class="title">${empresa}</div>
            <div class="center bold">*** CORTE DE CAJA ***</div>
            <div class="center" style="font-size: 10px; margin-top: 3px;">Fecha Op: ${fechaCierre}</div>
            <div class="center" style="font-size: 10px;">Impreso: ${new Date().toLocaleString('es-MX')}</div>
            <div class="center" style="font-size: 10px;">Cajero: ${AppState.user?.nombre || 'Admin'}</div>
            
            <div class="line"></div>
            <div class="center bold" style="margin-bottom: 5px;">RESUMEN DE VENTAS</div>
            <div class="row"><span>Total Tickets:</span><span>${ventasDia.length}</span></div>
            <div class="row bold" style="font-size: 14px; margin-top: 8px;"><span>VENTA TOTAL:</span><span>${formatCurrency(totalVentas)}</span></div>
            
            <div class="line"></div>
            <div class="center bold" style="margin-bottom: 5px;">ARQUEO DE CAJA</div>
            <div class="row"><span>Efectivo Físico:</span><span>${formatCurrency(totalEfectivo)}</span></div>
            <div class="row"><span>Vouchers (Tarjeta):</span><span>${formatCurrency(totalTarjeta)}</span></div>
            
            <div class="line"></div>
            <div class="center bold" style="margin-bottom: 5px;">EXTRAS DEL DÍA</div>
            <div class="row"><span>Propinas Meseros:</span><span>${formatCurrency(propinas)}</span></div>
            <div class="row"><span>Pérdida (Mermas):</span><span>-${formatCurrency(mermasPesos)}</span></div>
            
            <div class="line"></div>
            <div class="center" style="margin-top: 30px; font-size: 10px;">
                Firma de Conformidad<br><br><br>
                _________________________<br>
                Gerencia / Auditoría
            </div>
        </body></html>
    `;

    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) {
        win.document.write(ticketHTML);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    }
};