/* ============================================================
   Utilidades compartidas — U.E. Mario Oña Perdomo
   Usadas por index.html (inyección de galería/eventos) y admin.js
   (formularios del panel). Mantener una sola fuente de verdad para
   la validación de imágenes evita que ambos lados se desincronicen.
   ============================================================ */

var MAX_DATA_IMAGE_CHARS = 4 * 1024 * 1024;

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 240);
}

/* true si el valor es una data-URI de imagen dentro del límite de tamaño,
   o una URL http(s) — vacío se considera válido (campo opcional sin imagen) */
function isSafeImageSource(src) {
  var value = String(src || '').trim();
  if (!value) return true;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) {
    var payload = value.split(',', 2)[1] || '';
    return value.length <= MAX_DATA_IMAGE_CHARS && /^[a-z0-9+/=\s]+$/i.test(payload);
  }
  try {
    var url = new URL(value, window.location.href);
    if (url.origin === window.location.origin && (url.protocol === 'https:' || url.protocol === 'http:')) {
      return true;
    }
    return url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

/* devuelve la URL/data-URI lista para usar en un atributo src, o '' si no es segura */
function sanitizeImageSrc(src) {
  var value = String(src || '').trim();
  if (!value) return '';
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) {
    return isSafeImageSource(value) ? value : '';
  }
  try {
    var url = new URL(value, window.location.href);
    if (url.origin === window.location.origin && (url.protocol === 'https:' || url.protocol === 'http:')) return url.href;
    return url.protocol === 'https:' ? url.href : '';
  } catch (error) {
    return '';
  }
}
