// src/components/Perfil.js
import { DB, AppState, cargarDatosDeNube } from '../store/state.js';
import { supabase } from '../api/supabase.js';
import { showNotification, formatDate, SPINNER_ICON } from '../utils/helpers.js';
import { hashPassword } from '../utils/auth.js';

export function renderPerfil() {
    const u = AppState.user;
    const misMovimientos = DB.movimientos.filter(m => m.usuario === u.nombre).length;
    const ultimoMov = [...DB.movimientos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).find(m => m.usuario === u.nombre);

    // Si ya subió una foto nueva en esta sesión, mostramos la nueva, si no, la de DB
    const avatarUrl = AppState.tempData.newAvatar || u.avatar || `https://ui-avatars.com/api/?name=${u.nombre}&background=random&color=fff`;
    // Imagen por defecto estilo paisaje/oficina si no tiene portada
    const defaultCover = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80';
    const portadaUrl = AppState.tempData.newPortada || u.portada || defaultCover;

    return `
        <div class="animate-fade-in max-w-5xl mx-auto pb-20 pt-4 h-full">
            
            <div id="coverContainer" class="relative h-64 md:h-72 bg-slate-800 rounded-3xl shadow-xl mb-24 border border-slate-200 bg-cover bg-center transition-all duration-500" style="background-image: url('${portadaUrl}');">
                
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent rounded-3xl pointer-events-none z-0"></div>
                
                <button onclick="document.getElementById('inputPortada').click()" class="absolute top-4 right-4 bg-black/40 hover:bg-black/70 text-white px-4 py-2 rounded-lg backdrop-blur-md transition-colors text-xs font-bold flex items-center gap-2 shadow-sm border border-white/10 z-20">
                    <i data-lucide="camera" class="w-4 h-4"></i> <span class="hidden sm:inline">Editar Portada</span>
                </button>

                <div class="absolute bottom-6 left-48 md:left-56 text-white drop-shadow-md z-10">
                    <h1 class="text-3xl md:text-4xl font-black tracking-tight mb-1">${u.nombre}</h1>
                    <div class="flex items-center gap-2 text-sm bg-black/30 border border-white/20 w-fit px-4 py-1.5 rounded-full backdrop-blur-md font-bold uppercase tracking-widest text-slate-100">
                        <i data-lucide="shield-check" class="w-4 h-4 text-emerald-400"></i> ${u.rol}
                    </div>
                </div>

                <div class="absolute -bottom-12 left-8 md:left-12 z-30 group">
                    <div class="relative p-1.5 bg-white rounded-full shadow-2xl transition-transform duration-300 hover:scale-105">
                        <img id="imgAvatar" src="${avatarUrl}" class="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white bg-slate-100">
                        
                        <button onclick="document.getElementById('inputAvatar').click()" class="absolute bottom-3 right-3 bg-slate-200 hover:bg-slate-300 text-slate-800 p-2.5 rounded-full border-4 border-white transition-colors shadow-md cursor-pointer z-40" title="Cambiar foto de perfil">
                            <i data-lucide="camera" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            </div>

            <input type="file" id="inputPortada" accept="image/png,image/jpeg,image/webp" class="hidden" onchange="window.subirImagenPerfil(this, 'portada')">
            <input type="file" id="inputAvatar" accept="image/png,image/jpeg,image/webp" class="hidden" onchange="window.subirImagenPerfil(this, 'avatar')">

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 px-2">
                
                <div class="space-y-6">
                    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                        <div class="absolute right-0 top-0 h-full w-1 bg-blue-500 transform origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-300"></div>
                        <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-5">Tu Actividad Global</h3>
                        
                        <div class="flex items-center gap-4 mb-6">
                            <div class="bg-blue-50 border border-blue-100 p-4 rounded-2xl shadow-inner"><i data-lucide="activity" class="text-blue-600 w-7 h-7"></i></div>
                            <div>
                                <p class="text-4xl font-black text-slate-800">${misMovimientos}</p>
                                <p class="text-xs font-bold text-slate-500">Operaciones en sistema</p>
                            </div>
                        </div>
                        
                        <div class="border-t border-slate-100 pt-5">
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><i data-lucide="clock" class="w-3 h-3"></i> Último Movimiento</p>
                            ${ultimoMov ? `
                                <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <p class="text-sm font-bold text-slate-700">${ultimoMov.tipo}</p>
                                    <p class="text-xs text-slate-500 mt-0.5">${formatDate(ultimoMov.fecha)}</p>
                                </div>
                            ` : `
                                <p class="text-sm text-slate-400 italic">No se registran movimientos tuyos aún.</p>
                            `}
                        </div>
                    </div>
                </div>

                <div class="md:col-span-2">
                    <div class="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <h2 class="text-xl font-black text-slate-800 mb-1">Información de la Cuenta</h2>
                        <p class="text-sm text-slate-500 mb-8">Actualiza tus credenciales de acceso para el Punto de Venta.</p>

                        <form onsubmit="window.guardarPerfil(event)" class="space-y-6">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nombre Mostrado</label>
                                    <div class="relative">
                                        <i data-lucide="user" class="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400"></i>
                                        <input name="nombre" value="${u.nombre}" class="w-full border-2 border-slate-200 pl-11 p-3 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-slate-800 font-bold transition-colors bg-slate-50 focus:bg-white" required>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">Login ID <i data-lucide="lock" class="w-3 h-3 text-slate-300"></i></label>
                                    <div class="relative">
                                        <i data-lucide="at-sign" class="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400"></i>
                                        <input value="${u.username}" class="w-full border border-slate-200 pl-11 p-3 rounded-xl bg-slate-100 text-slate-500 cursor-not-allowed font-mono" disabled title="El usuario no se puede cambiar">
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Clave de Acceso</label>
                                <div class="relative">
                                    <i data-lucide="key" class="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400"></i>
                                    <input name="password" type="password" 
    placeholder="Nueva contraseña (dejar vacío para no cambiar)"
    class="w-full border-2 border-slate-200 pl-11 p-3 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-slate-800 font-mono tracking-widest transition-colors bg-slate-50 focus:bg-white">
                                </div>
                                <p class="text-[10px] text-slate-400 mt-1.5 ml-1">Utilizada para ingresar al sistema desde la pantalla principal.</p>
                            </div>
                            
                            <div class="pt-6 border-t border-slate-100 flex justify-end">
                                <button type="submit" class="w-full sm:w-auto bg-slate-900 text-white px-8 py-3.5 rounded-xl font-black hover:bg-slate-800 shadow-lg shadow-slate-200 transition-transform active:scale-95 flex items-center justify-center gap-2">
                                    <i data-lucide="save" class="w-5 h-5"></i> Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ─── LOGICA DE SUBIDA DE IMÁGENES A SUPABASE ─────────────────────────────────
window.subirImagenPerfil = async (input, tipo) => {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
        return showNotification('La imagen es muy pesada. Máximo 3MB.', 'error');
    }

    showNotification(`Subiendo ${tipo}...`, 'info');

    try {
        const ext = file.name.split('.').pop();
        // Generamos un nombre único: avatar_1_16234343.jpg
        const fileName = `${tipo}_${AppState.user.id}_${Date.now()}.${ext}`;

        // Subimos al bucket 'logos' (el mismo que usamos en Configuración para reusar infraestructura)
        const { error } = await supabase.storage.from('logos').upload(fileName, file, { 
            upsert: true, 
            contentType: file.type 
        });

        if (error) throw error;

        // Obtenemos la URL pública
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);

        // Actualizamos la interfaz inmediatamente
        if (tipo === 'avatar') {
            AppState.tempData.newAvatar = publicUrl;
            document.getElementById('imgAvatar').src = publicUrl;
        } else {
            AppState.tempData.newPortada = publicUrl;
            document.getElementById('coverContainer').style.backgroundImage = `url('${publicUrl}')`;
        }

        showNotification('✅ Imagen cargada. Haz clic en Guardar Cambios para fijarla.', 'success');

    } catch (err) {
        console.error(err);
        showNotification('Error al subir imagen: ' + err.message, 'error');
    }

    // Limpiamos el input por si quiere subir la misma foto de nuevo
    input.value = '';
};

// ─── GUARDAR PERFIL EN BASE DE DATOS ─────────────────────────────────────────

window.guardarPerfil = async (e) => {
    e.preventDefault();

    const btn = e.target.querySelector('button[type="submit"]');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = SPINNER_ICON + ' Guardando...';

    const fd = new FormData(e.target);
    const nuevoNombre    = fd.get('nombre').trim();
    const plainPassword  = fd.get('password').trim(); // vacío si no quiso cambiarla

    const avatarFinal  = AppState.tempData.newAvatar  || AppState.user.avatar;
    const portadaFinal = AppState.tempData.newPortada || AppState.user.portada || '';

    // ── FIX B-01: Hash de contraseña al guardar perfil ───────────────────
    let passwordFinal;

    if (plainPassword) {
        // El usuario escribió una contraseña nueva → hashearla
        try {
            passwordFinal = await hashPassword(plainPassword);
        } catch (err) {
            showNotification('Error al procesar contraseña: ' + err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            return;
        }
    } else {
        // Campo vacío → conservar la contraseña actual en DB (sin cambios)
        passwordFinal = AppState.user.password;
    }
    // ─────────────────────────────────────────────────────────────────────

    try {
        if (AppState.user.id === 999) {
            // Usuario temporal (admin maestro eliminado en B-02 — este caso
            // ya no debería ocurrir, pero se deja como fallback)
            AppState.user.nombre   = nuevoNombre;
            AppState.user.password = passwordFinal;
            AppState.user.avatar   = avatarFinal;
            AppState.user.portada  = portadaFinal;
            showNotification('Perfil temporal actualizado (no se guarda en la nube)', 'info');
        } else {
            const updateData = {
                nombre:   nuevoNombre,
                password: passwordFinal,
                avatar:   avatarFinal,
                portada:  portadaFinal,
            };

            // Si el usuario no cambió contraseña, no la mandamos al update
            // para no pisar accidentalmente con la misma contraseña hasheada
            if (!plainPassword) {
                delete updateData.password;
            }

            const { error } = await supabase
                .from('usuarios')
                .update(updateData)
                .eq('id', AppState.user.id);

            if (error) throw error;

            await cargarDatosDeNube();
            AppState.user = DB.usuarios.find(x => x.id === AppState.user.id);

            // Limpiar temporales de imagen
            AppState.tempData.newAvatar  = null;
            AppState.tempData.newPortada = null;

            showNotification('Perfil actualizado correctamente', 'success');
        }

        window.render();
    } catch (err) {
        showNotification('Error al actualizar: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
};
