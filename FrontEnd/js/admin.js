/* ============================================================
   Panel Administrativo - U.E. Mario Ona Perdomo
   Almacenamiento local para eventos y galeria.
   ============================================================ */

const GALLERY_KEY = 'gallery_items';
const EVENTS_KEY = 'event_items';
const ADMIN_USER_KEY = 'admin_user';
const AUDIT_KEY = 'admin_audit_log';
const SESSION_USER_KEY = 'adminUserEmail';
const SESSION_EXPIRES_KEY = 'adminSessionExpiresAt';
const LOGIN_ATTEMPTS_KEY = 'adminLoginAttempts';
const MAX_IMAGE_WIDTH = 1400;
const SESSION_DURATION_MS = 30 * 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const PASSWORD_ITERATIONS = 150000;
const BACKUP_VERSION = 1;

let eventImageData = '';
let galleryImageData = '';

/* ===== UTILIDADES ===== */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readJson(key, fallback = []) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function readObject(key, fallback = {}) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getStoredAdminUser() {
  const stored = readObject(ADMIN_USER_KEY, null);
  if (stored && stored.email && (stored.passwordHash || stored.password)) {
    return {
      name: stored.name || 'Administrador',
      email: normalizeEmail(stored.email),
      password: stored.password || '',
      passwordHash: stored.passwordHash || '',
      salt: stored.salt || '',
      iterations: stored.iterations || PASSWORD_ITERATIONS,
      version: stored.version || 1,
    };
  }

  return null;
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function derivePasswordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function createPasswordRecord(password) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = bytesToBase64(saltBytes);
  return {
    salt,
    iterations: PASSWORD_ITERATIONS,
    passwordHash: await derivePasswordHash(password, salt, PASSWORD_ITERATIONS),
  };
}

async function saveAdminUser(user) {
  const passwordRecord = user.password
    ? await createPasswordRecord(user.password)
    : {
        passwordHash: user.passwordHash,
        salt: user.salt,
        iterations: user.iterations || PASSWORD_ITERATIONS,
      };

  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify({
    name: String(user.name || 'Administrador').trim(),
    email: normalizeEmail(user.email),
    passwordHash: passwordRecord.passwordHash,
    salt: passwordRecord.salt,
    iterations: passwordRecord.iterations,
    version: 2,
    updatedAt: new Date().toISOString(),
  }));
}

async function migrateLegacyAdminUser() {
  const stored = getStoredAdminUser();
  if (!stored || !stored.password || stored.passwordHash) return;
  await saveAdminUser({
    name: stored.name,
    email: stored.email,
    password: stored.password,
  });
}

async function verifyPassword(password, user) {
  if (!user || !user.passwordHash || !user.salt) return false;
  const attemptedHash = await derivePasswordHash(password, user.salt, user.iterations);
  return timingSafeEqual(attemptedHash, user.passwordHash);
}

function getCurrentUser() {
  const admin = getStoredAdminUser() || { name: 'Administrador', email: '' };
  return {
    name: admin.name,
    email: sessionStorage.getItem(SESSION_USER_KEY) || admin.email,
  };
}

function authorText(author) {
  if (!author) return '';
  if (typeof author === 'string') return author;
  return author.name || author.email || '';
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('es-EC', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return dateStr;
  }
}

function getAuditLog() {
  return readJson(AUDIT_KEY);
}

function saveAuditLog(items) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(items.slice(0, 150)));
}

function addAudit(action, detail = '') {
  const entry = {
    id: uid(),
    timestamp: new Date().toISOString(),
    action,
    detail: String(detail || '').slice(0, 240),
    user: getCurrentUser(),
  };
  saveAuditLog([entry, ...getAuditLog()]);
  renderAuditLog();
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isSafeImageSource(src) {
  const value = String(src || '').trim();
  if (!value) return true;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (error) {
    return false;
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (error) {
    return dateStr;
  }
}

function normalizeEvent(item) {
  return {
    id: item.id || uid(),
    titulo: item.titulo || '',
    categoria: item.categoria || 'Evento',
    fecha: item.fecha || '',
    hora: item.hora || '',
    lugar: item.lugar || '',
    descripcion: item.descripcion || '',
    imagen: isSafeImageSource(item.imagen) ? item.imagen || '' : '',
    publicado: item.publicado !== false,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || '',
    createdBy: item.createdBy || '',
    updatedBy: item.updatedBy || '',
  };
}

function getEvents() {
  return readJson(EVENTS_KEY).map(normalizeEvent);
}

function saveEvents(items) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(items.map(normalizeEvent)));
}

function buildFullBackup() {
  const admin = getStoredAdminUser();
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: getCurrentUser(),
    admin: admin ? { name: admin.name, email: admin.email } : null,
    events: getEvents(),
    gallery: getGallery(),
    audit: getAuditLog(),
  };
}

function restoreFullBackup(data) {
  const events = Array.isArray(data.events) ? data.events : [];
  const gallery = Array.isArray(data.gallery) ? data.gallery : [];
  const audit = Array.isArray(data.audit) ? data.audit : [];

  saveEvents(events.map(normalizeEvent));
  saveGallery(gallery.map(item => ({
    ...item,
    url: isSafeImageSource(item.url) ? item.url : '',
  })).filter(item => item.url));
  saveAuditLog(audit);
  addAudit('Respaldo importado', `${events.length} eventos, ${gallery.length} imagenes`);
}

function showToast(msg) {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function setPreview(src) {
  const preview = document.getElementById('event-image-preview');
  const clearBtn = document.getElementById('btn-clear-image');
  if (!preview || !clearBtn) return;

  if (!src) {
    preview.innerHTML = 'Sin imagen seleccionada';
    clearBtn.classList.add('hidden');
    return;
  }

  preview.innerHTML = `<img src="${esc(src)}" alt="Vista previa de imagen del evento" />`;
  clearBtn.classList.remove('hidden');
}

function setGalleryPreview(src) {
  const preview = document.getElementById('gallery-image-preview');
  const clearBtn = document.getElementById('btn-clear-gallery-image');
  if (!preview || !clearBtn) return;

  if (!src) {
    preview.innerHTML = 'Sin imagen seleccionada';
    clearBtn.classList.add('hidden');
    return;
  }

  preview.innerHTML = `<img src="${esc(src)}" alt="Vista previa de imagen para galeria" />`;
  clearBtn.classList.remove('hidden');
}

function resetGalleryForm() {
  const form = document.getElementById('form-gallery');
  if (form) form.reset();
  galleryImageData = '';
  setGalleryPreview('');
}

function resetEventForm() {
  const form = document.getElementById('form-events');
  const title = document.getElementById('event-form-title');
  const editIndex = document.getElementById('event-edit-index');
  const saveBtn = document.getElementById('btn-save-event');
  const cancelBtn = document.getElementById('btn-cancel-edit');

  if (form) form.reset();
  if (title) title.textContent = 'Agregar evento';
  if (editIndex) editIndex.value = '';
  if (saveBtn) saveBtn.textContent = 'Guardar evento';
  if (cancelBtn) cancelBtn.classList.add('hidden');

  eventImageData = '';
  setPreview('');
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Selecciona un archivo de imagen.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo cargar el archivo.'));
    reader.readAsDataURL(file);
  });
}

/* ===== AUTENTICACION ===== */
function getLoginAttempts() {
  return readObject(LOGIN_ATTEMPTS_KEY, { count: 0, lockedUntil: 0 });
}

function saveLoginAttempts(attempts) {
  localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
}

function clearLoginAttempts() {
  localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
}

function registerFailedLogin() {
  const attempts = getLoginAttempts();
  const nextCount = (attempts.count || 0) + 1;
  const lockedUntil = nextCount >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  saveLoginAttempts({ count: nextCount, lockedUntil });
  return { count: nextCount, lockedUntil };
}

function isLoginLocked() {
  const attempts = getLoginAttempts();
  return attempts.lockedUntil && Date.now() < attempts.lockedUntil;
}

function loginLockMessage() {
  const attempts = getLoginAttempts();
  const remainingMs = Math.max((attempts.lockedUntil || 0) - Date.now(), 0);
  const minutes = Math.ceil(remainingMs / 60000);
  return `Demasiados intentos. Espera ${minutes} minuto${minutes === 1 ? '' : 's'} antes de volver a intentar.`;
}

function setSession(email) {
  sessionStorage.setItem('adminAuth', '1');
  sessionStorage.setItem(SESSION_USER_KEY, email);
  sessionStorage.setItem(SESSION_EXPIRES_KEY, String(Date.now() + SESSION_DURATION_MS));
}

function clearSession() {
  sessionStorage.removeItem('adminAuth');
  sessionStorage.removeItem(SESSION_USER_KEY);
  sessionStorage.removeItem(SESSION_EXPIRES_KEY);
}

function hasValidSession() {
  const active = sessionStorage.getItem('adminAuth') === '1';
  const email = sessionStorage.getItem(SESSION_USER_KEY);
  const expiresAt = Number(sessionStorage.getItem(SESSION_EXPIRES_KEY) || '0');
  return active && email && expiresAt > Date.now();
}

function setLoginMode() {
  const hasUser = Boolean(getStoredAdminUser());
  const nameWrap = document.getElementById('setup-name-wrap');
  const help = document.getElementById('login-help');
  const button = document.getElementById('btn-login');

  if (nameWrap) nameWrap.classList.toggle('hidden', hasUser);
  if (button) button.textContent = hasUser ? 'Ingresar' : 'Crear cuenta de administrador';
  if (help) {
    help.textContent = hasUser
      ? 'Ingresa con el correo y clave configurados para la persona encargada.'
      : 'Primera configuración: crea el correo y clave de la persona encargada. Usa una clave de 8 caracteres o más.';
  }
}

function checkAuth() {
  setLoginMode();
  if (hasValidSession()) {
    showDashboard();
  } else {
    clearSession();
  }
}

document.getElementById('input-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('input-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = normalizeEmail(document.getElementById('input-email').value);
  const pass = document.getElementById('input-pass').value;
  const name = document.getElementById('input-name').value.trim();
  const admin = getStoredAdminUser();
  const errorEl = document.getElementById('login-error');
  const inputEl = document.getElementById('input-pass');

  if (errorEl) errorEl.classList.add('hidden');

  if (!admin) {
    if (!name || !email || pass.length < 8) {
      errorEl.textContent = 'Completa nombre, correo y una clave de al menos 8 caracteres.';
      errorEl.classList.remove('hidden');
      return;
    }

    await saveAdminUser({ name, email, password: pass });
    setSession(email);
    clearLoginAttempts();
    showDashboard();
    addAudit('Cuenta creada', email);
    showToast('Cuenta de administrador creada.');
    return;
  }

  if (isLoginLocked()) {
    errorEl.textContent = loginLockMessage();
    errorEl.classList.remove('hidden');
    return;
  }

  const validPassword = await verifyPassword(pass, admin);
  if (email === admin.email && validPassword) {
    setSession(admin.email);
    clearLoginAttempts();
    showDashboard();
    addAudit('Inicio de sesion', admin.email);
  } else {
    const attempts = registerFailedLogin();
    errorEl.textContent = attempts.lockedUntil
      ? loginLockMessage()
      : `Correo o clave incorrectos. Intento ${attempts.count} de ${MAX_LOGIN_ATTEMPTS}.`;
    errorEl.classList.remove('hidden');
    inputEl.classList.add('shake');
    inputEl.value = '';
    inputEl.focus();
    setTimeout(() => inputEl.classList.remove('shake'), 500);
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  clearSession();
  location.reload();
});

function showDashboard() {
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-dashboard').classList.remove('hidden');
  fillSettingsForm();
  updateAdminLabel();
  renderGallery();
  renderEvents();
  renderAuditLog();
}

function updateAdminLabel() {
  const label = document.getElementById('current-admin-label');
  if (!label) return;
  const user = getCurrentUser();
  label.textContent = `${user.name} · ${user.email}`;
}

function renderAuditLog() {
  const container = document.getElementById('audit-list');
  if (!container) return;

  const entries = getAuditLog().slice(0, 40);
  if (!entries.length) {
    container.innerHTML = '<p class="text-sm text-gray-400 py-6 text-center">No hay acciones registradas todavia.</p>';
    return;
  }

  container.innerHTML = entries.map(entry => `
    <div class="border border-red-100 rounded-xl p-3 bg-white">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <p class="text-sm font-bold text-gray-800">${esc(entry.action)}</p>
        <p class="text-xs text-gray-400">${formatDateTime(entry.timestamp)}</p>
      </div>
      ${entry.detail ? `<p class="text-xs text-gray-500 mt-1">${esc(entry.detail)}</p>` : ''}
      <p class="text-[11px] text-red-700 mt-2">Usuario: ${esc(authorText(entry.user) || 'No registrado')}</p>
    </div>
  `).join('');
}

/* ===== TABS ===== */
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    document.querySelectorAll('[data-tab]').forEach(tab => {
      const active = tab.dataset.tab === target;
      tab.classList.toggle('bg-red-700', active);
      tab.classList.toggle('text-white', active);
      tab.classList.toggle('text-gray-600', !active);
      tab.classList.toggle('border', !active);
      tab.classList.toggle('border-gray-200', !active);
      tab.classList.toggle('hover:border-red-300', !active);
    });

    document.querySelectorAll('[data-panel]').forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.panel !== target);
    });
  });
});

/* ===== GALERIA ===== */
function getGallery() {
  return readJson(GALLERY_KEY).map(item => ({
    ...item,
    url: isSafeImageSource(item.url) ? item.url || '' : '',
  })).filter(item => item.url);
}

function saveGallery(items) {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
}

function renderGallery() {
  const items = getGallery();
  const container = document.getElementById('gallery-list');
  const count = document.getElementById('gallery-count');

  if (count) count.textContent = items.length + (items.length === 1 ? ' imagen' : ' imagenes');

  if (!items.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm col-span-full text-center py-10">No hay imagenes en la galeria aun.<br>Agrega la primera usando el formulario de arriba.</p>';
    return;
  }

  container.innerHTML = items.map((item, index) => `
    <div class="relative group rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      <div class="h-36 bg-gray-100 overflow-hidden">
        <img src="${esc(item.url)}" alt="${esc(item.caption)}"
             class="w-full h-full object-cover"
             onerror="this.parentElement.innerHTML='<div class=&quot;w-full h-full flex items-center justify-center text-gray-300 text-xs&quot;>Imagen no disponible</div>'" />
      </div>
      <div class="p-3">
        <p class="text-sm text-gray-700 leading-snug line-clamp-2">${esc(item.caption)}</p>
        ${item.createdBy ? `<p class="text-[11px] text-gray-400 mt-2">Subida por ${esc(authorText(item.createdBy))}</p>` : ''}
      </div>
      <button onclick="deleteGalleryItem(${index})"
              class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
              aria-label="Eliminar imagen: ${esc(item.caption)}">
        Eliminar
      </button>
    </div>
  `).join('');
}

window.deleteGalleryItem = function(index) {
  if (!confirm('Eliminar esta imagen de la galeria?')) return;
  const items = getGallery();
  items.splice(index, 1);
  saveGallery(items);
  renderGallery();
  addAudit('Imagen eliminada', 'Galeria institucional');
  showToast('Imagen eliminada.');
};

document.getElementById('form-gallery').addEventListener('submit', e => {
  e.preventDefault();
  const url = document.getElementById('gallery-url').value.trim();
  const caption = document.getElementById('gallery-caption').value.trim();
  const image = galleryImageData || url;
  if (!image || !caption) {
    showToast('Agrega una imagen y una descripcion.');
    return;
  }
  if (!isSafeImageSource(image)) {
    showToast('La imagen debe ser un archivo subido o un enlace http/https valido.');
    return;
  }

  const items = getGallery();
  items.unshift({
    url: image,
    caption,
    createdAt: new Date().toISOString(),
    createdBy: getCurrentUser(),
  });
  saveGallery(items);
  renderGallery();
  resetGalleryForm();
  document.getElementById('gallery-file').focus();
  addAudit('Imagen agregada', caption);
  showToast('Imagen agregada a la galeria.');
});

document.getElementById('gallery-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    galleryImageData = await resizeImageFile(file);
    document.getElementById('gallery-url').value = '';
    setGalleryPreview(galleryImageData);
    showToast('Imagen lista para agregar.');
  } catch (error) {
    showToast(error.message || 'No se pudo cargar la imagen.');
  }
});

document.getElementById('gallery-url').addEventListener('input', e => {
  const url = e.target.value.trim();
  if (!url) {
    if (!galleryImageData) setGalleryPreview('');
    return;
  }
  if (!isSafeImageSource(url)) {
    setGalleryPreview('');
    showToast('Usa un enlace de imagen http/https valido.');
    return;
  }
  galleryImageData = '';
  document.getElementById('gallery-file').value = '';
  setGalleryPreview(url);
});

document.getElementById('btn-clear-gallery-image').addEventListener('click', () => {
  galleryImageData = '';
  document.getElementById('gallery-url').value = '';
  document.getElementById('gallery-file').value = '';
  setGalleryPreview('');
});

/* ===== EVENTOS ===== */
function renderEvents() {
  const items = getEvents();
  const container = document.getElementById('events-list');
  const count = document.getElementById('events-count');
  const published = items.filter(item => item.publicado).length;

  if (count) count.textContent = `${published} publicados / ${items.length} total`;

  if (!items.length) {
    container.innerHTML = '<p class="text-gray-500 text-sm col-span-full text-center py-12 bg-white border border-red-100 rounded-2xl">No hay eventos registrados aun.<br>Usa el formulario para agregar el primero.</p>';
    return;
  }

  container.innerHTML = items.map(item => {
    const statusClass = item.publicado ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200';
    const statusText = item.publicado ? 'Publicado' : 'Oculto';
    const image = item.imagen
      ? `<img src="${esc(item.imagen)}" alt="${esc(item.titulo)}" class="w-full h-36 object-cover" />`
      : `<div class="w-full h-36 bg-gradient-to-br from-red-700 to-red-950 flex items-center justify-center">
           <span class="text-white/80 text-xs font-bold uppercase tracking-[0.18em]">${esc(item.categoria)}</span>
         </div>`;

    return `
      <article class="relative bg-white border border-red-100 rounded-2xl overflow-hidden shadow-sm">
        ${image}
        <div class="p-4">
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="text-[11px] font-bold text-red-700 uppercase tracking-wide">${esc(item.categoria)}</span>
            <span class="text-[11px] font-semibold border px-2 py-0.5 rounded-full ${statusClass}">${statusText}</span>
          </div>
          <h4 class="font-bold text-gray-900 text-sm leading-tight">${esc(item.titulo)}</h4>
          <p class="text-xs text-red-700 font-semibold mt-1">
            ${formatDate(item.fecha)}${item.hora ? ' - ' + esc(item.hora) : ''}
          </p>
          ${item.lugar ? `<p class="text-xs text-gray-500 mt-1">${esc(item.lugar)}</p>` : ''}
          <p class="text-xs text-gray-600 mt-3 leading-relaxed line-clamp-2">${esc(item.descripcion)}</p>
          ${item.createdBy ? `<p class="text-[11px] text-gray-400 mt-3">Creado por ${esc(authorText(item.createdBy))}</p>` : ''}
          ${item.updatedBy ? `<p class="text-[11px] text-gray-400 mt-1">Último cambio: ${esc(authorText(item.updatedBy))}</p>` : ''}
          <div class="grid grid-cols-3 gap-2 mt-4">
            <button onclick="editEventItem('${esc(item.id)}')" class="btn-ghost py-2 text-xs" type="button">Editar</button>
            <button onclick="toggleEventPublish('${esc(item.id)}')" class="btn-ghost py-2 text-xs" type="button">${item.publicado ? 'Ocultar' : 'Publicar'}</button>
            <button onclick="deleteEventItem('${esc(item.id)}')" class="bg-red-50 hover:bg-red-100 text-red-700 rounded-xl py-2 text-xs font-bold" type="button">Eliminar</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

document.getElementById('event-imagen-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    eventImageData = await resizeImageFile(file);
    document.getElementById('event-imagen').value = '';
    setPreview(eventImageData);
    showToast('Imagen lista para guardar.');
  } catch (error) {
    showToast(error.message || 'No se pudo cargar la imagen.');
  }
});

document.getElementById('event-imagen').addEventListener('input', e => {
  const url = e.target.value.trim();
  if (!url) {
    if (!eventImageData) setPreview('');
    return;
  }
  if (!isSafeImageSource(url)) {
    setPreview('');
    showToast('Usa un enlace de imagen http/https valido.');
    return;
  }
  eventImageData = '';
  document.getElementById('event-imagen-file').value = '';
  setPreview(url);
});

document.getElementById('btn-clear-image').addEventListener('click', () => {
  eventImageData = '';
  document.getElementById('event-imagen').value = '';
  document.getElementById('event-imagen-file').value = '';
  setPreview('');
});

document.getElementById('btn-cancel-edit').addEventListener('click', resetEventForm);

document.getElementById('form-events').addEventListener('submit', e => {
  e.preventDefault();

  const editId = document.getElementById('event-edit-index').value;
  const imageUrl = document.getElementById('event-imagen').value.trim();
  if (imageUrl && !isSafeImageSource(imageUrl)) {
    showToast('La imagen del evento debe ser un archivo subido o un enlace http/https valido.');
    return;
  }
  const eventData = normalizeEvent({
    id: editId || uid(),
    titulo: document.getElementById('event-titulo').value.trim(),
    categoria: document.getElementById('event-categoria').value,
    fecha: document.getElementById('event-fecha').value,
    hora: document.getElementById('event-hora').value,
    lugar: document.getElementById('event-lugar').value.trim(),
    descripcion: document.getElementById('event-descripcion').value.trim(),
    imagen: eventImageData || imageUrl,
    publicado: document.getElementById('event-publicado').checked,
    updatedAt: new Date().toISOString(),
    updatedBy: getCurrentUser(),
  });

  if (!eventData.titulo || !eventData.fecha || !eventData.descripcion) return;

  let items = getEvents();
  if (editId) {
    items = items.map(item => item.id === editId
      ? { ...eventData, createdAt: item.createdAt || eventData.createdAt, createdBy: item.createdBy || eventData.updatedBy }
      : item);
    addAudit('Evento actualizado', eventData.titulo);
    showToast('Evento actualizado.');
  } else {
    items.unshift({
      ...eventData,
      createdAt: new Date().toISOString(),
      createdBy: getCurrentUser(),
      updatedBy: '',
    });
    addAudit('Evento creado', eventData.titulo);
    showToast('Evento guardado.');
  }

  saveEvents(items);
  renderEvents();
  resetEventForm();
});

window.editEventItem = function(id) {
  const item = getEvents().find(event => event.id === id);
  if (!item) return;

  document.getElementById('event-form-title').textContent = 'Editar evento';
  document.getElementById('event-edit-index').value = item.id;
  document.getElementById('event-titulo').value = item.titulo;
  document.getElementById('event-categoria').value = item.categoria;
  document.getElementById('event-fecha').value = item.fecha;
  document.getElementById('event-hora').value = item.hora;
  document.getElementById('event-lugar').value = item.lugar;
  document.getElementById('event-descripcion').value = item.descripcion;
  document.getElementById('event-publicado').checked = item.publicado;
  document.getElementById('event-imagen').value = item.imagen && !item.imagen.startsWith('data:') ? item.imagen : '';
  document.getElementById('event-imagen-file').value = '';
  document.getElementById('btn-save-event').textContent = 'Actualizar evento';
  document.getElementById('btn-cancel-edit').classList.remove('hidden');

  eventImageData = item.imagen && item.imagen.startsWith('data:') ? item.imagen : '';
  setPreview(item.imagen);
  document.getElementById('form-events').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.toggleEventPublish = function(id) {
  const items = getEvents().map(item => item.id === id
    ? { ...item, publicado: !item.publicado, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser() }
    : item);
  saveEvents(items);
  renderEvents();
  addAudit('Estado de evento cambiado', id);
  showToast('Estado del evento actualizado.');
};

window.deleteEventItem = function(id) {
  const item = getEvents().find(event => event.id === id);
  if (!item) return;
  if (!confirm(`Eliminar el evento "${item.titulo}"?`)) return;

  saveEvents(getEvents().filter(event => event.id !== id));
  renderEvents();
  resetEventForm();
  addAudit('Evento eliminado', item.titulo);
  showToast('Evento eliminado.');
};

document.getElementById('btn-export-events').addEventListener('click', () => {
  addAudit('Eventos respaldados', 'Exportacion de eventos');
  downloadJson('eventos-uemop.json', getEvents());
});

document.getElementById('event-import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const items = Array.isArray(parsed) ? parsed : parsed.events;
      if (!Array.isArray(items)) throw new Error('Formato invalido.');
      if (!confirm('Importar este archivo reemplazara los eventos actuales. Continuar?')) return;
      saveEvents(items.map(normalizeEvent));
      renderEvents();
      resetEventForm();
      addAudit('Eventos importados', `${items.length} eventos`);
      showToast('Eventos importados.');
    } catch (error) {
      showToast('No se pudo importar el archivo.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
});

document.getElementById('btn-export-all').addEventListener('click', () => {
  addAudit('Respaldo completo descargado', 'Eventos, galeria y bitacora');
  downloadJson('respaldo-uemop-completo.json', buildFullBackup());
});

document.getElementById('backup-import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || (!Array.isArray(parsed.events) && !Array.isArray(parsed.gallery))) {
        throw new Error('Formato invalido.');
      }
      if (!confirm('Importar este respaldo reemplazara eventos, galeria y bitacora actuales. Continuar?')) return;
      restoreFullBackup(parsed);
      renderEvents();
      renderGallery();
      renderAuditLog();
      resetEventForm();
      resetGalleryForm();
      showToast('Respaldo completo importado.');
    } catch (error) {
      showToast('No se pudo importar el respaldo.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
});

document.getElementById('btn-clear-audit').addEventListener('click', () => {
  if (!confirm('Limpiar la bitacora local? Esta accion no elimina eventos ni galeria.')) return;
  saveAuditLog([]);
  addAudit('Bitacora limpiada', 'Se inicio un nuevo registro local');
  renderAuditLog();
  showToast('Bitacora limpiada.');
});

/* ===== CONFIGURACION DE ACCESO ===== */
function fillSettingsForm() {
  const admin = getStoredAdminUser();
  if (!admin) return;
  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  const loginEmailInput = document.getElementById('input-email');

  if (nameInput) nameInput.value = admin.name;
  if (emailInput) emailInput.value = admin.email;
  if (loginEmailInput && !loginEmailInput.value) loginEmailInput.value = admin.email;
}

document.getElementById('form-settings').addEventListener('submit', async e => {
  e.preventDefault();

  const current = getStoredAdminUser();
  if (!current) return;
  const name = document.getElementById('settings-name').value.trim();
  const email = normalizeEmail(document.getElementById('settings-email').value);
  const password = document.getElementById('settings-password').value;
  const passwordConfirm = document.getElementById('settings-password-confirm').value;

  if (!name || !email) {
    showToast('Completa nombre y correo.');
    return;
  }

  if (password || passwordConfirm) {
    if (password.length < 8) {
      showToast('La nueva clave debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== passwordConfirm) {
      showToast('Las claves no coinciden.');
      return;
    }
  }

  const payload = password
    ? { name, email, password }
    : {
        name,
        email,
        passwordHash: current.passwordHash,
        salt: current.salt,
        iterations: current.iterations,
      };

  await saveAdminUser({
    ...payload,
    name,
    email,
  });

  sessionStorage.setItem(SESSION_USER_KEY, email);
  document.getElementById('settings-password').value = '';
  document.getElementById('settings-password-confirm').value = '';
  fillSettingsForm();
  updateAdminLabel();
  addAudit('Configuracion actualizada', password ? 'Correo/nombre y clave' : 'Correo/nombre');
  showToast('Configuracion guardada.');
});

/* ===== INIT ===== */
async function initAdmin() {
  await migrateLegacyAdminUser();
  fillSettingsForm();
  setLoginMode();
  checkAuth();

  setInterval(() => {
    const dashboardVisible = !document.getElementById('screen-dashboard').classList.contains('hidden');
    if (dashboardVisible && !hasValidSession()) {
      clearSession();
      showToast('La sesion expiro. Vuelve a ingresar.');
      setTimeout(() => location.reload(), 1200);
    }
  }, 60000);
}

initAdmin();
