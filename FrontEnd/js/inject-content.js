/* Inyecta ítems de galería y eventos guardados en localStorage por el panel admin,
   ANTES de que main.js inicialice el lightbox. Requiere js/shared.js cargado antes. */
	            (function () {
	                var safeImageSrc = sanitizeImageSrc;

                /* --- Galería dinámica --- */
                try {
                    var gItems = JSON.parse(localStorage.getItem('gallery_items') || '[]');
                    var gGrid = document.getElementById('galeria-grid');
                    if (gGrid && gItems.length) {
	                        var galleryFragment = document.createDocumentFragment();
	                        gItems.forEach(function (item) {
	                            if (!item || typeof item !== 'object') return;
	                            var galleryImage = safeImageSrc(item.url);
	                            if (!galleryImage) return;
	                            var caption = cleanText(item.caption, 160);
	                            var div = document.createElement('div');
	                            div.className = 'gallery-item fade-up';
	                            div.setAttribute('tabindex', '0');
	                            div.setAttribute('role', 'button');
	                            div.setAttribute('aria-label', 'Ver imagen: ' + caption);
	                            div.setAttribute('data-caption', caption);
	                            var image = document.createElement('img');
	                            image.src = galleryImage;
	                            image.alt = caption;
	                            image.className = 'rounded-xl';
	                            image.loading = 'lazy';
	                            var overlay = document.createElement('div');
	                            overlay.className = 'gallery-overlay';
	                            overlay.setAttribute('aria-hidden', 'true');
	                            overlay.innerHTML =
	                                '<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
	                                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>' +
	                                '</svg>';
	                            div.appendChild(image);
	                            div.appendChild(overlay);
	                            galleryFragment.appendChild(div);
	                        });
                        gGrid.insertBefore(galleryFragment, gGrid.firstChild);
                    }
                } catch (e) { }

                /* --- Eventos dinámicos --- */
                try {
                    var eItems = JSON.parse(localStorage.getItem('event_items') || '[]');
                    var eGrid = document.getElementById('eventos-grid');
	                    if (eGrid && eItems.length) {
	                        eItems = eItems
	                            .filter(function (item) { return item && typeof item === 'object'; })
	                            .filter(function (item) { return item.publicado !== false; })
                            .sort(function (a, b) {
                                return String(b.fecha || b.createdAt || '').localeCompare(String(a.fecha || a.createdAt || ''));
                            });

                        var eventFragment = document.createDocumentFragment();
	                        eItems.forEach(function (item) {
	                            var eventImage = safeImageSrc(item.imagen);
	                            var category = cleanText(item.categoria || 'Evento', 40);
	                            var title = cleanText(item.titulo, 140);
	                            var description = cleanText(item.descripcion, 1000);
	                            var imgBlock = eventImage
	                                ? '<img src="' + esc(eventImage) + '" alt="' + esc(title) + '" class="w-full h-40 object-cover" />'
	                                : '<div class="bg-gradient-to-br from-rojo-600 to-rojo-800 h-40 flex items-center justify-center">' +
	                                '<svg class="w-14 h-14 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>' +
                                '</svg></div>';

	                            var fechaStr = '';
	                            if (item.fecha) {
	                                try {
	                                    var d = new Date(item.fecha + 'T12:00:00');
	                                    fechaStr = d.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
	                                } catch (e) { fechaStr = cleanText(item.fecha, 20); }
	                            }
	                            var meta = fechaStr;
	                            if (item.hora) meta += (meta ? ' · ' : '') + cleanText(item.hora, 20);
	                            if (item.lugar) meta += (meta ? ' · ' : '') + cleanText(item.lugar, 120);

                            var card = document.createElement('div');
                            card.className = 'content-card fade-up';
                            card.innerHTML =
	                                imgBlock +
	                                '<div class="p-5">' +
	                                '<span class="badge-rojo">' + esc(category) + '</span>' +
	                                '<h3 class="card-title">' + esc(title) + '</h3>' +
	                                '<p class="text-gray-500 text-sm leading-relaxed">' + esc(description) + '</p>' +
	                                (meta ? '<div class="card-date">' +
	                                    '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
	                                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>' +
	                                    '</svg>' + esc(meta) + '</div>' : '') +
	                                '</div>';
                            eventFragment.appendChild(card);
                        });
                        eGrid.insertBefore(eventFragment, eGrid.firstChild);
                    }
                } catch (e) { }
            })();
