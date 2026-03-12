// src/main.js
import { AppState, DB, cargarDatosDeNube } from './store/state.js';
import { showNotification } from './utils/helpers.js';
import { renderLayout } from './components/Layout.js';
import { renderLogin } from './components/Login.js';
import { renderDashboard } from './components/Dashboard.js';
import { renderProductos } from './components/Products.js';
import { renderProveedores } from './components/Proveedores.js';
import { renderOrdenCompraForm, renderEntradasMercancia } from './components/Compras.js';
import { renderAjustesInventario } from './components/Ajustes.js';
import { renderRecetas } from './components/Recetas.js';
import { renderReportes } from './components/Reportes.js';
import { renderConfiguracion } from './components/Configuracion.js';
import { renderPerfil } from './components/Perfil.js';
import { renderPos } from './components/Pos.js';
import { renderMesas } from './components/Mesas.js';

window.AppState = AppState;
window.DB = DB;

window.openModal = function(content) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
        <div class="modal-backdrop fixed inset-0 bg-black bg-opacity-50 z-[90] flex items-center justify-center p-4" onclick="if(event.target===this) closeModal()">
            <div class="modal-content bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                ${content}
            </div>
        </div>`;
    lucide.createIcons();
};

window.closeModal = function() {
    document.getElementById('modal-root').innerHTML = '';
};

window.render = function() {
    const root = document.getElementById('root');

    if (!AppState.user) {
        root.innerHTML = renderLogin();
        lucide.createIcons();
        const loginForm = document.getElementById('form-login');
        if (loginForm) loginForm.addEventListener('submit', window.handleLogin);
        return;
    }

    let contenidoHTML = '';

    switch(AppState.currentScreen) {
        case 'dashboard':           contenidoHTML = renderDashboard();          break;
        case 'productos':           contenidoHTML = renderProductos();           break;
        case 'proveedores':         contenidoHTML = renderProveedores();         break;
        case 'compras_crear':       contenidoHTML = renderOrdenCompraForm();     break;
        case 'entradas_mercancia':  contenidoHTML = renderEntradasMercancia();   break;
        case 'ajustes_inventario':  contenidoHTML = renderAjustesInventario();   break;
        case 'recetas':             contenidoHTML = renderRecetas();             break;
        case 'reportes':            contenidoHTML = renderReportes();            break;
        case 'configuracion':       contenidoHTML = renderConfiguracion();       break;
        case 'perfil':              contenidoHTML = renderPerfil();              break;
        case 'mesas':               contenidoHTML = renderMesas();               break;
        case 'pos':                 contenidoHTML = renderPos();                 break;
        default: contenidoHTML = '<div class="text-center py-20 text-gray-400">Pantalla en construcción...</div>';
    }

    root.innerHTML = renderLayout(contenidoHTML);
    lucide.createIcons();

    if (AppState.currentScreen === 'dashboard') {
        setTimeout(() => {
            if (typeof window.renderGraficoCategorias === 'function') window.renderGraficoCategorias();
        }, 50);
    }
};

async function iniciarApp() {
    await cargarDatosDeNube();
    window.render();
}

iniciarApp();

// ═══════════════════════════════════════════════════════════════════════
// MOTOR LÁSER: LECTOR DE CÓDIGOS DE BARRAS
// FIX: ignorar teclas cuando el foco está en un input/textarea/select
// ═══════════════════════════════════════════════════════════════════════
let barcodeBuffer = '';
let barcodeTimer = null;

window.procesarCodigoEscaneado = (codigo) => {
    if (AppState.currentScreen === 'mesas') {
        window.mesaScanner(codigo);
        return;
    }

    if (AppState.currentScreen === 'pos') {
        const receta = DB.recetas.find(r =>
            (r.codigo_pos || '').toLowerCase() === codigo.toLowerCase()
        );
        if (receta) {
            window.posAgregarReceta(receta.id);
            showNotification(`✅ ${receta.nombre} agregado`, 'success');
        } else {
            showNotification(`⚠️ Código POS no encontrado: ${codigo}`, 'error');
        }
        return;
    }

    const prod = DB.productos.find(p => p.codigo.toLowerCase() === codigo.toLowerCase());

    if (!prod) return showNotification('⚠️ Código no encontrado: ' + codigo, 'error');

    if (AppState.currentScreen === 'compras_crear' && AppState.tempData.proveedor) {
        const ex = AppState.cart.find(x => x.productoId === prod.id);
        if (ex) ex.cant += 1;
        else AppState.cart.push({ productoId: prod.id, nombre: prod.nombre, precio: prod.precio, cant: 1 });
        window.render();
        showNotification(`🛒 +1 ${prod.nombre} agregado`, 'success');
    } else if (AppState.currentScreen === 'productos') {
        const searchInput = document.getElementById('txtSearch');
        if (searchInput) {
            searchInput.value = prod.codigo;
            AppState.searchTerm = prod.codigo;
            window.actualizarTablaProductos();
            showNotification(`🔍 Producto filtrado`, 'success');
        }
    } else {
        showNotification(`🏷️ Producto escaneado: ${prod.nombre}`, 'info');
    }
};

document.addEventListener('keydown', (e) => {
    if (!e || !e.key) return;

    // ── FIX: Si el foco está en un campo de texto, el escáner NO interviene ──
    const tag = document.activeElement?.tagName;
    const isEditable = document.activeElement?.isContentEditable;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isEditable) return;
    // ─────────────────────────────────────────────────────────────────────────

    if (barcodeTimer) clearTimeout(barcodeTimer);

    if (e.key === 'Enter') {
        if (barcodeBuffer.length > 2) {
            e.preventDefault();
            window.procesarCodigoEscaneado(barcodeBuffer);
        }
        barcodeBuffer = '';
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        barcodeBuffer += e.key;
    }

    barcodeTimer = setTimeout(() => {
        barcodeBuffer = '';
    }, 150);
});