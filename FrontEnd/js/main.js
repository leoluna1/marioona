/* ============================================
   U.E. Mario Oña Perdomo — JavaScript principal
   ============================================ */

// Evita que el hash en la URL salte a una sección al recargar la página
history.scrollRestoration = 'manual';
if (location.hash) history.replaceState(null, '', location.pathname);
window.scrollTo(0, 0);

/* ===== 1. MENÚ HAMBURGUESA ===== */
const menuBtn    = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');

menuBtn.addEventListener('click', () => {
  const isOpen = !mobileMenu.classList.contains('hidden');
  mobileMenu.classList.toggle('hidden');
  menuBtn.setAttribute('aria-expanded', String(!isOpen));
  menuBtn.setAttribute('aria-label', isOpen ? 'Abrir menú de navegación' : 'Cerrar menú de navegación');
});

mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.add('hidden');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Abrir menú de navegación');
  });
});

/* ===== 2. NAVBAR SOMBRA + SCROLL SPY ===== */
const navbar   = document.querySelector('nav');
const navLinks = document.querySelectorAll('nav .nav-link');
const sections = document.querySelectorAll('section[id], footer[id]');

function updateActiveLink() {
  let current = '';
  sections.forEach(section => {
    const top = section.offsetTop - 80;
    if (window.scrollY >= top) current = section.id;
  });

  navLinks.forEach(link => {
    const href = link.getAttribute('href')?.replace('#', '');
    if (href === current) {
      link.classList.add('text-rojo-600');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('text-rojo-600');
      link.removeAttribute('aria-current');
    }
  });
}

window.addEventListener('scroll', () => {
  navbar.classList.toggle('shadow-lg', window.scrollY > 10);
  updateActiveLink();
}, { passive: true });

updateActiveLink();

/* ===== 3. ANIMACIONES CON INTERSECTIONOBSERVER ===== */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  const animatedEls = document.querySelectorAll('.fade-up, .fade-left, .fade-right');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  animatedEls.forEach(el => observer.observe(el));
} else {
  // Si prefiere movimiento reducido, mostrar todo directamente
  document.querySelectorAll('.fade-up, .fade-left, .fade-right').forEach(el => {
    el.classList.add('visible');
  });
}

/* ===== 4. CONTADOR ANIMADO DE ESTADÍSTICAS ===== */
function animateCounter(el, target, suffix = '') {
  const duration  = 1800;
  const step      = 16;
  const increment = target / (duration / step);
  let current     = 0;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = Math.floor(current) + suffix;
  }, step);
}

const statsSection  = document.getElementById('stats-section');
let   statsAnimated = false;

if (statsSection && !prefersReducedMotion) {
  const statsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !statsAnimated) {
      statsAnimated = true;
      document.querySelectorAll('[data-count]').forEach(el => {
        animateCounter(el, parseInt(el.dataset.count), el.dataset.suffix || '');
      });
    }
  }, { threshold: 0.5 });
  statsObserver.observe(statsSection);
} else {
  // Sin animación: mostrar números finales directamente
  document.querySelectorAll('[data-count]').forEach(el => {
    el.textContent = el.dataset.count + (el.dataset.suffix || '');
  });
}

/* ===== 5. GALERÍA: MOSTRAR MÁS ===== */
const GALLERY_INITIAL_VISIBLE = 6;
const GALLERY_STEP = 6;
let galleryVisibleCount = GALLERY_INITIAL_VISIBLE;

function updateGalleryVisibility() {
  const items = Array.from(document.querySelectorAll('.gallery-item'));
  const btn = document.getElementById('gallery-more-btn');

  items.forEach((item, index) => {
    const hidden = index >= galleryVisibleCount;
    item.classList.toggle('gallery-hidden', hidden);
    item.setAttribute('aria-hidden', String(hidden));
    if (hidden) {
      item.setAttribute('tabindex', '-1');
    } else {
      item.setAttribute('tabindex', '0');
    }
  });

  if (!btn) return;
  const remaining = Math.max(items.length - galleryVisibleCount, 0);
  btn.hidden = remaining === 0;
  btn.textContent = remaining > GALLERY_STEP
    ? 'Mostrar más fotos'
    : `Mostrar ${remaining} foto${remaining === 1 ? '' : 's'} más`;
}

const galleryMoreBtn = document.getElementById('gallery-more-btn');
if (galleryMoreBtn) {
  galleryMoreBtn.addEventListener('click', () => {
    galleryVisibleCount += GALLERY_STEP;
    updateGalleryVisibility();
  });
}

updateGalleryVisibility();

/* ===== 6. LIGHTBOX DE GALERÍA ===== */
const lightbox        = document.getElementById('lightbox');
const lightboxImg     = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose   = document.getElementById('lightbox-close');
const lightboxPrev    = document.getElementById('lightbox-prev');
const lightboxNext    = document.getElementById('lightbox-next');
const galleryItems    = Array.from(document.querySelectorAll('.gallery-item'));
let   currentIndex    = 0;
let   lastFocusedEl   = null;

function openLightbox(index) {
  currentIndex  = index;
  lastFocusedEl = document.activeElement;

  const item    = galleryItems[index];
  const imgEl   = item.querySelector('img');
  const caption = item.dataset.caption || '';

  if (imgEl) {
    lightboxImg.src        = imgEl.src;
    lightboxImg.alt        = caption;
    lightboxImg.style.display = '';
  } else {
    lightboxImg.src        = '';
    lightboxImg.style.display = 'none';
  }

  lightboxCaption.textContent = caption;
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Mover foco al botón de cerrar al abrir
  lightboxClose.focus();
}

function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
  lightboxImg.style.display = '';

  // Restaurar foco al elemento que lo abrió
  if (lastFocusedEl) lastFocusedEl.focus();
}

function showPrev() {
  currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
  openLightbox(currentIndex);
}

function showNext() {
  currentIndex = (currentIndex + 1) % galleryItems.length;
  openLightbox(currentIndex);
}

// Click y teclado en items de galería
galleryItems.forEach((item, i) => {
  item.addEventListener('click', () => openLightbox(i));
  item.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openLightbox(i);
    }
  });
});

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', showPrev);
lightboxNext.addEventListener('click', showNext);

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape')     closeLightbox();
  if (e.key === 'ArrowLeft')  showPrev();
  if (e.key === 'ArrowRight') showNext();
});

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});

// Trampa de foco dentro del lightbox (Tab no sale)
lightbox.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const focusables = lightbox.querySelectorAll('button');
  const first      = focusables[0];
  const last       = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

/* ===== 6. FORMULARIO CON VALIDACIÓN PERSONALIZADA ===== */
const form  = document.getElementById('contactForm');
const toast = document.getElementById('toast');

function validateField(input) {
  const errorEl = document.getElementById('error-' + input.name);
  if (input.required) input.value = input.value.trim();
  const valid = input.checkValidity() && (!input.required || input.value.trim().length > 0);

  input.setAttribute('aria-invalid', String(!valid));
  if (errorEl) {
    errorEl.classList.toggle('visible', !valid);
    errorEl.classList.toggle('hidden', valid);
  }
  return valid;
}

if (form) {
  // Validar campo al perder el foco
  form.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('blur', () => validateField(input));
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validateField(input);
    });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    // Validar todos los campos antes de enviar
    const fields = Array.from(form.querySelectorAll('input[required], textarea[required]'));
    const allValid = fields.map(f => validateField(f)).every(Boolean);

    if (!allValid) {
      // Foco al primer campo inválido
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const btn      = form.querySelector('button[type="submit"]');
    btn.textContent = 'Enviando...';
    btn.disabled   = true;

    setTimeout(() => {
      form.reset();
      fields.forEach(f => {
        f.removeAttribute('aria-invalid');
        const err = document.getElementById('error-' + f.name);
        if (err) { err.classList.add('hidden'); err.classList.remove('visible'); }
      });
      btn.textContent = 'Enviar Mensaje';
      btn.disabled    = false;

      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }, 1200);
  });
}

/* ===== 7. AÑO DINÁMICO EN FOOTER ===== */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ===== 8. BARRA DE PROGRESO + BOTÓN VOLVER ARRIBA ===== */
const scrollProgress = document.getElementById('scroll-progress');
const backToTop      = document.getElementById('back-to-top');

window.addEventListener('scroll', () => {
  const scrollTop  = window.scrollY;
  const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
  const progress   = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

  if (scrollProgress) scrollProgress.style.width = progress + '%';
  if (backToTop) backToTop.classList.toggle('visible', scrollTop > 400);
}, { passive: true });

if (backToTop) {
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
