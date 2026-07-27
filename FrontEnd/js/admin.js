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
const MAX_IMAGE_FILE_SIZE = 3 * 1024 * 1024;
const MAX_JSON_FILE_SIZE = 1 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_TEXT = {
  name: 80,
  email: 160,
  title: 140,
  category: 40,
  location: 120,
  description: 1000,
  caption: 160,
};

let eventImageData = '';
let galleryImageData = '';

/* ===== UTILIDADES =====
   esc, cleanText e isSafeImageSource viven en js/shared.js (cargado antes
   que este archivo) para no duplicar la validación de imágenes. */
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
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
    name: cleanText(user.name || 'Administrador', MAX_TEXT.name),
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

function normalizeAuthor(author) {
  if (!author) return '';
  if (typeof author === 'string') return cleanText(author, MAX_TEXT.email);
  if (typeof author !== 'object' || Array.isArray(author)) return '';

  return {
    name: cleanText(author.name, MAX_TEXT.name),
    email: isValidEmail(author.email) ? normalizeEmail(author.email) : '',
  };
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
  return readJson(AUDIT_KEY).map(normalizeAuditEntry);
}

function saveAuditLog(items) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(items.map(normalizeAuditEntry).slice(0, 150)));
}

function addAudit(action, detail = '') {
  const entry = {
    id: uid(),
    timestamp: new Date().toISOString(),
    action: cleanText(action, 120),
    detail: cleanText(detail, 240),
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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeAuditEntry(entry) {
  return {
    id: cleanText(entry && entry.id, 80) || uid(),
    timestamp: cleanText(entry && entry.timestamp, 40),
    action: cleanText(entry && entry.action, 120),
    detail: cleanText(entry && entry.detail, 240),
    user: normalizeAuthor(entry && entry.user),
  };
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
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  return {
    id: cleanText(source.id, 80) || uid(),
    titulo: cleanText(source.titulo, MAX_TEXT.title),
    categoria: cleanText(source.categoria || 'Evento', MAX_TEXT.category),
    fecha: cleanText(source.fecha, 20),
    hora: cleanText(source.hora, 20),
    lugar: cleanText(source.lugar, MAX_TEXT.location),
    descripcion: cleanText(source.descripcion, MAX_TEXT.description),
    imagen: isSafeImageSource(source.imagen) ? String(source.imagen || '').trim() : '',
    publicado: source.publicado !== false,
    createdAt: cleanText(source.createdAt, 40) || new Date().toISOString(),
    updatedAt: cleanText(source.updatedAt, 40),
    createdBy: normalizeAuthor(source.createdBy),
    updatedBy: normalizeAuthor(source.updatedBy),
  };
}

function normalizeGalleryItem(item) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  return {
    url: isSafeImageSource(source.url) ? String(source.url || '').trim() : '',
    caption: cleanText(source.caption, MAX_TEXT.caption),
    categoria: cleanText(source.categoria || 'Actos y Ceremonias', MAX_TEXT.category),
    publicado: source.publicado !== false,
    createdAt: cleanText(source.createdAt, 40) || new Date().toISOString(),
    createdBy: normalizeAuthor(source.createdBy),
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
  saveGallery(gallery.map(normalizeGalleryItem));
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

  preview.replaceChildren();
  if (!src) {
    preview.textContent = 'Sin imagen seleccionada';
    clearBtn.classList.add('hidden');
    return;
  }

  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Vista previa de imagen del evento';
  preview.appendChild(img);
  clearBtn.classList.remove('hidden');
}

function setGalleryPreview(src) {
  const preview = document.getElementById('gallery-image-preview');
  const clearBtn = document.getElementById('btn-clear-gallery-image');
  if (!preview || !clearBtn) return;

  preview.replaceChildren();
  if (!src) {
    preview.textContent = 'Sin imagen seleccionada';
    clearBtn.classList.add('hidden');
    return;
  }

  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Vista previa de imagen para galeria';
  preview.appendChild(img);
  clearBtn.classList.remove('hidden');
}

function resetGalleryForm() {
  const form = document.getElementById('form-gallery');
  const title = document.getElementById('gallery-form-title');
  const editIndex = document.getElementById('gallery-edit-index');
  const saveBtn = document.getElementById('btn-save-gallery');
  const cancelBtn = document.getElementById('btn-cancel-gallery-edit');

  if (form) form.reset();
  if (title) title.textContent = 'Agregar imagen a la galería';
  if (editIndex) editIndex.value = '';
  if (saveBtn) saveBtn.textContent = 'Agregar imagen';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  document.getElementById('gallery-caption')?.dispatchEvent(new Event('input'));
  galleryImageData = '';
  setGalleryPreview('');
}

function setFieldError(inputEl, errorEl, hasError) {
  if (!inputEl) return;
  inputEl.setAttribute('aria-invalid', String(!!hasError));
  inputEl.classList.toggle('border-red-300', !!hasError);
  if (errorEl) errorEl.classList.toggle('hidden', !hasError);
}

function clearEventFormErrors() {
  ['event-titulo', 'event-fecha', 'event-descripcion'].forEach(id => {
    setFieldError(document.getElementById(id), document.getElementById('error-' + id), false);
  });
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

  clearEventFormErrors();
  document.getElementById('event-categoria')?.dispatchEvent(new Event('change'));
  document.getElementById('event-titulo')?.dispatchEvent(new Event('input'));
  document.getElementById('event-descripcion')?.dispatchEvent(new Event('input'));

  eventImageData = '';
  setPreview('');
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
      reject(new Error('Selecciona un archivo de imagen.'));
      return;
    }
    if (file.size > MAX_IMAGE_FILE_SIZE) {
      reject(new Error('La imagen no debe superar 3 MB.'));
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

function isValidJsonImportFile(file) {
  return Boolean(file)
    && file.size <= MAX_JSON_FILE_SIZE
    && /\.json$/i.test(file.name || '');
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
  const name = cleanText(document.getElementById('input-name').value, MAX_TEXT.name);
  const admin = getStoredAdminUser();
  const errorEl = document.getElementById('login-error');
  const inputEl = document.getElementById('input-pass');

  if (errorEl) errorEl.classList.add('hidden');

  if (!admin) {
    if (!name || !isValidEmail(email) || pass.length < 8) {
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
  return readJson(GALLERY_KEY).map(normalizeGalleryItem).filter(item => item.url && item.caption);
}

function saveGallery(items) {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(items.map(normalizeGalleryItem).filter(item => item.url && item.caption)));
}

function renderGallery() {
  const items = getGallery();
  const container = document.getElementById('gallery-list');
  const count = document.getElementById('gallery-count');

  const publishedCount = items.filter(item => item.publicado).length;
  if (count) count.textContent = `${publishedCount} publicadas / ${items.length} total`;

  if (!items.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm col-span-full text-center py-10">No hay imagenes en la galeria aun.<br>Agrega la primera usando el formulario de arriba.</p>';
    return;
  }

  container.innerHTML = items.map((item, index) => {
    const statusClass = item.publicado ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200';
    const statusText = item.publicado ? 'Publicado' : 'Oculto';
    return `
    <div class="relative rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      <div class="h-36 bg-gray-100 overflow-hidden">
        <img src="${esc(item.url)}" alt="${esc(item.caption)}"
             class="w-full h-full object-cover" />
      </div>
      <div class="p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-bold text-red-700 uppercase tracking-wide">${esc(item.categoria)}</span>
          <span class="text-[11px] font-semibold border px-2 py-0.5 rounded-full ${statusClass}">${statusText}</span>
        </div>
        <p class="text-sm text-gray-700 leading-snug line-clamp-2 mt-1">${esc(item.caption)}</p>
        ${item.createdBy ? `<p class="text-[11px] text-gray-400 mt-2">Subida por ${esc(authorText(item.createdBy))}</p>` : ''}
      </div>
      <div class="absolute top-2 right-2 flex gap-1">
        <button data-gallery-action="toggle" data-gallery-index="${index}"
                class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs px-2 py-1 rounded-lg shadow-sm"
                aria-label="${item.publicado ? 'Ocultar' : 'Publicar'} imagen: ${esc(item.caption)}">
          ${item.publicado ? 'Ocultar' : 'Publicar'}
        </button>
        <button data-gallery-action="edit" data-gallery-index="${index}"
                class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs px-2 py-1 rounded-lg shadow-sm"
                aria-label="Editar imagen: ${esc(item.caption)}">
          Editar
        </button>
        <button data-gallery-action="delete" data-gallery-index="${index}"
                class="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded-lg"
                aria-label="Eliminar imagen: ${esc(item.caption)}">
          Eliminar
        </button>
      </div>
    </div>
  `;
  }).join('');
}

function deleteGalleryItem(index) {
  if (!confirm('Eliminar esta imagen de la galeria?')) return;
  const items = getGallery();
  items.splice(index, 1);
  saveGallery(items);
  renderGallery();
  addAudit('Imagen eliminada', 'Galeria institucional');
  showToast('Imagen eliminada.');
}

function toggleGalleryPublish(index) {
  const items = getGallery();
  if (!items[index]) return;
  items[index] = { ...items[index], publicado: !items[index].publicado };
  saveGallery(items);
  renderGallery();
  addAudit('Estado de imagen cambiado', items[index].caption);
  showToast('Estado de la imagen actualizado.');
}

document.getElementById('gallery-list').addEventListener('click', e => {
  const button = e.target.closest('[data-gallery-action]');
  if (!button) return;
  const index = Number(button.dataset.galleryIndex);
  if (!Number.isInteger(index)) return;
  if (button.dataset.galleryAction === 'edit') editGalleryItem(index);
  if (button.dataset.galleryAction === 'delete') deleteGalleryItem(index);
  if (button.dataset.galleryAction === 'toggle') toggleGalleryPublish(index);
});

document.getElementById('form-gallery').addEventListener('submit', e => {
  e.preventDefault();
  const url = document.getElementById('gallery-url').value.trim();
  const caption = cleanText(document.getElementById('gallery-caption').value, MAX_TEXT.caption);
  const categoria = cleanText(document.getElementById('gallery-categoria').value, MAX_TEXT.category);
  const publicado = document.getElementById('gallery-publicado').checked;
  const image = galleryImageData || url;
  const editIndexVal = document.getElementById('gallery-edit-index').value;
  const editIndex = editIndexVal !== '' ? parseInt(editIndexVal, 10) : -1;
  const isEditing = editIndex >= 0;

  if (!caption) {
    showToast('Escribe una descripcion para la imagen.');
    return;
  }
  if (!categoria) {
    showToast('Selecciona una categoria para la imagen.');
    return;
  }
  if (!isEditing && !image) {
    showToast('Agrega una imagen y una descripcion.');
    return;
  }
  if (image && !isSafeImageSource(image)) {
    showToast('La imagen debe ser un archivo subido o un enlace HTTPS valido.');
    return;
  }

  const items = getGallery();
  if (isEditing && editIndex < items.length) {
    items[editIndex] = normalizeGalleryItem({
      ...items[editIndex],
      caption,
      categoria,
      publicado,
      url: image || items[editIndex].url,
    });
    saveGallery(items);
    renderGallery();
    resetGalleryForm();
    addAudit('Caption de imagen actualizado', caption);
    showToast('Imagen actualizada.');
  } else {
    items.unshift({
      url: image,
      caption,
      categoria,
      publicado,
      createdAt: new Date().toISOString(),
      createdBy: getCurrentUser(),
    });
    saveGallery(items);
    renderGallery();
    resetGalleryForm();
    document.getElementById('gallery-file').focus();
    addAudit('Imagen agregada', caption);
    showToast('Imagen agregada a la galeria.');
  }
});

function editGalleryItem(index) {
  const items = getGallery();
  const item = items[index];
  if (!item) return;

  document.getElementById('gallery-form-title').textContent = 'Editar imagen';
  document.getElementById('gallery-edit-index').value = index;
  document.getElementById('gallery-caption').value = item.caption;
  document.getElementById('gallery-categoria').value = item.categoria || '';
  document.getElementById('gallery-publicado').checked = item.publicado !== false;
  document.getElementById('gallery-caption').dispatchEvent(new Event('input'));
  document.getElementById('btn-save-gallery').textContent = 'Actualizar imagen';
  document.getElementById('btn-cancel-gallery-edit').classList.remove('hidden');

  if (item.url.startsWith('data:')) {
    galleryImageData = item.url;
    document.getElementById('gallery-url').value = '';
  } else {
    galleryImageData = '';
    document.getElementById('gallery-url').value = item.url;
  }
  setGalleryPreview(item.url);
  document.getElementById('form-gallery').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
    showToast('Usa un enlace de imagen HTTPS valido.');
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
            <button data-event-action="edit" data-event-id="${esc(item.id)}" class="btn-ghost py-2 text-xs" type="button">Editar</button>
            <button data-event-action="toggle" data-event-id="${esc(item.id)}" class="btn-ghost py-2 text-xs" type="button">${item.publicado ? 'Ocultar' : 'Publicar'}</button>
            <button data-event-action="delete" data-event-id="${esc(item.id)}" class="bg-red-50 hover:bg-red-100 text-red-700 rounded-xl py-2 text-xs font-bold" type="button">Eliminar</button>
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
    showToast('Usa un enlace de imagen HTTPS valido.');
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
document.getElementById('btn-cancel-gallery-edit').addEventListener('click', resetGalleryForm);

document.getElementById('form-events').addEventListener('submit', e => {
  e.preventDefault();

  const editId = document.getElementById('event-edit-index').value;
  const imageUrl = document.getElementById('event-imagen').value.trim();
  if (imageUrl && !isSafeImageSource(imageUrl)) {
    showToast('La imagen del evento debe ser un archivo subido o un enlace HTTPS valido.');
    return;
  }
  const eventData = normalizeEvent({
    id: editId || uid(),
    titulo: cleanText(document.getElementById('event-titulo').value, MAX_TEXT.title),
    categoria: cleanText(document.getElementById('event-categoria').value, MAX_TEXT.category),
    fecha: document.getElementById('event-fecha').value,
    hora: document.getElementById('event-hora').value,
    lugar: cleanText(document.getElementById('event-lugar').value, MAX_TEXT.location),
    descripcion: cleanText(document.getElementById('event-descripcion').value, MAX_TEXT.description),
    imagen: eventImageData || imageUrl,
    publicado: document.getElementById('event-publicado').checked,
    updatedAt: new Date().toISOString(),
    updatedBy: getCurrentUser(),
  });

  const tituloEl = document.getElementById('event-titulo');
  const fechaEl = document.getElementById('event-fecha');
  const descripcionEl = document.getElementById('event-descripcion');
  setFieldError(tituloEl, document.getElementById('error-event-titulo'), !eventData.titulo);
  setFieldError(fechaEl, document.getElementById('error-event-fecha'), !eventData.fecha);
  setFieldError(descripcionEl, document.getElementById('error-event-descripcion'), !eventData.descripcion);

  if (!eventData.titulo || !eventData.fecha || !eventData.descripcion) {
    const firstInvalid = [tituloEl, fechaEl, descripcionEl].find(el => el.getAttribute('aria-invalid') === 'true');
    if (firstInvalid) firstInvalid.focus();
    return;
  }

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

function editEventItem(id) {
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

  clearEventFormErrors();
  document.getElementById('event-categoria').dispatchEvent(new Event('change'));
  document.getElementById('event-titulo').dispatchEvent(new Event('input'));

  eventImageData = item.imagen && item.imagen.startsWith('data:') ? item.imagen : '';
  setPreview(item.imagen);
  document.getElementById('form-events').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleEventPublish(id) {
  const items = getEvents().map(item => item.id === id
    ? { ...item, publicado: !item.publicado, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser() }
    : item);
  saveEvents(items);
  renderEvents();
  addAudit('Estado de evento cambiado', id);
  showToast('Estado del evento actualizado.');
}

function deleteEventItem(id) {
  const item = getEvents().find(event => event.id === id);
  if (!item) return;
  if (!confirm(`Eliminar el evento "${item.titulo}"?`)) return;

  saveEvents(getEvents().filter(event => event.id !== id));
  renderEvents();
  resetEventForm();
  addAudit('Evento eliminado', item.titulo);
  showToast('Evento eliminado.');
}

document.getElementById('events-list').addEventListener('click', e => {
  const button = e.target.closest('[data-event-action]');
  if (!button) return;

  const id = button.dataset.eventId;
  if (!id) return;

  if (button.dataset.eventAction === 'edit') editEventItem(id);
  if (button.dataset.eventAction === 'toggle') toggleEventPublish(id);
  if (button.dataset.eventAction === 'delete') deleteEventItem(id);
});

document.getElementById('btn-export-events').addEventListener('click', () => {
  addAudit('Eventos respaldados', 'Exportacion de eventos');
  downloadJson('eventos-uemop.json', getEvents());
});

document.getElementById('event-import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  if (!isValidJsonImportFile(file)) {
    showToast('Importa un archivo .json de máximo 1 MB.');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const items = Array.isArray(parsed) ? parsed : parsed.events;
      if (!Array.isArray(items)) throw new Error('Formato invalido.');
      const currentCount = getEvents().length;
      if (!confirm(`Se reemplazaran ${currentCount} eventos actuales por ${items.length} eventos del archivo. Continuar?`)) return;
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
  reader.readAsText(file, 'utf-8');
});

document.getElementById('btn-export-all').addEventListener('click', () => {
  addAudit('Respaldo completo descargado', 'Eventos, galeria y bitacora');
  downloadJson('respaldo-uemop-completo.json', buildFullBackup());
});

document.getElementById('backup-import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  if (!isValidJsonImportFile(file)) {
    showToast('Importa un archivo .json de máximo 1 MB.');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || (!Array.isArray(parsed.events) && !Array.isArray(parsed.gallery))) {
        throw new Error('Formato invalido.');
      }
      const nextEvents = Array.isArray(parsed.events) ? parsed.events.length : 0;
      const nextGallery = Array.isArray(parsed.gallery) ? parsed.gallery.length : 0;
      if (!confirm(`Se reemplazaran ${getEvents().length} eventos y ${getGallery().length} imagenes actuales por ${nextEvents} eventos y ${nextGallery} imagenes del respaldo. Continuar?`)) return;
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
  reader.readAsText(file, 'utf-8');
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
  const name = cleanText(document.getElementById('settings-name').value, MAX_TEXT.name);
  const email = normalizeEmail(document.getElementById('settings-email').value);
  const currentPassword = document.getElementById('settings-current-password').value;
  const password = document.getElementById('settings-password').value;
  const passwordConfirm = document.getElementById('settings-password-confirm').value;

  if (!name || !isValidEmail(email)) {
    showToast('Completa nombre y correo.');
    return;
  }

  if (!currentPassword) {
    showToast('Ingresa tu clave actual para confirmar los cambios.');
    document.getElementById('settings-current-password').focus();
    return;
  }
  const validCurrent = await verifyPassword(currentPassword, current);
  if (!validCurrent) {
    showToast('Clave actual incorrecta.');
    document.getElementById('settings-current-password').focus();
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
  document.getElementById('settings-current-password').value = '';
  document.getElementById('settings-password').value = '';
  document.getElementById('settings-password-confirm').value = '';
  fillSettingsForm();
  updateAdminLabel();
  addAudit('Configuracion actualizada', password ? 'Correo/nombre y clave' : 'Correo/nombre');
  showToast('Configuracion guardada.');
});

/* ===== CONTADOR DE CARACTERES REUTILIZABLE ===== */
function attachCharCounter(inputEl, counterEl, max) {
  if (!inputEl || !counterEl) return;
  const update = () => {
    const len = inputEl.value.length;
    counterEl.textContent = `${len}/${max}`;
    const nearLimit = len >= Math.round(max * 0.92);
    counterEl.classList.toggle('text-red-600', nearLimit);
    counterEl.classList.toggle('text-gray-400', !nearLimit);
  };
  inputEl.addEventListener('input', update);
  update();
}

attachCharCounter(document.getElementById('event-descripcion'), document.getElementById('desc-count'), 260);
attachCharCounter(document.getElementById('event-titulo'), document.getElementById('titulo-count'), 140);
attachCharCounter(document.getElementById('gallery-caption'), document.getElementById('caption-count'), 160);

/* ===== VISTA PREVIA DE BADGE — tipo de evento ===== */
const eventCategoriaSelect = document.getElementById('event-categoria');
const eventCategoriaPreview = document.getElementById('event-categoria-preview');
if (eventCategoriaSelect && eventCategoriaPreview) {
  const updateEventCategoriaPreview = () => {
    const value = eventCategoriaSelect.value;
    eventCategoriaPreview.innerHTML = `<span class="${categoryBadgeClass(value)}">${esc(value)}</span>`;
  };
  eventCategoriaSelect.addEventListener('change', updateEventCategoriaPreview);
  updateEventCategoriaPreview();
}

/* ===== LIMPIAR ERRORES AL CORREGIR ===== */
['event-titulo', 'event-fecha', 'event-descripcion'].forEach(id => {
  const input = document.getElementById(id);
  const errorEl = document.getElementById('error-' + id);
  if (!input) return;
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true' && input.value.trim()) {
      setFieldError(input, errorEl, false);
    }
  });
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
