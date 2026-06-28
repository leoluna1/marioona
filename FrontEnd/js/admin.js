/* ============================================================
   Panel Administrativo — U.E. Mario Oña Perdomo
   Almacenamiento: localStorage (sin backend)
   ============================================================ */

const PASS        = 'moperdomo2024';
const GALLERY_KEY = 'gallery_items';
const EVENTS_KEY  = 'event_items';

/* ===== UTILIDADES ===== */
function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return dateStr; }
}

/* ===== AUTENTICACIÓN ===== */
function checkAuth() {
  if (sessionStorage.getItem('adminAuth') === '1') {
    showDashboard();
  }
}

document.getElementById('input-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-login').addEventListener('click', () => {
  const pass    = document.getElementById('input-pass').value;
  const errorEl = document.getElementById('login-error');
  const inputEl = document.getElementById('input-pass');

  if (pass === PASS) {
    sessionStorage.setItem('adminAuth', '1');
    showDashboard();
  } else {
    errorEl.classList.remove('hidden');
    inputEl.classList.add('shake');
    inputEl.value = '';
    inputEl.focus();
    setTimeout(() => inputEl.classList.remove('shake'), 500);
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('adminAuth');
  location.reload();
});

function showDashboard() {
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-dashboard').classList.remove('hidden');
  renderGallery();
  renderEvents();
}

/* ===== TABS ===== */
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    document.querySelectorAll('[data-tab]').forEach(b => {
      const active = b.dataset.tab === target;
      b.classList.toggle('bg-red-700',   active);
      b.classList.toggle('text-white',   active);
      b.classList.toggle('text-gray-600',!active);
      b.classList.toggle('border',       !active);
      b.classList.toggle('border-gray-200',!active);
      b.classList.toggle('hover:border-red-300',!active);
    });

    document.querySelectorAll('[data-panel]').forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.panel !== target);
    });
  });
});

/* ===== GALERÍA ===== */
function getGallery()       { return JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]'); }
function saveGallery(items) { localStorage.setItem(GALLERY_KEY, JSON.stringify(items)); }

function renderGallery() {
  const items     = getGallery();
  const container = document.getElementById('gallery-list');
  const count     = document.getElementById('gallery-count');

  if (count) count.textContent = items.length + (items.length === 1 ? ' imagen' : ' imágenes');

  if (!items.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm col-span-full text-center py-10">No hay imágenes en la galería aún.<br>Agrega la primera usando el formulario de arriba.</p>';
    return;
  }

  container.innerHTML = items.map((item, i) => `
    <div class="relative group rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      <div class="h-36 bg-gray-100 overflow-hidden">
        <img src="${esc(item.url)}" alt="${esc(item.caption)}"
             class="w-full h-full object-cover"
             onerror="this.parentElement.innerHTML='<div class=&quot;w-full h-full flex items-center justify-center text-gray-300 text-xs&quot;>Imagen no disponible</div>'" />
      </div>
      <div class="p-3">
        <p class="text-sm text-gray-700 leading-snug line-clamp-2">${esc(item.caption)}</p>
      </div>
      <button onclick="deleteGalleryItem(${i})"
              class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
              aria-label="Eliminar imagen: ${esc(item.caption)}">
        Eliminar
      </button>
    </div>
  `).join('');
}

window.deleteGalleryItem = function(index) {
  if (!confirm('¿Eliminar esta imagen de la galería?')) return;
  const items = getGallery();
  items.splice(index, 1);
  saveGallery(items);
  renderGallery();
};

document.getElementById('form-gallery').addEventListener('submit', e => {
  e.preventDefault();
  const url     = document.getElementById('gallery-url').value.trim();
  const caption = document.getElementById('gallery-caption').value.trim();
  if (!url || !caption) return;

  const items = getGallery();
  items.push({ url, caption });
  saveGallery(items);
  renderGallery();
  e.target.reset();
  document.getElementById('gallery-url').focus();
  showToast('Imagen agregada correctamente a la galería.');
});

/* ===== EVENTOS ===== */
function getEvents()       { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); }
function saveEvents(items) { localStorage.setItem(EVENTS_KEY, JSON.stringify(items)); }

function renderEvents() {
  const items     = getEvents();
  const container = document.getElementById('events-list');
  const count     = document.getElementById('events-count');

  if (count) count.textContent = items.length + (items.length === 1 ? ' evento' : ' eventos');

  if (!items.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm col-span-full text-center py-10">No hay eventos agregados aún.<br>Agrega el primero usando el formulario de arriba.</p>';
    return;
  }

  container.innerHTML = items.map((item, i) => `
    <div class="relative group bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      ${item.imagen
        ? `<img src="${esc(item.imagen)}" alt="${esc(item.titulo)}" class="w-full h-32 object-cover" />`
        : `<div class="w-full h-32 bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center">
             <svg class="w-10 h-10 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
             </svg>
           </div>`}
      <div class="p-4">
        <p class="font-semibold text-gray-800 text-sm leading-tight">${esc(item.titulo)}</p>
        ${item.fecha ? `<p class="text-xs text-red-700 font-medium mt-1">${formatDate(item.fecha)}</p>` : ''}
        ${item.descripcion ? `<p class="text-xs text-gray-500 mt-2 leading-relaxed">${esc(item.descripcion)}</p>` : ''}
      </div>
      <button onclick="deleteEventItem(${i})"
              class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
              aria-label="Eliminar evento: ${esc(item.titulo)}">
        Eliminar
      </button>
    </div>
  `).join('');
}

window.deleteEventItem = function(index) {
  if (!confirm('¿Eliminar este evento?')) return;
  const items = getEvents();
  items.splice(index, 1);
  saveEvents(items);
  renderEvents();
};

document.getElementById('form-events').addEventListener('submit', e => {
  e.preventDefault();
  const titulo      = document.getElementById('event-titulo').value.trim();
  const fecha       = document.getElementById('event-fecha').value;
  const descripcion = document.getElementById('event-descripcion').value.trim();
  const imagen      = document.getElementById('event-imagen').value.trim();

  if (!titulo || !fecha) return;

  const items = getEvents();
  items.push({ titulo, fecha, descripcion, imagen });
  saveEvents(items);
  renderEvents();
  e.target.reset();
  document.getElementById('event-titulo').focus();
  showToast('Evento agregado correctamente.');
});

/* ===== TOAST ===== */
function showToast(msg) {
  const toast = document.getElementById('admin-toast');
  if (!toast) return;
  toast.textContent = '✅ ' + msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ===== INIT ===== */
checkAuth();
