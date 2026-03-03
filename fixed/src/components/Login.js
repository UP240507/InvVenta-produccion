// src/components/Login.js
import { AppState, DB } from '../store/state.js';
import { SPINNER_ICON, showNotification } from '../utils/helpers.js';

export function renderLogin() {
    const empresa = DB.configuracion?.nombreEmpresa || 'Stock Central';
    const anio = new Date().getFullYear();

    return `
        <div class="h-full flex items-center justify-center bg-slate-900 p-4 bg-[url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')] bg-cover bg-center">
            <div class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>
            
            <form id="form-login" class="relative bg-white/95 backdrop-blur-xl p-8 rounded-2xl shadow-2xl w-full max-w-sm space-y-6 border border-white/20 animate-fade-in">
                
                <div class="text-center mb-8">
                    <div class="bg-gradient-to-tr from-blue-600 to-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30 transform hover:scale-105 transition-transform duration-500">
                        <i data-lucide="box" class="text-white w-8 h-8"></i>
                    </div>
                    <h1 class="text-2xl font-bold text-gray-800 tracking-tight">Bienvenido</h1>
                    <p class="text-gray-500 text-sm mt-1">Ingresa tus credenciales para acceder</p>
                </div>

                <div class="space-y-4">
                    <div class="group">
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Usuario</label>
                        <div class="relative">
                            <i data-lucide="user" class="absolute left-3 top-3 text-gray-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"></i>
                            <input id="login-u" class="w-full border-gray-300 border pl-10 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 focus:bg-white" placeholder="Ej. admin" required>
                        </div>
                    </div>
                    <div class="group">
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Contraseña</label>
                        <div class="relative">
                            <i data-lucide="lock" class="absolute left-3 top-3 text-gray-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors"></i>
                            <input id="login-p" type="password" class="w-full border-gray-300 border pl-10 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 focus:bg-white" placeholder="••••••" required>
                        </div>
                    </div>
                </div>

                <button id="btn-login" type="submit" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-lg font-bold hover:shadow-lg hover:shadow-blue-500/40 transition-all flex justify-center items-center gap-2 transform active:scale-95">
                    <span>Iniciar Sesión</span>
                    <i data-lucide="arrow-right" class="w-4 h-4"></i>
                </button>
                
                <div class="text-center pt-4 border-t border-gray-100 space-y-3">
                    <button type="button" onclick="alert('Por seguridad, contacta al Administrador del sistema para restablecer tu contraseña.')" class="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline transition-colors">
                        ¿Olvidaste tu contraseña?
                    </button>
                    <p class="text-xs text-gray-400">
                        © ${anio} ${empresa}<br>
                        <span class="opacity-70">Sistema de Gestión v5.2</span>
                    </p>
                </div>
            </form>
        </div>
    `;
}

// Hacemos global la función para que el onsubmit del HTML pueda llamarla
window.handleLogin = function(e) {
    if (e) e.preventDefault();
    
    const btn = document.getElementById('btn-login');
    const originalText = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = `${SPINNER_ICON} Accediendo...`;
    
    setTimeout(() => {
        const u = document.getElementById('login-u').value.trim();
        const p = document.getElementById('login-p').value.trim();
        
        // Validación: Busca en DB o permite el acceso maestro (admin / 1234)
        const user = DB.usuarios.find(x => x.username === u && x.password === p) 
                  || (u === 'admin' && p === '1234' ? { id: 999, nombre: 'Admin Temporal', username: 'admin', rol: 'Admin', avatar: 'https://ui-avatars.com/api/?name=Admin' } : null);
        
        if (user) { 
            AppState.user = user; 
            // Cajero va directo al POS, los demás al dashboard
            AppState.currentScreen = user.rol === 'Cajero' ? 'pos' : 'dashboard'; 
            window.render(); 
            showNotification(`¡Bienvenido, ${user.nombre}!`, 'success');
        } else { 
            showNotification('Usuario o contraseña incorrectos', 'error');
            btn.disabled = false; 
            btn.innerHTML = originalText;
        }
    }, 600);
};

// ✅ Agregar el event listener después de renderizar
window.attachLoginEvents = function() {
    const form = document.getElementById('form-login');
    if (form) {
        form.addEventListener('submit', window.handleLogin);
    }
};