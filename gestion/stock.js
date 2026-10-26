/* Control de stock: inventario, movimientos, mermas y publicación de la disponibilidad en la tienda. */
const KEY_STOCK = 'mc_stock_v1';
const TIPOS = {
  compra: { label: 'Compra' },
  venta:  { label: 'Venta' },
  uso:    { label: 'Uso' },
  merma:  { label: 'Merma' },
  ajuste: { label: 'Ajuste' },
};
const MOTIVOS = { rotura: 'Rotura', caida: 'Caída', vencimiento: 'Vencimiento', otro: 'Otro' };
const MAX_LOG = 1000;

// Catálogo inicial. Los códigos (sku) son los mismos que lleva cada producto en index.html, mate.html y cafeteria.html.
const P = (sku, nombre, categoria, precio, minimo = 2) => ({ sku, nombre, tipo: 'producto', categoria, unidad: 'u', qty: 0, minimo, costo: 0, precio });
const I = (sku, nombre, categoria, unidad, minimo) => ({ sku, nombre, tipo: 'insumo', categoria, unidad, qty: 0, minimo, costo: 0, precio: 0 });
const seedItems = () => [
  P('mate-imperial-algarrobo', 'Mate Imperial de Algarrobo', 'Mates', 18500),
  P('mate-calabaza-curado', 'Mate Calabaza Curado', 'Mates', 9800),
  P('mate-ceramica-artesanal', 'Mate de Cerámica Artesanal', 'Mates', 12300),
  P('mate-torpedo-pintado', 'Mate Torpedo Pintado a Mano', 'Mates', 14700),
  P('mate-torpedo-calabaza', 'Mate Torpedo Calabaza', 'Mates', 12000),
  P('yerba-organica-suave', 'Yerba Orgánica Suave', 'Yerbas', 4200, 5),
  P('yerba-palo-tradicional', 'Yerba con Palo Tradicional', 'Yerbas', 3600, 5),
  P('yerba-citrica', 'Yerba Saborizada Cítrica', 'Yerbas', 4500, 5),
  P('yerba-hierbas-serranas', 'Yerba con Hierbas Serranas', 'Yerbas', 4100, 5),
  P('termo-acero-1l', 'Termo Acero Inoxidable 1L', 'Termos', 22900),
  P('matera-cuero-termo', 'Matera de Cuero con Termo', 'Termos', 34900),
  P('bombilla-alpaca-clasica', 'Bombilla de Alpaca Clásica', 'Bombillas', 7300),
  P('bombilla-autor-grabada', 'Bombilla de Autor Grabada', 'Bombillas', 11200),
  P('bombilla-acero', 'Bombilla Acero Cuchara', 'Bombillas', 5500),
  P('cafe-brasil-santos-500g', 'Brasil Santos 500g', 'Grano', 9800),
  P('cafe-colombia-huila-500g', 'Colombia Huila 500g', 'Grano', 10500),
  P('cafe-blend-casa-250g', 'Blend de la Casa 250g', 'Molido', 6200),
  P('capsulas-compostables-x10', 'Cápsulas Compostables x10', 'Cápsulas', 5400),
  P('filtros-v60-x40', 'Filtros V60 Papel x40', 'Accesorio', 3100),
  P('prensa-francesa-350ml', 'Prensa Francesa 350ml', 'Accesorio', 14900),
  P('molinillo-manual-acero', 'Molinillo Manual de Acero', 'Accesorio', 18300),
  P('kit-pour-over', 'Kit Pour Over Completo', 'Kit', 21500),
  I('insumo-cafe-grano', 'Café en grano (barra)', 'Café', 'kg', 3),
  I('insumo-leche', 'Leche', 'Lácteos', 'lt', 10),
  I('insumo-harina', 'Harina', 'Pastelería', 'kg', 5),
  I('insumo-azucar', 'Azúcar', 'Pastelería', 'kg', 3),
  I('insumo-vasos', 'Vasos descartables', 'Descartables', 'u', 100),
];

const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const normalizar = i => ({
  sku: String(i.sku), nombre: String(i.nombre),
  tipo: i.tipo === 'insumo' ? 'insumo' : 'producto',
  categoria: String(i.categoria || ''), unidad: String(i.unidad || 'u'),
  qty: r3(Number(i.qty)), minimo: num(i.minimo), costo: num(i.costo), precio: num(i.precio),
});

function stockApp() {
  return {
    items: [], log: [], createdAt: Date.now(), lastBackup: null, pubPending: false, lastPublished: null,
    saveError: false, tab: 'inventario', q: '', filtro: 'todo', logFiltro: 'todo', mermaPeriodo: 'mes',
    mov: { open: false, sku: '', tipo: 'compra', cantidad: '', motivo: 'rotura', nota: '', costo: '', error: '' },
    edit: { open: false, nuevo: true, sku: '', nombre: '', tipo: 'producto', categoria: '', unidad: 'u', minimo: 0, costo: 0, precio: 0, qtyInicial: 0, error: '' },
    TIPOS, MOTIVOS, fmt, fq, fechaHora,

    init() {
      this.load();
      Alpine.store('mc').stock = this;
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* opcional */ }
    },

    // ---------- persistencia ----------
    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY_STOCK); } catch (e) { this.saveError = true; }
      if (raw) {
        try { this.aplicar(JSON.parse(raw)); return; }
        catch (e) {
          try { localStorage.setItem(KEY_STOCK + '_corrupto', raw); } catch (e2) { /* sin espacio */ }
          this.toast('Los datos guardados estaban dañados: se guardó una copia y se cargaron los iniciales.');
        }
      }
      this.items = seedItems();
      this.save();
    },
    valido(d) {
      return !!d && Array.isArray(d.items) && d.items.every(i => i && typeof i.sku === 'string' && typeof i.nombre === 'string' && Number.isFinite(Number(i.qty)));
    },
    aplicar(d) {
      if (!this.valido(d)) throw new Error('formato');
      this.items = d.items.map(normalizar);
      this.log = Array.isArray(d.log) ? d.log : [];
      this.createdAt = d.createdAt || Date.now();
      this.lastBackup = d.lastBackup || null;
      this.pubPending = !!d.pubPending;
      this.lastPublished = d.lastPublished || null;
    },
    restaurar(d) {
      this.aplicar(d);
      this.pubPending = true;
      this.save();
    },
    snapshot() {
      return { v: 1, items: this.items, log: this.log, createdAt: this.createdAt, lastBackup: this.lastBackup, pubPending: this.pubPending, lastPublished: this.lastPublished };
    },
    save() {
      try { localStorage.setItem(KEY_STOCK, JSON.stringify(this.snapshot())); this.saveError = false; }
      catch (e) { this.saveError = true; }
    },
    toast(msg) { Alpine.store('mc').toast(msg); },

    // ---------- consultas ----------
    byKey(sku) { return this.items.find(i => i.sku === sku); },
    nombreDe(sku) { const it = this.byKey(sku); return it ? it.nombre : sku; },
    unidadDe(sku) { const it = this.byKey(sku); return it ? it.unidad : ''; },
    estado(it) { return it.qty <= 0 ? 'agotado' : (it.minimo > 0 && it.qty <= it.minimo ? 'bajo' : 'ok'); },
    badgeText(it) { return { agotado: 'Sin stock', bajo: 'Bajo mínimo', ok: 'OK' }[this.estado(it)]; },
    badgeClass(it) { return { agotado: 'bg-red-100 text-red-800', bajo: 'bg-amber-100 text-amber-800', ok: 'bg-yerbaLight/40 text-yerba' }[this.estado(it)]; },

    get movItem() { return this.byKey(this.mov.sku) || { nombre: '', qty: 0, unidad: 'u' }; },
    get filtered() {
      const q = this.q.trim().toLowerCase();
      return this.items.filter(i => {
        if (this.filtro === 'venta' && i.tipo !== 'producto') return false;
        if (this.filtro === 'insumo' && i.tipo !== 'insumo') return false;
        if (this.filtro === 'bajo' && this.estado(i) === 'ok') return false;
        return !q || (i.nombre + ' ' + i.sku + ' ' + i.categoria).toLowerCase().includes(q);
      });
    },
    get nAgotados() { return this.items.filter(i => this.estado(i) === 'agotado').length; },
    get nBajos() { return this.items.filter(i => this.estado(i) === 'bajo').length; },
    get valorStock() { return this.items.reduce((s, i) => s + i.qty * i.costo, 0); },
    get reponer() {
      return this.items.filter(i => this.estado(i) !== 'ok')
        .map(i => ({ nombre: i.nombre, unidad: i.unidad, qty: i.qty, pedir: Math.max(Math.ceil(i.minimo * 2 - i.qty), 1) }));
    },
    get backupVencido() { return Date.now() - (this.lastBackup || this.createdAt) > 7 * 864e5; },
    get diasSinBackup() { return Math.floor((Date.now() - (this.lastBackup || this.createdAt)) / 864e5); },
    get logFiltrado() {
      return this.log.filter(e => this.logFiltro === 'todo' || e.tipo === this.logFiltro).slice().reverse().slice(0, 200);
    },
    get mermas() {
      const hoy = new Date();
      const desde = this.mermaPeriodo === 'mes' ? new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime() : 0;
      const por = {};
      let total = 0;
      for (const e of this.log) {
        if (e.tipo !== 'merma' || e.undone || e.ts < desde) continue;
        const valor = Math.abs(e.cantidad) * (e.costo || 0);
        const k = e.motivo || 'otro';
        const m = por[k] || (por[k] = { motivo: k, eventos: 0, valor: 0 });
        m.eventos++; m.valor += valor; total += valor;
      }
      return { total, filas: Object.values(por).sort((a, b) => b.valor - a.valor) };
    },
    get previewPublicacion() {
      const c = { ok: 0, ultimas: 0, agotado: 0 };
      for (const v of Object.values(this.disponibilidad().items)) c[v.estado]++;
      return c;
    },

    // ---------- movimientos ----------
    abrirMov(it, tipo) {
      this.mov = { open: true, sku: it.sku, tipo, cantidad: tipo === 'ajuste' ? it.qty : '', motivo: 'rotura', nota: '', costo: tipo === 'compra' && it.costo ? it.costo : '', error: '' };
      this.$nextTick(() => this.enfocar(this.$refs.movCantidad));
    },
    enfocar(el) {
      el.focus();
      if (el.select) el.select();
    },
    confirmarMov() {
      const m = this.mov;
      const cant = Number(m.cantidad);
      m.error = '';
      if (m.cantidad === '' || m.cantidad === null || !Number.isFinite(cant) || cant < 0 || (m.tipo !== 'ajuste' && cant === 0)) { m.error = 'Ingresá una cantidad válida.'; return; }
      const costo = m.costo === '' || m.costo === null ? 0 : Number(m.costo);
      if (!Number.isFinite(costo) || costo < 0) { m.error = 'El costo no es válido.'; return; }
      const err = this.registrar({ sku: m.sku, tipo: m.tipo, cantidad: r3(cant), motivo: m.tipo === 'merma' ? m.motivo : '', nota: String(m.nota || '').trim(), costo });
      if (err) { m.error = err; return; }
      this.toast(TIPOS[m.tipo].label + ' registrada');
      m.open = false;
    },
    // Único punto donde cambia el stock. Devuelve un texto de error o null.
    registrar({ sku, tipo, cantidad, motivo, nota, costo }) {
      const it = this.byKey(sku);
      if (!it) return 'El producto ya no existe.';
      let delta;
      if (tipo === 'ajuste') delta = r3(cantidad - it.qty);
      else delta = tipo === 'compra' ? cantidad : -cantidad;
      if (tipo === 'ajuste' && delta === 0) return 'La cantidad contada es igual al stock actual.';
      const nuevo = r3(it.qty + delta);
      if (nuevo < 0) return 'No hay suficiente stock (hay ' + fq(it.qty) + ' ' + it.unidad + ').';
      if (tipo === 'compra' && costo > 0) it.costo = costo;
      it.qty = nuevo;
      this.log.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: Date.now(), sku, tipo, cantidad: delta, motivo, nota, costo: it.costo, undone: false,
      });
      if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
      this.pubPending = true;
      this.save();
      return null;
    },
    deshacer(e) {
      const it = this.byKey(e.sku);
      if (!it) { this.toast('El producto ya no existe.'); return; }
      const nuevo = r3(it.qty - e.cantidad);
      if (nuevo < 0) { this.toast('No se puede deshacer: el stock quedaría negativo.'); return; }
      if (!confirm('¿Deshacer este movimiento de ' + it.nombre + '?')) return;
      it.qty = nuevo;
      e.undone = true;
      this.pubPending = true;
      this.save();
      this.toast('Movimiento deshecho');
    },

    // ---------- ítems ----------
    nuevoItem() {
      this.edit = { open: true, nuevo: true, sku: '', nombre: '', tipo: 'producto', categoria: '', unidad: 'u', minimo: 0, costo: 0, precio: 0, qtyInicial: 0, error: '' };
      this.$nextTick(() => this.enfocar(this.$refs.editNombre));
    },
    editarItem(it) {
      this.edit = { open: true, nuevo: false, ...JSON.parse(JSON.stringify(it)), error: '' };
      this.$nextTick(() => this.enfocar(this.$refs.editNombre));
    },
    guardarItem() {
      const e = this.edit;
      e.error = '';
      const nombre = String(e.nombre || '').trim();
      if (!nombre) { e.error = 'Poné un nombre.'; return; }
      const campos = { minimo: e.minimo, costo: e.costo, precio: e.tipo === 'producto' ? e.precio : 0 };
      for (const v of Object.values(campos)) {
        if (v === '' || v === null || !Number.isFinite(Number(v)) || Number(v) < 0) { e.error = 'Mínimo, costo y precio deben ser números positivos.'; return; }
      }
      const datos = { nombre, categoria: String(e.categoria || '').trim(), unidad: e.unidad, minimo: Number(campos.minimo), costo: Number(campos.costo), precio: Number(campos.precio) };
      if (e.nuevo) {
        const sku = slug(e.sku.trim() || nombre);
        if (!sku) { e.error = 'El código no es válido.'; return; }
        if (this.byKey(sku)) { e.error = 'Ya existe un ítem con el código “' + sku + '”.'; return; }
        const inicial = Number(e.qtyInicial);
        if (e.qtyInicial === '' || !Number.isFinite(inicial) || inicial < 0) { e.error = 'La cantidad inicial no es válida.'; return; }
        this.items.push({ sku, tipo: e.tipo, qty: 0, ...datos });
        if (inicial > 0) this.registrar({ sku, tipo: 'ajuste', cantidad: r3(inicial), motivo: '', nota: 'Stock inicial', costo: datos.costo });
      } else {
        Object.assign(this.byKey(e.sku), datos);
      }
      this.pubPending = true;
      this.save();
      e.open = false;
      this.toast('Ítem guardado');
    },
    eliminarItem() {
      const it = this.byKey(this.edit.sku);
      if (!confirm('¿Eliminar “' + it.nombre + '”? Los movimientos anteriores quedan en el historial. Si es un producto del sitio, la tienda lo mostrará como disponible hasta que lo quites de la página.')) return;
      this.items.splice(this.items.indexOf(it), 1);
      this.pubPending = true;
      this.save();
      this.edit.open = false;
    },

    // ---------- reposición ----------
    copiarReponer() {
      const l = this.reponer;
      if (!l.length) { this.toast('No hay nada para reponer.'); return; }
      const txt = 'Para reponer - MATE & CAFÉ\n' + l.map(r => '- ' + r.nombre + ': pedir ' + fq(r.pedir) + ' ' + r.unidad + ' (hay ' + fq(r.qty) + ')').join('\n');
      const alt = () => prompt('Copiá la lista (Ctrl+C):', txt);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => this.toast('Lista copiada.'), alt);
      else alt();
    },

    // ---------- exportación y publicación ----------
    exportarCSV() {
      const cols = ['sku', 'nombre', 'tipo', 'categoria', 'unidad', 'cantidad', 'minimo', 'costo', 'precio', 'valor_stock'];
      const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
      const n = v => String(v).replace('.', ','); // Excel en español usa coma decimal
      const filas = this.items.map(i => [i.sku, i.nombre, i.tipo, i.categoria, i.unidad, n(i.qty), n(i.minimo), n(i.costo), n(i.precio), n(r3(i.qty * i.costo))]);
      const csv = '﻿' + [cols, ...filas].map(f => f.map(esc).join(';')).join('\r\n');
      descargar('stock-mate-cafe-' + todayStr() + '.csv', csv, 'text/csv;charset=utf-8');
    },
    // Solo productos para la venta, sin costos ni precios. La cantidad se corta en 50 para no exponer el inventario completo.
    disponibilidad() {
      const items = {};
      for (const it of this.items) {
        if (it.tipo !== 'producto') continue;
        const e = this.estado(it);
        items[it.sku] = { qty: Math.min(it.qty, 50), estado: e === 'agotado' ? 'agotado' : (e === 'bajo' ? 'ultimas' : 'ok') };
      }
      return { updatedAt: new Date().toISOString(), items };
    },
    async publicar() {
      const texto = JSON.stringify(this.disponibilidad(), null, 2);
      try {
        if (window.showSaveFilePicker) {
          const h = await window.showSaveFilePicker({ id: 'mc-disponibilidad', suggestedName: 'disponibilidad.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
          const w = await h.createWritable();
          await w.write(texto);
          await w.close();
        } else {
          descargar('disponibilidad.json', texto, 'application/json');
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        this.toast('No se pudo guardar el archivo.');
        return;
      }
      this.pubPending = false;
      this.lastPublished = Date.now();
      this.save();
      this.toast('Disponibilidad publicada. Si el sitio está online, subí el archivo.');
    },
    reiniciar() {
      if (prompt('Esto borra TODO el stock y vuelve a los datos iniciales. Escribí BORRAR para confirmar.') !== 'BORRAR') return;
      this.items = seedItems();
      this.log = [];
      this.createdAt = Date.now();
      this.lastBackup = null;
      this.pubPending = true;
      this.lastPublished = null;
      this.save();
      this.toast('Stock reiniciado.');
    },
  };
}
