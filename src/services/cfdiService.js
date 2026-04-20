// src/services/cfdiService.js
import { supabase } from '../api/supabase.js';
import { DB, AppState } from '../store/state.js';

export const REGIMENES_FISCALES = [
    { value: '601', label: '601 · General de Ley Personas Morales' },
    { value: '603', label: '603 · Personas Morales sin Fines Lucrativos' },
    { value: '606', label: '606 · Arrendamiento' },
    { value: '612', label: '612 · Personas Físicas con Actividad Empresarial' },
    { value: '616', label: '616 · Sin obligaciones fiscales' },
    { value: '621', label: '621 · Incorporación Fiscal' },
    { value: '626', label: '626 · RESICO' },
];

export const USOS_CFDI = [
    { value: 'G01', label: 'G01 · Adquisición de mercancias' },
    { value: 'G03', label: 'G03 · Gastos en general' },
    { value: 'I01', label: 'I01 · Construcciones' },
    { value: 'P01', label: 'P01 · Por definir' },
    { value: 'S01', label: 'S01 · Sin efectos fiscales (Público en general)' },
];

const FORMAS_PAGO_MAP = { 'efectivo':'01', 'tarjeta':'04', 'mixto':'01' };

function getCfdiConfig() { return (DB.configuracion || {}).cfdi_config || {}; }

function getFacturamaBaseUrl() {
    return getCfdiConfig().sandbox !== false
        ? 'https://apisandbox.facturama.mx'
        : 'https://api.facturama.mx';
}

function getFacturamaAuth() {
    const cfg = getCfdiConfig();
    if (!cfg.facturama_user || !cfg.facturama_pass)
        throw new Error('Configura las credenciales de Facturama en Configuración → Facturación CFDI');
    return 'Basic ' + btoa(`${cfg.facturama_user}:${cfg.facturama_pass}`);
}

export function buildFacturamaBody({ venta, receptor }) {
    const conf         = DB.configuracion || {};
    const cfg          = getCfdiConfig();
    const rfcEmisor    = (conf.rfc || '').toUpperCase();
    const nombreEmisor = conf.nombre_empresa || conf.nombreEmpresa || 'Restaurante';
    const regimenEmisor = cfg.regimen_fiscal || '616';
    const cpExpedicion  = cfg.codigo_postal  || '00000';
    const serie         = cfg.serie          || 'A';
    const ivaTasa       = parseFloat(conf.iva) || 0.16;

    const total    = parseFloat(venta.total)    || 0;
    const subtotal = parseFloat(venta.subtotal) || total;
    const base     = parseFloat((subtotal / (1 + ivaTasa)).toFixed(6));
    const iva      = parseFloat((base * ivaTasa).toFixed(6));
    const formaPago = FORMAS_PAGO_MAP[venta.metodo_pago] || '01';
    const descripcion = (venta.items || []).map(i => `${i.nombre} x${i.cantidad}`).join(', ').substring(0, 250) || 'Consumo restaurante';

    return {
        Serie: serie, Currency: 'MXN', ExpeditionPlace: cpExpedicion,
        CfdiType: 'I', PaymentForm: formaPago, PaymentMethod: 'PUE',
        Folio: venta.folio || String(Date.now()),
        Issuer: { FiscalRegime: regimenEmisor, Rfc: rfcEmisor, Name: nombreEmisor },
        Receiver: {
            Rfc: receptor.rfc.toUpperCase(), Name: receptor.nombre.toUpperCase(),
            CfdiUse: receptor.uso_cfdi || 'G03', FiscalRegime: receptor.regimen || '616',
            TaxZipCode: receptor.cp || cpExpedicion,
        },
        Items: [{
            ProductCode: '90101501', IdentificationNumber: '01',
            Description: descripcion, Unit: 'Servicio', Subtotal: base,
            Quantity: 1, UnitCode: 'E48', UnitPrice: base, Total: total,
            Taxes: [{ Total: iva, Name: 'IVA', Base: base, Rate: ivaTasa, IsRetention: false }],
        }],
    };
}

export async function timbrarCFDI({ venta, receptor }) {
    const body = buildFacturamaBody({ venta, receptor });
    const res  = await fetch(`${getFacturamaBaseUrl()}/2/cfdis`, {
        method: 'POST',
        headers: { 'Authorization': getFacturamaAuth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Error Facturama ${res.status}`);
    }
    const data = await res.json();
    const factura = {
        folio_venta: venta.folio || null,
        folio_fiscal: data.Complement?.TaxStamp?.Uuid || null,
        serie: data.Serie || body.Serie, folio: data.Folio || body.Folio,
        fecha_emision: data.Date || new Date().toISOString(),
        rfc_emisor: body.Issuer.Rfc, rfc_receptor: receptor.rfc.toUpperCase(),
        nombre_receptor: receptor.nombre.toUpperCase(), uso_cfdi: receptor.uso_cfdi,
        subtotal: body.Items[0].Subtotal, iva: body.Items[0].Taxes[0].Total,
        total: parseFloat(venta.total), estado: 'vigente',
        facturama_id: data.Id || null, pac_response: data,
        usuario: AppState.user?.nombre || 'Sistema',
    };
    const { data: saved, error } = await supabase.from('facturas').insert(factura).select().single();
    if (error) console.error('Error guardando factura:', error);
    return { factura: saved || factura, raw: data };
}

export async function cancelarCFDI(facturaId, motivo = '02') {
    const { data: factura } = await supabase.from('facturas').select('facturama_id').eq('id', facturaId).single();
    if (!factura?.facturama_id) throw new Error('ID de Facturama no encontrado');
    const res = await fetch(`${getFacturamaBaseUrl()}/2/cfdis/${factura.facturama_id}?type=I&motive=${motivo}`, {
        method: 'DELETE', headers: { 'Authorization': getFacturamaAuth() },
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `Error ${res.status}`); }
    await supabase.from('facturas').update({ estado: 'cancelado' }).eq('id', facturaId);
}

export async function descargarCFDI(facturamaId, formato = 'pdf') {
    const res = await fetch(`${getFacturamaBaseUrl()}/cfdi/${formato}/I/${facturamaId}`, {
        headers: { 'Authorization': getFacturamaAuth() },
    });
    if (!res.ok) throw new Error(`No se pudo descargar el ${formato.toUpperCase()}`);
    const data  = await res.json();
    const bytes  = atob(data.Content);
    const buffer = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i));
    const blob   = new Blob([buffer], { type: formato === 'pdf' ? 'application/pdf' : 'application/xml' });
    const link   = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${data.FileName || facturamaId}.${formato}`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
