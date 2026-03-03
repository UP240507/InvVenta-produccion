// src/main.js
import { AppState, DB, cargarDatosDeNube } from './store/state.js';
import { showNotification } from './utils/helpers.js';
import { renderLayout } from './components/Layout.js';
import { renderLogin } from './components/Login.js';
import { renderDashboard } from './components/Dashboard.js';
import { renderProductos } from './components/Products.js';
import { renderProveedores } from './components/Proveedores.js';
import { renderOrdenCompraForm, renderEntradasMercancia, /*renderNuevaCompra*/ } from './components/Compras.js';
import { renderAjustesInventario } from './components/Ajustes.js';
import { renderRecetas } from './components/Recetas.js';
import { renderReportes } from './components/Reportes.js';
import { renderConfiguracion } from './components/Configuracion.js';
import { renderPerfil } from './components/Perfil.js';
import { renderPos } from './components/Pos.js';
import { renderMesas } from './components/Mesas.js';

// Exponemos las variables globales a "window" para que los "onclick" del HTML funcionen
window.AppState = AppState;
window.DB = DB;

// Función para manejar los modales globales (Ventanas emergentes)
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

// El enrutador principal (Decide qué pintar en la pantalla)
window.render = function() {
    const root = document.getElementById('root');
    
    // 1. Si NO hay usuario logueado, inyectamos el Login
    if (!AppState.user) {
        root.innerHTML = renderLogin();
        lucide.createIcons();
        const loginForm = document.getElementById('form-login');
        if (loginForm) {
            loginForm.addEventListener('submit', window.handleLogin);
        }
        return; // Detenemos la ejecución para que no cargue el menú
    }

    // 2. Si hay usuario, vemos qué pantalla solicitó
    let contenidoHTML = '';
    
    switch(AppState.currentScreen) {
        case 'dashboard': 
            contenidoHTML = renderDashboard(); 
            break;
        case 'productos': 
            contenidoHTML = renderProductos();
            break;
        case 'proveedores':
            contenidoHTML = renderProveedores();
            break;
        case 'compras_crear': 
            contenidoHTML = renderOrdenCompraForm(); 
            break;
        case 'entradas_mercancia': 
            contenidoHTML = renderEntradasMercancia(); 
            break;
        case 'ajustes_inventario':
            contenidoHTML = renderAjustesInventario();
            break;
        case 'recetas':
            contenidoHTML = renderRecetas();
            break;
        case 'reportes':
            contenidoHTML = renderReportes();
            break;
        case 'configuracion':
            contenidoHTML = renderConfiguracion();
            break;
        case 'perfil':
            contenidoHTML = renderPerfil();
            break;
        case 'mesas':
            contenidoHTML = renderMesas();
            break;
        case 'pos':
            contenidoHTML = renderPos();
            break;
        default: 
            contenidoHTML = '<div class="text-center py-20 text-gray-400">Pantalla en construcción...</div>';
    }

    // 3. Envolvemos el contenido en el Cascarón (Menú lateral y Header)
    root.innerHTML = renderLayout(contenidoHTML);
    
    // 4. Activamos los iconos de Lucide
    lucide.createIcons();

    // 5. Lógica posterior al renderizado (Ej: Dibujar gráficas del dashboard)
    if(AppState.currentScreen === 'dashboard') {
        setTimeout(() => {
            if(typeof window.renderGraficoCategorias === 'function') {
                window.renderGraficoCategorias();
            }
        }, 50);
    }
};

// Función de arranque
async function iniciarApp() {
    await cargarDatosDeNube(); // Traemos toda la info de Supabase
    window.render(); // Pintamos la primera pantalla
}

// Arrancamos el motor
iniciarApp();

// ==========================================
// MOTOR LÁSER: LECTOR DE CÓDIGOS DE BARRAS
// ==========================================
let barcodeBuffer = '';
let barcodeTimer = null;

// Le agregamos 'window.' a las funciones para evitar problemas de alcance (scope)
window.procesarCodigoEscaneado = (codigo) => {
    // En mesas, delegar al scanner de mesas
    if (AppState.currentScreen === 'mesas') {
        window.mesaScanner(codigo);
        return;
    }

    // En el POS, el scanner busca por codigo_pos de recetas, no por codigo de productos
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
    
    if (!prod) {
        return showNotification('⚠️ Código no encontrado: ' + codigo, 'error');
    }

    if (AppState.currentScreen === 'compras_crear' && AppState.tempData.proveedor) {
        const ex = AppState.cart.find(x => x.productoId === prod.id);
        if (ex) ex.cant += 1;
        else AppState.cart.push({ productoId: prod.id, nombre: prod.nombre, precio: prod.precio, cant: 1 });
        window.render();
        showNotification(`🛒 +1 ${prod.nombre} agregado`, 'success');
    } else if (AppState.currentScreen === 'productos') {
        const searchInput = document.getElementById('txtSearch');
        if(searchInput) {
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
    // Protección extra: Si no hay evento o tecla válida, ignoramos
    if (!e || !e.key) return;

    if (barcodeTimer) clearTimeout(barcodeTimer);

    if (e.key === 'Enter') {
        if (barcodeBuffer.length > 2) {
            // Evitamos que afecte inputs si no estamos escribiendo intencionalmente
            if(document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault(); 
            }
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