/* Disponibilidad de productos en la tienda.
   Lee data/disponibilidad.json (lo genera stock/index.html con "Publicar disponibilidad").
   Si el archivo no existe o falla la lectura, la tienda funciona como siempre: todo disponible. */
const Disponibilidad = (() => {
  const url = new URL('../data/disponibilidad.json', document.currentScript.src);
  let items = null;

  const ready = fetch(url, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { items = j && j.items ? j.items : null; })
    .catch(() => {});

  const get = sku => (items && items[sku]) || null;
  const enCarrito = (sku, cart) => cart.reduce((n, c) => n + (c.skus || []).filter(s => s === sku).length, 0);

  return {
    ready,
    get,
    agotado: sku => { const d = get(sku); return !!d && d.estado === 'agotado'; },

    // skus: un código o una lista (el kit personalizado lleva tres)
    puedeAgregar(skus, cart) {
      return [].concat(skus || []).every(sku => {
        const d = get(sku);
        return !d || d.qty - enCarrito(sku, cart) >= 1;
      });
    },

    // Cinta para la esquina de la tarjeta (la tarjeta debe ser `relative`)
    badge(sku) {
      const d = get(sku);
      if (!d || d.estado === 'ok') return '';
      const agotado = d.estado === 'agotado';
      const texto = agotado ? 'Sin stock' : (d.qty === 1 ? '¡Última unidad!' : `¡Últimas ${d.qty}!`);
      return `<span class="disp-badge absolute top-3 right-3 z-10 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full text-white ${agotado ? 'bg-[#991B1B]' : 'bg-[#B45309]'}">${texto}</span>`;
    },

    // Tarjetas estáticas con data-sku (cafeteria.html)
    marcarTarjetas() {
      document.querySelectorAll('[data-sku]').forEach(el => {
        if (el.matches('input')) return;
        el.querySelectorAll('.disp-badge').forEach(b => b.remove());
        el.insertAdjacentHTML('afterbegin', this.badge(el.dataset.sku));
        el.classList.toggle('opacity-60', this.agotado(el.dataset.sku));
      });
    },

    // Personalizador "Armá tu kit": deshabilita las opciones agotadas
    marcarKit() {
      document.querySelectorAll('#customizer-modal input[data-sku]').forEach(input => {
        const sin = this.agotado(input.dataset.sku);
        const label = input.closest('label');
        const texto = label.querySelector('span');
        if (!texto.dataset.base) texto.dataset.base = texto.textContent;
        texto.textContent = texto.dataset.base + (sin ? ' (sin stock)' : '');
        input.disabled = sin;
        label.classList.toggle('opacity-50', sin);
        label.classList.toggle('cursor-not-allowed', sin);
      });
      ['wiz-mate', 'wiz-yerba', 'wiz-bombilla'].forEach(name => {
        const radios = [...document.querySelectorAll(`input[name="${name}"]`)];
        if (radios.some(r => r.checked && !r.disabled)) return;
        radios.forEach(r => { r.checked = false; });
        const primera = radios.find(r => !r.disabled);
        if (primera) primera.checked = true;
      });
    },
  };
})();
