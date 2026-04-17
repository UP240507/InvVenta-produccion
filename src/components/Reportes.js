// src/components/Reportes.js
import { DB, AppState } from '../store/state.js';
import {calcularCostoReceta} from '../components/Recetas.js';
import { formatCurrency, formatDate, getSimpleDate, showNotification } from '../utils/helpers.js';

export function renderReportes() {
    const tab = AppState.reporteActivo || 'valorizacion';
    const start = AppState.reportDateStart;
    const end = AppState.reportDateEnd;
    const filtroMesero = AppState.reporteMesero || '';
    const turnoIdSeleccionado = AppState.reporteTurnoId || (DB.turnos && DB.turnos.length > 0 ? DB.turnos[0].id : null);

    const fmtCant = (cant) => parseFloat(Number(cant).toFixed(2));

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
                <table id="tablaReporte" class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr><th class="p-4 font-bold">Código</th><th class="p-4 font-bold">Producto</th><th class="p-4 font-bold">Categoría</th><th class="p-4 text-center font-bold">Stock</th><th class="p-4 text-right font-bold">Costo Unit.</th><th class="p-4 text-right font-bold">Total</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${DB.productos.map(p => `
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="p-4 font-mono text-xs text-slate-400">${p.codigo || '---'}</td>
                                <td class="p-4 font-bold text-slate-700">${p.nombre}</td>
                                <td class="p-4 text-slate-500">${p.cat || '---'}</td>
                                <td class="p-4 text-center"><span class="bg-slate-100 px-2 py-1 rounded-md font-bold">${fmtCant(p.stock)} <span class="text-xs font-normal">${p.unidad}</span></span></td>
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
                <table id="tablaReporte" class="w-full text-sm text-left">
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
                                <td class="p-4 text-center font-black ${m.cantidad > 0 ? 'text-green-600' : 'text-red-600'}">${signo}${fmtCant(m.cantidad)}</td>
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
        const ventasPeriodo = filterByDate(DB.ventas || []);
        const ingresosObj = {};
        let totalIngresosABC = 0;
        ventasPeriodo.forEach(v => {
            (v.items || []).forEach(item => {
                if (!ingresosObj[item.nombre]) ingresosObj[item.nombre] = { nombre: item.nombre, cantVendida: 0, ingresos: 0 };
                ingresosObj[item.nombre].cantVendida += item.cantidad;
                const montoLinea = item.subtotal || (item.cantidad * item.precio);
                ingresosObj[item.nombre].ingresos += montoLinea;
                totalIngresosABC += montoLinea;
            });
        });
        const sortedABC = Object.values(ingresosObj).sort((a, b) => b.ingresos - a.ingresos);
        let ac = 0;
        const data = sortedABC.map(p => {
            ac += p.ingresos;
            const pct = totalIngresosABC > 0 ? (ac / totalIngresosABC) * 100 : 0;
            return { ...p, pct, cls: pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C', clr: pct <= 80 ? 'bg-emerald-100 text-emerald-800' : pct <= 95 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800' };
        });
        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-purple-100 p-2 rounded-lg"><i data-lucide="bar-chart-horizontal" class="text-purple-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Análisis de Pareto (ABC)</h2>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-8 text-center">
                <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100"><b class="text-emerald-700 text-2xl font-black">A</b><p class="text-xs text-emerald-600 uppercase font-bold mt-1">Vitales (80%)</p></div>
                <div class="bg-amber-50 p-4 rounded-xl border border-amber-100"><b class="text-amber-700 text-2xl font-black">B</b><p class="text-xs text-amber-600 uppercase font-bold mt-1">Importantes (15%)</p></div>
                <div class="bg-rose-50 p-4 rounded-xl border border-rose-100"><b class="text-rose-700 text-2xl font-black">C</b><p class="text-xs text-rose-600 uppercase font-bold mt-1">Baja Rotación (5%)</p></div>
            </div>
            ${data.length === 0 ? `<div class="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed"><p class="font-bold">No hay ventas en este periodo.</p></div>` : `
            <div class="overflow-x-auto rounded-xl border">
                <table id="tablaReporte" class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr><th class="p-4 font-bold text-center">Cat</th><th class="p-4 font-bold">Platillo</th><th class="p-4 text-center font-bold">Vendidas</th><th class="p-4 text-right font-bold">Ingresos</th><th class="p-4 text-right font-bold">% Acum.</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.map(p => `<tr class="hover:bg-slate-50/50">
                            <td class="p-4 text-center"><span class="px-3 py-1 rounded-md font-black text-sm ${p.clr}">${p.cls}</span></td>
                            <td class="p-4 font-bold text-slate-700">${p.nombre}</td>
                            <td class="p-4 text-center text-slate-500 font-bold">${fmtCant(p.cantVendida)}</td>
                            <td class="p-4 text-right font-black text-slate-800">${formatCurrency(p.ingresos)}</td>
                            <td class="p-4 text-right font-medium text-slate-500">${p.pct.toFixed(2)}%</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`}`;
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
                <table id="tablaReporte" class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr><th class="p-4 font-bold">Fecha</th><th class="p-4 font-bold">Producto</th><th class="p-4 text-center font-bold">Cantidad</th><th class="p-4 text-right font-bold">Costo Perdido</th><th class="p-4 font-bold">Motivo</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${mermas.map(m => {
                            const p = DB.productos.find(x => String(x.id) === String(m.producto_id));
                            return `<tr class="hover:bg-slate-50/50">
                                <td class="p-4 text-slate-500 font-mono text-xs">${formatDate(m.fecha)}</td>
                                <td class="p-4 font-bold text-slate-700">${p ? p.nombre : 'Producto Eliminado'}</td>
                                <td class="p-4 text-center text-red-600 font-black">${fmtCant(Math.abs(m.cantidad))} ${p ? p.unidad : ''}</td>
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
                if (window.chartMermasReporte) window.chartMermasReporte.destroy();
                window.chartMermasReporte = new window.Chart(ctx, {
                    type: 'bar',
                    data: { labels: Object.keys(dataChart), datasets: [{ label: 'Pérdida ($)', data: Object.values(dataChart), backgroundColor: '#ef4444', borderRadius: 4 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        }, 100);
    }

    // ── 5. HISTORIAL DE VENTAS ────────────────────────────────────────────────
    else if (tab === 'ventas') {
        let ventas = filterByDate(DB.ventas || []);
        if (filtroMesero) ventas = ventas.filter(v => v.usuario === filtroMesero);
        ventas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        const totalVentas   = ventas.reduce((s, v) => s + (v.total || 0), 0);
        const totalPropinas = ventas.reduce((s, v) => s + (v.propina || 0), 0);
        const totalEfectivo = ventas.reduce((s, v) => v.metodo_pago==='efectivo' ? s+v.total : v.metodo_pago==='mixto' ? s+(v.efectivo||0) : s, 0);
        const totalTarjeta  = ventas.reduce((s, v) => v.metodo_pago==='tarjeta'  ? s+v.total : v.metodo_pago==='mixto' ? s+(v.tarjeta ||0) : s, 0);
        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-emerald-100 p-2 rounded-lg"><i data-lucide="receipt" class="text-emerald-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Historial de Ventas</h2>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="bg-slate-900 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Ventas</p>
                    <h3 class="text-2xl font-black mt-1">${formatCurrency(totalVentas)}</h3>
                    <p class="text-[10px] text-slate-500 mt-2">${ventas.length} transacciones</p>
                </div>
                <div class="bg-white p-5 rounded-2xl border shadow-sm relative overflow-hidden">
                    <div class="absolute right-0 top-0 h-full w-1 bg-green-500"></div>
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">En Efectivo</p>
                    <h3 class="text-xl font-black text-slate-800 mt-1">${formatCurrency(totalEfectivo)}</h3>
                </div>
                <div class="bg-white p-5 rounded-2xl border shadow-sm relative overflow-hidden hidden sm:block">
                    <div class="absolute right-0 top-0 h-full w-1 bg-blue-500"></div>
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">En Tarjeta</p>
                    <h3 class="text-xl font-black text-slate-800 mt-1">${formatCurrency(totalTarjeta)}</h3>
                </div>
                <div class="bg-white p-5 rounded-2xl border shadow-sm relative overflow-hidden">
                    <div class="absolute right-0 top-0 h-full w-1 bg-orange-500"></div>
                    <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Propinas</p>
                    <h3 class="text-xl font-black text-slate-800 mt-1">${formatCurrency(totalPropinas)}</h3>
                </div>
            </div>
            ${ventas.length === 0 ? `<div class="text-center py-16 bg-slate-50 rounded-2xl border border-dashed"><p class="text-lg font-bold text-slate-500">No hay ventas en este periodo</p></div>` : `
            <div class="overflow-x-auto rounded-xl border">
                <table id="tablaReporte" class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wider font-bold border-b">
                        <tr><th class="p-4">Cajero / Fecha</th><th class="p-4">Folio</th><th class="p-4">Platillos</th><th class="p-4 text-center">Método</th><th class="p-4 text-right">Extras</th><th class="p-4 text-right">Total</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${ventas.map(v => {
                            const items = (v.items||[]).map(i => `${i.nombre} x${fmtCant(i.cantidad)}`).join(', ');
                            const mColor = v.metodo_pago==='efectivo' ? 'bg-green-100 text-green-700' : v.metodo_pago==='tarjeta' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
                            return `<tr class="hover:bg-slate-50/50">
                                <td class="p-4"><p class="font-bold text-slate-800 text-xs">${v.usuario||'Sistema'}</p><p class="text-[10px] text-slate-500">${formatDate(v.fecha)}</p></td>
                                <td class="p-4 font-mono text-xs text-slate-500">${v.folio||'—'}</td>
                                <td class="p-4 text-slate-600 max-w-[200px] truncate text-xs">${items||'—'}</td>
                                <td class="p-4 text-center"><span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${mColor}">${v.metodo_pago}</span></td>
                                <td class="p-4 text-right text-xs">
                                    ${v.descuento_monto > 0 ? `<p class="text-red-500 font-bold">-${formatCurrency(v.descuento_monto)}</p>` : ''}
                                    ${v.propina > 0 ? `<p class="text-orange-500 font-bold">+${formatCurrency(v.propina)}</p>` : ''}
                                    ${!v.descuento_monto && !v.propina ? '<span class="text-slate-300">—</span>' : ''}
                                </td>
                                <td class="p-4 text-right font-black text-slate-800">${formatCurrency(v.total||0)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}`;
    }

    // ── 6. AUDITORÍA DE TURNOS ────────────────────────────────────────────────
    else if (tab === 'cierre') {
        const turnos = DB.turnos || [];
        const turnoSeleccionado = turnos.find(t => String(t.id) === String(turnoIdSeleccionado)) || turnos[0];
        let ventasTurno = [], mermasTurno = [];
        if (turnoSeleccionado) {
            const inicio = new Date(turnoSeleccionado.fecha_apertura);
            const fin = turnoSeleccionado.fecha_cierre ? new Date(turnoSeleccionado.fecha_cierre) : new Date();
            ventasTurno = (DB.ventas||[]).filter(v => { const d=new Date(v.fecha); return d>=inicio && d<=fin; });
            mermasTurno = (DB.movimientos||[]).filter(m => { const d=new Date(m.fecha); return m.tipo==='Merma' && d>=inicio && d<=fin; });
        }
        const totalVentas   = ventasTurno.reduce((s,v) => s+(v.total||0), 0);
        const totalEfectivo = ventasTurno.reduce((s,v) => s+(v.metodo_pago==='efectivo'?v.total:v.metodo_pago==='mixto'?(v.efectivo||0):0), 0);
        const totalTarjeta  = ventasTurno.reduce((s,v) => s+(v.metodo_pago==='tarjeta' ?v.total:v.metodo_pago==='mixto'?(v.tarjeta ||0):0), 0);
        const propinas      = ventasTurno.reduce((s,v) => s+(v.propina||0), 0);
        const conteoPlatos  = {};
        ventasTurno.forEach(v => { (v.items||[]).forEach(i => { conteoPlatos[i.nombre]=(conteoPlatos[i.nombre]||0)+i.cantidad; }); });
        const topPlatos = Object.entries(conteoPlatos).sort((a,b)=>b[1]-a[1]).slice(0,5);

        contentHTML += `
            ${headerPDF}
            ${AppState.turnoActivo && turnoSeleccionado && AppState.turnoActivo.id===turnoSeleccionado.id ? `
            <div class="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div><p class="font-black text-blue-800 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Turno Abierto</p></div>
                <button onclick="window.abrirModalCierreTurno()" class="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2">
                    <i data-lucide="lock" class="w-4 h-4"></i> Realizar Arqueo y Cerrar
                </button>
            </div>` : ''}
            <div class="flex items-center gap-3 mb-8">
                <div class="bg-slate-900 p-2 rounded-lg"><i data-lucide="store" class="text-white w-6 h-6"></i></div>
                <div><h2 class="text-2xl font-black text-slate-800">Auditoría de Turnos</h2><p class="text-sm text-slate-500">Revisa los Cortes Z históricos.</p></div>
            </div>
            ${!turnoSeleccionado ? `<div class="text-center py-16 text-slate-400"><p class="font-bold text-lg">No hay turnos registrados</p></div>` : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div class="space-y-6">
                    <div class="bg-white border-2 ${turnoSeleccionado.estado==='abierto'?'border-blue-200':'border-slate-200'} rounded-2xl p-5 shadow-sm">
                        <h3 class="font-black text-slate-800 text-lg mb-4">Turno de ${turnoSeleccionado.usuario}</h3>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between"><span class="text-slate-400 text-xs uppercase font-bold">Apertura:</span><span>${new Date(turnoSeleccionado.fecha_apertura).toLocaleString('es-MX')}</span></div>
                            <div class="flex justify-between"><span class="text-slate-400 text-xs uppercase font-bold">Cierre:</span><span>${turnoSeleccionado.fecha_cierre ? new Date(turnoSeleccionado.fecha_cierre).toLocaleString('es-MX') : '<span class="text-blue-500 font-bold italic">En Progreso</span>'}</span></div>
                        </div>
                        ${turnoSeleccionado.estado==='cerrado' ? `
                        <div class="mt-4 pt-4 border-t flex justify-between">
                            <span class="text-xs font-bold text-slate-500 uppercase">Estado del Corte:</span>
                            <span class="font-black text-sm ${turnoSeleccionado.diferencia<-0.1?'text-red-500':turnoSeleccionado.diferencia>0.1?'text-orange-500':'text-green-600'}">
                                ${turnoSeleccionado.diferencia<-0.1?`Faltante ${formatCurrency(Math.abs(turnoSeleccionado.diferencia))}`:turnoSeleccionado.diferencia>0.1?`Sobrante ${formatCurrency(turnoSeleccionado.diferencia)}`:'Cuadre Perfecto ✓'}
                            </span>
                        </div>` : ''}
                    </div>
                    <div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
                        <p class="text-slate-400 text-xs font-bold uppercase mb-1">Ingreso Bruto</p>
                        <h3 class="text-4xl font-black">${formatCurrency(totalVentas)}</h3>
                        <p class="text-xs text-slate-300 mt-2">${ventasTurno.length} tickets</p>
                    </div>
                    <div class="bg-white rounded-2xl border shadow-sm p-6 space-y-3">
                        <h3 class="font-bold text-slate-400 uppercase text-xs tracking-widest border-b pb-2">Arqueo</h3>
                        <div class="flex justify-between bg-slate-50 p-2 rounded-lg border border-slate-100"><span class="text-xs font-bold text-slate-600">Fondo Inicial</span><span class="font-black">${formatCurrency(turnoSeleccionado.fondo_inicial)}</span></div>
                        <div class="flex justify-between bg-green-50 p-2 rounded-lg border border-green-100"><span class="text-xs font-bold text-green-700">Efectivo Ventas</span><span class="font-black text-green-700">+${formatCurrency(totalEfectivo)}</span></div>
                        <div class="flex justify-between bg-blue-50 p-2 rounded-lg border border-blue-100"><span class="text-xs font-bold text-blue-700">Vouchers Tarjeta</span><span class="font-black text-blue-700">${formatCurrency(totalTarjeta)}</span></div>
                    </div>
                </div>
                <div>
                    <div class="bg-white rounded-2xl border shadow-sm overflow-hidden">
                        <div class="bg-slate-50 px-5 py-4 border-b"><h3 class="font-bold text-slate-700 text-sm flex items-center gap-2"><i data-lucide="flame" class="w-4 h-4 text-orange-500"></i> Lo más vendido</h3></div>
                        <div class="p-5">
                            ${topPlatos.length===0 ? `<div class="text-center text-slate-400 py-6 text-sm">Sin ventas</div>` : `
                            <div class="space-y-4">
                                ${topPlatos.map(([nombre,cant],idx) => `
                                <div class="flex items-center gap-4">
                                    <span class="w-8 h-8 rounded-full ${idx===0?'bg-amber-100 text-amber-600':'bg-slate-100 text-slate-500'} font-black flex items-center justify-center text-xs">#${idx+1}</span>
                                    <div class="flex-1 border-b border-dashed border-slate-200 pb-1 flex justify-between">
                                        <span class="font-bold text-slate-700 text-sm">${nombre}</span>
                                        <span class="font-black text-slate-800">${fmtCant(cant)} uds</span>
                                    </div>
                                </div>`).join('')}
                            </div>`}
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex justify-end pt-4 border-t">
                <button onclick="window.imprimirTicketCierre('${turnoSeleccionado.id}')" class="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 flex items-center gap-2">
                    <i data-lucide="printer" class="w-5 h-5"></i> Imprimir Ticket
                </button>
            </div>`}`;
    }

    // ── 7. RENDIMIENTO POR TURNO Y MESERO (NUEVO) ─────────────────────────────
    else if (tab === 'turno_mesero') {
        const turnos = DB.turnos || [];
        const turnoSel = turnos.find(t => String(t.id) === String(turnoIdSeleccionado)) || turnos[0];

        let ventasTurno = [];
        if (turnoSel) {
            const inicio = new Date(turnoSel.fecha_apertura);
            const fin = turnoSel.fecha_cierre ? new Date(turnoSel.fecha_cierre) : new Date();
            ventasTurno = (DB.ventas||[]).filter(v => { const d=new Date(v.fecha); return d>=inicio && d<=fin; });
        }

        const porMesero = {};
        ventasTurno.forEach(v => {
            const user = v.usuario || 'Sistema';
            if (!porMesero[user]) porMesero[user] = { total:0, efectivo:0, tarjeta:0, propinas:0, tickets:0 };
            porMesero[user].total    += v.total || 0;
            porMesero[user].efectivo += v.metodo_pago==='efectivo'?v.total:v.metodo_pago==='mixto'?(v.efectivo||0):0;
            porMesero[user].tarjeta  += v.metodo_pago==='tarjeta' ?v.total:v.metodo_pago==='mixto'?(v.tarjeta ||0):0;
            porMesero[user].propinas += v.propina || 0;
            porMesero[user].tickets  += 1;
        });

        const meserosSorted = Object.entries(porMesero).sort((a,b) => b[1].total - a[1].total);
        const granTotal = ventasTurno.reduce((s,v) => s+(v.total||0), 0);
        const ventasDetalle = filtroMesero ? ventasTurno.filter(v => v.usuario===filtroMesero) : [];
        const colores = ['from-violet-600 to-purple-700','from-blue-600 to-indigo-700','from-emerald-600 to-teal-700','from-orange-500 to-red-600','from-pink-500 to-rose-600'];

        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-6">
                <div class="bg-violet-100 p-2 rounded-lg"><i data-lucide="users" class="text-violet-600 w-6 h-6"></i></div>
                <div>
                    <h2 class="text-2xl font-black text-slate-800">Rendimiento por Turno y Mesero</h2>
                    ${turnoSel ? `<p class="text-sm text-slate-500 mt-0.5">Turno de <b>${turnoSel.usuario}</b> · ${new Date(turnoSel.fecha_apertura).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p>` : ''}
                </div>
            </div>

            ${!turnoSel ? `<div class="text-center py-16 text-slate-400 bg-slate-50 rounded-2xl border border-dashed"><p class="font-bold text-lg">No hay turnos registrados</p></div>`
            : meserosSorted.length===0 ? `<div class="text-center py-16 text-slate-400 bg-slate-50 rounded-2xl border border-dashed"><p class="font-bold text-lg">Sin ventas en este turno</p></div>`
            : `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                ${meserosSorted.map(([nombre, data], idx) => {
                    const pct = granTotal > 0 ? ((data.total/granTotal)*100).toFixed(1) : 0;
                    return `
                    <div class="bg-gradient-to-br ${colores[idx%colores.length]} rounded-2xl p-5 text-white shadow-lg cursor-pointer hover:scale-[1.02] transition-transform"
                         onclick="AppState.reporteMesero='${nombre}'; window.render()">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-black text-lg">${nombre.charAt(0).toUpperCase()}</div>
                            <div>
                                <p class="font-black text-base leading-tight">${nombre}</p>
                                <p class="text-white/70 text-[10px] uppercase tracking-widest">${data.tickets} tickets · ${pct}%</p>
                            </div>
                        </div>
                        <p class="text-3xl font-black">${formatCurrency(data.total)}</p>
                        <div class="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                            <div class="bg-white/10 rounded-lg p-1.5"><p class="text-white/60 uppercase">Efectivo</p><p class="font-black">${formatCurrency(data.efectivo)}</p></div>
                            <div class="bg-white/10 rounded-lg p-1.5"><p class="text-white/60 uppercase">Tarjeta</p><p class="font-black">${formatCurrency(data.tarjeta)}</p></div>
                        </div>
                        ${data.propinas > 0 ? `<p class="mt-2 text-[10px] text-white/80 font-bold">🪙 Propinas: ${formatCurrency(data.propinas)}</p>` : ''}
                    </div>`;
                }).join('')}
            </div>

            <div class="overflow-x-auto rounded-xl border mb-8">
                <table id="tablaReporte" class="w-full text-sm text-left">
                    <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                        <tr>
                            <th class="p-4 font-bold">Mesero / Cajero</th>
                            <th class="p-4 text-center font-bold">Tickets</th>
                            <th class="p-4 text-right font-bold">Efectivo</th>
                            <th class="p-4 text-right font-bold">Tarjeta</th>
                            <th class="p-4 text-right font-bold">Propinas</th>
                            <th class="p-4 text-right font-bold">Total</th>
                            <th class="p-4 text-right font-bold">% Turno</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${meserosSorted.map(([nombre, data]) => {
                            const pct = granTotal > 0 ? ((data.total/granTotal)*100).toFixed(1) : 0;
                            return `<tr class="hover:bg-slate-50/50 cursor-pointer ${filtroMesero===nombre?'bg-violet-50':''}"
                                        onclick="AppState.reporteMesero=AppState.reporteMesero==='${nombre}'?'':'${nombre}'; window.render()">
                                <td class="p-4 font-bold text-slate-800">
                                    <div class="flex items-center gap-2">
                                        <div class="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-black text-xs">${nombre.charAt(0).toUpperCase()}</div>
                                        ${nombre}
                                        ${filtroMesero===nombre ? '<span class="text-[9px] bg-violet-200 text-violet-700 px-2 py-0.5 rounded font-black uppercase ml-1">Viendo</span>' : ''}
                                    </div>
                                </td>
                                <td class="p-4 text-center font-bold text-slate-600">${data.tickets}</td>
                                <td class="p-4 text-right font-bold text-green-700">${formatCurrency(data.efectivo)}</td>
                                <td class="p-4 text-right font-bold text-blue-700">${formatCurrency(data.tarjeta)}</td>
                                <td class="p-4 text-right font-bold text-orange-600">${formatCurrency(data.propinas)}</td>
                                <td class="p-4 text-right font-black text-slate-800 text-base">${formatCurrency(data.total)}</td>
                                <td class="p-4 text-right">
                                    <div class="flex items-center justify-end gap-2">
                                        <div class="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden"><div class="bg-violet-500 h-full rounded-full" style="width:${pct}%"></div></div>
                                        <span class="text-xs font-black text-slate-500">${pct}%</span>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot class="bg-slate-50 border-t-2 border-slate-200">
                        <tr>
                            <td class="p-4 font-black text-slate-700 uppercase text-xs tracking-widest">TOTAL TURNO</td>
                            <td class="p-4 text-center font-black">${ventasTurno.length}</td>
                            <td colspan="3" class="p-4"></td>
                            <td class="p-4 text-right font-black text-slate-900 text-lg">${formatCurrency(granTotal)}</td>
                            <td class="p-4 text-right font-black text-slate-500">100%</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            ${filtroMesero && ventasDetalle.length > 0 ? `
            <div class="border-t pt-6">
                <h3 class="font-black text-slate-800 text-lg mb-4 flex items-center justify-between">
                    <span class="flex items-center gap-2"><i data-lucide="list" class="w-5 h-5 text-violet-500"></i> Detalle — ${filtroMesero}</span>
                    <button onclick="AppState.reporteMesero=''; window.render()" class="text-xs text-slate-400 hover:text-red-500 font-bold flex items-center gap-1">
                        <i data-lucide="x" class="w-3 h-3"></i> Cerrar
                    </button>
                </h3>
                <div class="overflow-x-auto rounded-xl border">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                            <tr><th class="p-3 font-bold">Hora</th><th class="p-3 font-bold">Folio</th><th class="p-3 font-bold">Mesa</th><th class="p-3 font-bold">Platillos</th><th class="p-3 text-center font-bold">Método</th><th class="p-3 text-right font-bold">Total</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${ventasDetalle.map(v => {
                                const items = (v.items||[]).map(i => `${i.nombre} x${i.cantidad}`).join(', ');
                                const mColor = v.metodo_pago==='efectivo'?'bg-green-100 text-green-700':v.metodo_pago==='tarjeta'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700';
                                const hora = new Date(v.fecha).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
                                return `<tr class="hover:bg-slate-50/50">
                                    <td class="p-3 font-mono text-xs text-slate-500">${hora}</td>
                                    <td class="p-3 font-mono text-xs text-slate-400">${v.folio||'—'}</td>
                                    <td class="p-3 font-bold text-slate-600 text-xs">${v.mesa||'—'}</td>
                                    <td class="p-3 text-slate-600 max-w-[200px] truncate text-xs">${items||'—'}</td>
                                    <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${mColor}">${v.metodo_pago}</span></td>
                                    <td class="p-3 text-right font-black text-slate-800">${formatCurrency(v.total||0)}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : ''}
            `}`;
    }

    // ── 8. PROPINAS ───────────────────────────────────────────────────────────
    else if (tab === 'propinas') {
        const ventasPeriodo = filterByDate(DB.ventas || []);
        const propinasPorMesero = {};
        let totalPropinasGlobal = 0;
        ventasPeriodo.forEach(v => {
            if (v.propina > 0) {
                const user = v.usuario || 'Sistema';
                propinasPorMesero[user] = (propinasPorMesero[user] || 0) + v.propina;
                totalPropinasGlobal += v.propina;
            }
        });
        const meseros = Object.entries(propinasPorMesero).sort((a,b) => b[1]-a[1]);
        contentHTML += `
            ${headerPDF}
            <div class="flex items-center gap-3 mb-2">
                <div class="bg-orange-100 p-2 rounded-lg"><i data-lucide="coins" class="text-orange-600 w-6 h-6"></i></div>
                <h2 class="text-2xl font-black text-slate-800">Reparto de Propinas</h2>
            </div>
            <div class="bg-gradient-to-br from-orange-500 to-amber-500 p-6 rounded-2xl shadow-lg text-white mb-8 max-w-md">
                <p class="font-bold text-orange-100 uppercase text-xs mb-1">Total Fondo Propinas</p>
                <h3 class="text-4xl font-black">${formatCurrency(totalPropinasGlobal)}</h3>
            </div>
            ${meseros.length === 0 ? `<div class="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed"><p class="font-bold">Sin propinas en este periodo.</p></div>` : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${meseros.map(([nombre, monto]) => `
                <div class="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:border-orange-300 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center"><i data-lucide="user" class="w-5 h-5 text-slate-500"></i></div>
                        <div><p class="font-bold text-slate-800">${nombre}</p><p class="text-xs text-slate-400">Propinas generadas</p></div>
                    </div>
                    <div class="text-right flex flex-col items-end gap-2">
                        <span class="font-black text-orange-600 text-xl">${formatCurrency(monto)}</span>
                        <button onclick="window.imprimirValePropina('${nombre}', ${monto}, '${start||'Inicio'} a ${end||'Hoy'}')"
                            class="text-[10px] font-bold uppercase bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 flex items-center gap-1">
                            <i data-lucide="printer" class="w-3 h-3"></i> Imprimir Vale
                        </button>
                    </div>
                </div>`).join('')}
            </div>`}`;
    }
    else if (tab === 'rentabilidad') {
    const recetas = DB.recetas || [];
    const datos = recetas.map(r => {
        const costo = calcularCostoReceta(r);
        const precio = r.precio_venta || 0;
        const ganancia = precio - costo;
        const margen = precio > 0 ? (ganancia / precio) * 100 : 0;
        // Unidades vendidas en el periodo
        const ventasPeriodo = filterByDate(DB.ventas || []);
        let unidsVendidas = 0;
        ventasPeriodo.forEach(v => { (v.items||[]).forEach(i => { if (i.nombre === r.nombre) unidsVendidas += i.cantidad; }); });
        const gananciaTotal = ganancia * unidsVendidas;
        return { nombre: r.nombre, categoria: r.categoria || '—', costo, precio, ganancia, margen, unidsVendidas, gananciaTotal };
    }).sort((a,b) => b.margen - a.margen);

    const totalGanancia = datos.reduce((s,d) => s + d.gananciaTotal, 0);
    const conPerdida    = datos.filter(d => d.margen <= 0).length;
    const margenBajo    = datos.filter(d => d.margen > 0 && d.margen < 30).length;
    const saludable     = datos.filter(d => d.margen >= 30).length;

    contentHTML += `
        ${headerPDF}
        <div class="flex items-center gap-3 mb-6">
            <div class="bg-emerald-100 p-2 rounded-lg"><i data-lucide="trending-up" class="text-emerald-600 w-6 h-6"></i></div>
            <div>
                <h2 class="text-2xl font-black text-slate-800">Análisis de Rentabilidad</h2>
                <p class="text-sm text-slate-500">Costo real de producción vs precio de venta por platillo</p>
            </div>
        </div>

        <div class="grid grid-cols-3 gap-4 mb-8">
            <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                <p class="text-3xl font-black text-emerald-700">${saludable}</p>
                <p class="text-xs font-black text-emerald-600 uppercase tracking-widest mt-1">Margen ≥30%</p>
            </div>
            <div class="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-center">
                <p class="text-3xl font-black text-yellow-700">${margenBajo}</p>
                <p class="text-xs font-black text-yellow-600 uppercase tracking-widest mt-1">Margen bajo</p>
            </div>
            <div class="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
                <p class="text-3xl font-black text-red-700">${conPerdida}</p>
                <p class="text-xs font-black text-red-600 uppercase tracking-widest mt-1">A pérdida</p>
            </div>
        </div>

        ${datos.length === 0 ? `<div class="text-center py-16 bg-slate-50 rounded-2xl border border-dashed"><p class="font-bold text-slate-500">No hay recetas configuradas</p></div>` : `
        <div class="overflow-x-auto rounded-xl border">
            <table id="tablaReporte" class="w-full text-sm text-left">
                <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
                    <tr>
                        <th class="p-4 font-bold">Platillo</th>
                        <th class="p-4 font-bold">Categoría</th>
                        <th class="p-4 text-right font-bold">Costo Real</th>
                        <th class="p-4 text-right font-bold">Precio Venta</th>
                        <th class="p-4 text-right font-bold">Ganancia/u</th>
                        <th class="p-4 text-center font-bold">Margen %</th>
                        <th class="p-4 text-center font-bold">Uds. Vendidas</th>
                        <th class="p-4 text-right font-bold">Ganancia Total</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${datos.map(d => {
                        const margenColor = d.margen <= 0 ? 'bg-red-100 text-red-700' : d.margen < 30 ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-700';
                        return `<tr class="hover:bg-slate-50/50">
                            <td class="p-4 font-bold text-slate-800">${d.nombre}</td>
                            <td class="p-4 text-slate-500 text-xs">${d.categoria}</td>
                            <td class="p-4 text-right font-bold text-slate-700">${formatCurrency(d.costo)}</td>
                            <td class="p-4 text-right font-bold text-slate-800">${formatCurrency(d.precio)}</td>
                            <td class="p-4 text-right font-black ${d.ganancia >= 0 ? 'text-emerald-600' : 'text-red-600'}">${formatCurrency(d.ganancia)}</td>
                            <td class="p-4 text-center">
                                <span class="px-2.5 py-1 rounded-md text-xs font-black ${margenColor}">${d.margen.toFixed(1)}%</span>
                            </td>
                            <td class="p-4 text-center font-bold text-slate-600">${d.unidsVendidas > 0 ? d.unidsVendidas : '<span class="text-slate-300">—</span>'}</td>
                            <td class="p-4 text-right font-black ${d.gananciaTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}">${d.unidsVendidas > 0 ? formatCurrency(d.gananciaTotal) : '<span class="text-slate-300">—</span>'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
                <tfoot class="bg-slate-50 border-t-2 border-slate-200">
                    <tr>
                        <td colspan="7" class="p-4 text-right font-black text-slate-500 uppercase text-xs tracking-widest">Ganancia Total del Periodo:</td>
                        <td class="p-4 text-right font-black text-lg ${totalGanancia >= 0 ? 'text-emerald-700' : 'text-red-700'}">${formatCurrency(totalGanancia)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>`}
    `;
}
    contentHTML += `</div>`;

    const tabsMenu = [
        { id:'valorizacion',  label:'Dinero Almacén',    icon:'dollar-sign' },
        { id:'kardex',        label:'Kardex Global',     icon:'clock' },
        { id:'abc',           label:'Análisis ABC',      icon:'bar-chart-2' },
        { id:'mermas',        label:'Pérdidas',          icon:'trending-down' },
        { id:'ventas',        label:'Historial Ventas',  icon:'receipt' },
        { id:'cierre',        label:'Auditoría Turnos',  icon:'store' },
        { id:'turno_mesero',  label:'Por Turno/Mesero',  icon:'users' },
        { id:'propinas',      label:'Pago Propinas',     icon:'coins' },
        { id:'rentabilidad',  label:'Rentabilidad',      icon:'trending-up' },
    ];

    const mostrarFiltroFecha = ['kardex','mermas','ventas','abc','propinas'].includes(tab);
    const meserosUnicos = [...new Set((DB.ventas||[]).map(v => v.usuario))].filter(Boolean);
    const turnosDisponibles = DB.turnos || [];

    return `
        <div class="space-y-6 animate-fade-in pb-20 h-full">
            <div class="bg-white p-3 rounded-2xl border shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4">
                <div class="flex overflow-x-auto w-full xl:w-auto gap-2 pb-2 xl:pb-0 custom-scrollbar">
                    ${tabsMenu.map(t => `
                        <button onclick="AppState.reporteActivo='${t.id}'; AppState.reporteMesero=''; window.render()"
                            class="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${tab===t.id?'bg-slate-900 text-white shadow-md':'bg-slate-50 text-slate-600 hover:bg-slate-100'}">
                            <i data-lucide="${t.icon}" class="w-4 h-4 ${tab===t.id?'text-white':'text-slate-400'}"></i>
                            ${t.label}
                        </button>`).join('')}
                </div>

                <div class="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
                    ${(tab==='cierre'||tab==='turno_mesero') && turnosDisponibles.length>0 ? `
                    <div class="flex items-center gap-2 bg-slate-50 border rounded-xl p-1.5 px-3">
                        <i data-lucide="filter" class="w-4 h-4 text-slate-400"></i>
                        <select onchange="AppState.reporteTurnoId=this.value; AppState.reporteMesero=''; window.render()" class="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer max-w-[220px]">
                            ${turnosDisponibles.map(t => `
                                <option value="${t.id}" ${String(t.id)===String(turnoIdSeleccionado)?'selected':''}>
                                    #${t.id} · ${t.usuario} · ${new Date(t.fecha_apertura).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}${t.estado==='abierto'?' 🟢':''}
                                </option>`).join('')}
                        </select>
                    </div>` : ''}

                    ${tab==='ventas' && meserosUnicos.length>0 ? `
                    <div class="flex items-center gap-2 bg-slate-50 border rounded-xl p-1.5 px-3">
                        <i data-lucide="user" class="w-4 h-4 text-slate-400"></i>
                        <select onchange="AppState.reporteMesero=this.value; window.render()" class="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer max-w-[120px]">
                            <option value="">Todos los Cajeros</option>
                            ${meserosUnicos.map(m => `<option value="${m}" ${filtroMesero===m?'selected':''}>${m}</option>`).join('')}
                        </select>
                    </div>` : ''}

                    ${mostrarFiltroFecha ? `
                    <div class="flex bg-slate-50 border rounded-xl p-1 gap-1">
                        <input type="date" value="${start}" onchange="AppState.reportDateStart=this.value; window.render()" class="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 cursor-pointer">
                        <span class="text-slate-300">|</span>
                        <input type="date" value="${end}" onchange="AppState.reportDateEnd=this.value; window.render()" class="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 cursor-pointer">
                        <button onclick="AppState.reportDateStart=''; AppState.reportDateEnd=''; AppState.reporteMesero=''; window.render()" class="p-1 text-slate-400 hover:text-red-500 rounded bg-white border shadow-sm"><i data-lucide="x" class="w-3 h-3"></i></button>
                    </div>` : ''}

                    <div class="flex gap-2">
                        <button onclick="window.exportarAExcel('Reporte_${tab}_${getSimpleDate()}', '#tablaReporte')"
                            class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-100 transition-colors flex items-center gap-2 text-xs">
                            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> <span class="hidden sm:inline">Excel</span>
                        </button>
                        <button onclick="window.print()" class="bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2.5 rounded-xl font-bold hover:bg-rose-100 transition-colors flex items-center gap-2 text-xs">
                            <i data-lucide="printer" class="w-4 h-4"></i> <span class="hidden sm:inline">PDF</span>
                        </button>
                    </div>
                </div>
            </div>
            ${contentHTML}
        </div>`;
}

window.imprimirTicketCierre = (turnoId) => {
    const turno = (DB.turnos||[]).find(t => String(t.id)===String(turnoId));
    if (!turno) return;
    const inicio = new Date(turno.fecha_apertura);
    const fin = turno.fecha_cierre ? new Date(turno.fecha_cierre) : new Date();
    const ventasTurno = (DB.ventas||[]).filter(v => { const d=new Date(v.fecha); return d>=inicio && d<=fin; });
    const mermasTurno = (DB.movimientos||[]).filter(m => { const d=new Date(m.fecha); return m.tipo==='Merma' && d>=inicio && d<=fin; });
    const totalVentas   = ventasTurno.reduce((s,v) => s+(v.total||0), 0);
    const totalEfectivo = ventasTurno.reduce((s,v) => s+(v.metodo_pago==='efectivo'?v.total:v.metodo_pago==='mixto'?(v.efectivo||0):0), 0);
    const totalTarjeta  = ventasTurno.reduce((s,v) => s+(v.metodo_pago==='tarjeta' ?v.total:v.metodo_pago==='mixto'?(v.tarjeta ||0):0), 0);
    const propinas = ventasTurno.reduce((s,v) => s+(v.propina||0), 0);
    const mermasPesos = mermasTurno.reduce((s,m) => { const p=DB.productos.find(x=>String(x.id)===String(m.producto_id)); return s+(Math.abs(m.cantidad)*(p?p.precio:0)); }, 0);
    const empresa = DB.configuracion?.nombreEmpresa || DB.configuracion?.nombre_empresa || 'Restaurante';
    const ticketHTML = `<html><head><style>body{font-family:'Courier New',monospace;font-size:12px;width:280px;margin:0 auto;padding:10px;color:#000}.center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between;margin:4px 0}@media print{body{width:100%}}</style></head><body>
        <div class="center bold" style="font-size:16px;text-transform:uppercase">${empresa}</div>
        <div class="center bold">*** AUDITORÍA DE TURNO ***</div>
        <div class="center" style="font-size:10px">Turno #${turno.id} · Cajero: ${turno.usuario}</div>
        <div class="center" style="font-size:10px">Inicio: ${new Date(turno.fecha_apertura).toLocaleString('es-MX')}</div>
        <div class="center" style="font-size:10px">Fin: ${turno.fecha_cierre?new Date(turno.fecha_cierre).toLocaleString('es-MX'):'EN PROGRESO'}</div>
        <div class="line"></div>
        <div class="row"><span>Total Tickets:</span><span>${ventasTurno.length}</span></div>
        <div class="row bold" style="font-size:14px"><span>VENTA TOTAL:</span><span>${formatCurrency(totalVentas)}</span></div>
        <div class="line"></div>
        <div class="row"><span>Fondo Inicial:</span><span>${formatCurrency(turno.fondo_inicial)}</span></div>
        <div class="row"><span>Efectivo:</span><span>${formatCurrency(totalEfectivo)}</span></div>
        <div class="row"><span>Tarjeta:</span><span>${formatCurrency(totalTarjeta)}</span></div>
        ${turno.estado==='cerrado'?`<div class="line"></div><div class="row bold"><span>${turno.diferencia<-0.1?'FALTANTE:':turno.diferencia>0.1?'SOBRANTE:':'CUADRE:'}</span><span>${turno.diferencia===0?'PERFECTO':formatCurrency(Math.abs(turno.diferencia))}</span></div>`:''}
        <div class="line"></div>
        <div class="row"><span>Propinas:</span><span>${formatCurrency(propinas)}</span></div>
        <div class="row"><span>Mermas:</span><span>-${formatCurrency(mermasPesos)}</span></div>
        <div class="line"></div>
        <div class="center" style="margin-top:30px;font-size:10px">_________________________<br>Gerencia / Auditoría</div>
    </body></html>`;
    const win = window.open('','_blank','width=320,height=600');
    if (win) { win.document.write(ticketHTML); win.document.close(); win.focus(); setTimeout(()=>{win.print();win.close();},500); }
};

window.imprimirValePropina = (mesero, cantidad, periodoTxt) => {
    const empresa = DB.configuracion?.nombreEmpresa || DB.configuracion?.nombre_empresa || 'Restaurante';
    const valeHTML = `<html><head><style>body{font-family:'Courier New',monospace;font-size:12px;width:280px;margin:0 auto;padding:10px;color:#000;text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:15px 0}@media print{body{width:100%}}</style></head><body>
        <div class="bold" style="font-size:16px;text-transform:uppercase">${empresa}</div>
        <div class="bold" style="font-size:14px;border:1px solid #000;padding:5px;margin:10px 0">VALE DE PROPINAS</div>
        <div style="text-align:left;margin-top:15px;font-size:12px;line-height:1.5">
            Confirmo haber recibido:<br><br>
            <div class="bold" style="font-size:24px;text-align:center">${formatCurrency(cantidad)}</div><br>
            Propinas del periodo: <b>${periodoTxt}</b>
        </div>
        <div class="line" style="margin-top:50px"></div>
        <div style="font-size:10px"><b>${mesero.toUpperCase()}</b><br>Firma de Conformidad</div>
        <div style="margin-top:20px;font-size:9px;color:#555">${new Date().toLocaleString('es-MX')}</div>
    </body></html>`;
    const win = window.open('','_blank','width=320,height=500');
    if (win) { win.document.write(valeHTML); win.document.close(); win.focus(); setTimeout(()=>{win.print();win.close();},500); }
};