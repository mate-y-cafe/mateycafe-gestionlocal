/* Página de gestión interna (Stock + Personal).
   Acá viven los helpers compartidos, el registro que usa el Resumen para leer los dos módulos y el respaldo unificado. */
const SECCIONES = ['resumen', 'stock', 'personal', 'respaldo'];

const r3 = n => Math.round(n * 1000) / 1000;
const fmt = n => (Number(n) || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fq = n => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const mondayOf = s => { const d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const fmtDate = s => s ? parseD(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fechaHora = ts => new Date(ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

function descargar(nombre, contenido, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Cada módulo se registra acá en su init() para que el Resumen lea sus datos (Alpine.store('mc').stock / .personal).
document.addEventListener('alpine:init', () => {
  Alpine.store('mc', {
    stock: null, personal: null, toastMsg: '', _t: null,
    toast(msg) {
      this.toastMsg = msg;
      clearTimeout(this._t);
      this._t = setTimeout(() => { this.toastMsg = ''; }, 3500);
    },
  });
});

function gestionApp() {
  return {
    seccion: 'resumen',
    fmt, fq, fechaHora,

    init() {
      const desdeHash = () => { const h = location.hash.slice(1); if (SECCIONES.includes(h)) this.seccion = h; };
      desdeHash();
      window.addEventListener('hashchange', desdeHash);
    },
    ir(seccion, sub) {
      this.seccion = seccion;
      if (sub) { const m = Alpine.store('mc')[seccion]; if (m) m.tab = sub; }
      try { history.replaceState(null, '', '#' + seccion); } catch (e) { /* abierto como archivo */ }
      window.scrollTo({ top: 0 });
    },

    get st() { return Alpine.store('mc').stock || {}; },
    get pe() { return Alpine.store('mc').personal || {}; },
    get errorGuardado() { return !!(this.st.saveError || this.pe.saveError); },

    // ---------- respaldo unificado ----------
    exportarTodo() {
      const mc = Alpine.store('mc');
      if (!mc.stock || !mc.personal) return;
      mc.stock.lastBackup = Date.now();
      mc.stock.save();
      const datos = { v: 2, exportado: new Date().toISOString(), stock: mc.stock.snapshot(), personal: mc.personal.snapshot() };
      descargar('gestion-mate-cafe-' + todayStr() + '.json', JSON.stringify(datos, null, 2), 'application/json');
      mc.toast('Respaldo descargado. Guardalo fuera de la carpeta del sitio.');
    },
    // Acepta el respaldo combinado y los viejos de stock (items) y de personal (employees) por separado.
    partesDe(d) {
      if (!d || typeof d !== 'object') return null;
      if (d.stock || d.personal) return { stock: d.stock || null, personal: d.personal || null };
      if (Array.isArray(d.items)) return { stock: d, personal: null };
      if (Array.isArray(d.employees)) return { stock: null, personal: d };
      return null;
    },
    importarTodo(ev) {
      const file = ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      const mc = Alpine.store('mc');
      const invalido = () => alert('El archivo no es un respaldo válido de este sistema.');
      const reader = new FileReader();
      reader.onload = () => {
        let p;
        try { p = this.partesDe(JSON.parse(reader.result)); } catch (e) { p = null; }
        if (!p || (p.stock && !mc.stock.valido(p.stock)) || (p.personal && !mc.personal.valido(p.personal))) { invalido(); return; }
        const que = [p.stock && 'el STOCK (' + p.stock.items.length + ' ítems)', p.personal && 'el PERSONAL (' + p.personal.employees.length + ' empleados)'].filter(Boolean).join(' y ');
        if (!confirm('Esto reemplaza ' + que + ' actual por lo que trae el archivo. ¿Seguir?')) return;
        if (p.stock) mc.stock.restaurar(p.stock);
        if (p.personal) mc.personal.restaurar(p.personal);
        mc.toast('Respaldo restaurado.');
      };
      reader.readAsText(file);
    },
  };
}
