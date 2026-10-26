/* Gestión de personal: empleados, turnos, asistencia, licencias y nómina. */
const KEY_PERSONAL = 'mc_personal_v1';
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const TURNOS = {
  '': { n: '— Sin asignar', h: '',            c: 'bg-white/60 text-coffeeDark/60' },
  M:  { n: 'Mañana',        h: '07:00–15:00', c: 'bg-amber-200 text-amber-900' },
  T:  { n: 'Tarde',         h: '15:00–23:00', c: 'bg-sky-200 text-sky-900' },
  F:  { n: 'Franco',        h: '',            c: 'bg-stone-300 text-stone-700' },
};
const STATUS_AUS = { pendiente: 'bg-amber-200 text-amber-900', aprobada: 'bg-green-200 text-green-900', rechazada: 'bg-red-200 text-red-900' };

const emptyDB = () => ({ employees: [], turnos: {}, asistencia: [], ausencias: [], ajustes: {} });
const uid = () => Math.random().toString(36).slice(2, 10);

function hoursBetween(ent, sal) {
  if (!ent || !sal) return 0;
  const [h1, m1] = ent.split(':').map(Number), [h2, m2] = sal.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}
const fmtH = h => `${Math.floor(h)}h ${pad(Math.round((h % 1) * 60))}m`;
function monthRange(m) {
  const [y, mo] = m.split('-').map(Number);
  return { from: `${m}-01`, to: `${m}-${pad(new Date(y, mo, 0).getDate())}` };
}

function personalApp() {
  return {
    db: emptyDB(), saveError: false, tab: 'empleados',
    weekStart: mondayOf(todayStr()), attDate: todayStr(), payMonth: todayStr().slice(0, 7),
    empQuery: '', empArea: '',
    emp: { open: false, id: '', nombre: '', dni: '', puesto: '', area: 'Cafetería', ingreso: '', estado: 'activo', tipoPago: 'mensual', monto: '', telefono: '', email: '', error: '' },
    aus: { empId: '', tipo: 'Vacaciones', desde: todayStr(), hasta: todayStr(), motivo: '' },
    DIAS, TURNOS, STATUS_AUS, fmt, fmtDate, fmtH, hoursBetween,

    init() {
      this.load();
      Alpine.store('mc').personal = this;
    },

    // ---------- persistencia ----------
    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY_PERSONAL); } catch (e) { this.saveError = true; }
      if (!raw) return;
      try { this.aplicar(JSON.parse(raw)); }
      catch (e) {
        try { localStorage.setItem(KEY_PERSONAL + '_corrupto', raw); } catch (e2) { /* sin espacio */ }
        this.toast('Los datos de personal estaban dañados: se guardó una copia y se arrancó vacío.');
      }
    },
    valido(d) {
      const arr = v => v === undefined || Array.isArray(v);
      const obj = v => v === undefined || (!!v && typeof v === 'object' && !Array.isArray(v));
      return !!d && Array.isArray(d.employees) && d.employees.every(e => e && typeof e.id === 'string' && typeof e.nombre === 'string')
        && arr(d.asistencia) && arr(d.ausencias) && obj(d.turnos) && obj(d.ajustes);
    },
    aplicar(d) {
      if (!this.valido(d)) throw new Error('formato');
      this.db = { ...emptyDB(), employees: d.employees, turnos: d.turnos || {}, asistencia: d.asistencia || [], ausencias: d.ausencias || [], ajustes: d.ajustes || {} };
    },
    restaurar(d) {
      this.aplicar(d);
      this.save();
    },
    snapshot() { return this.db; },
    save() {
      try { localStorage.setItem(KEY_PERSONAL, JSON.stringify(this.db)); this.saveError = false; }
      catch (e) { this.saveError = true; }
    },
    toast(msg) { Alpine.store('mc').toast(msg); },

    // ---------- consultas ----------
    get hoy() { return todayStr(); },
    get activos() { return this.db.employees.filter(e => e.estado === 'activo'); },
    empById(id) { return this.db.employees.find(e => e.id === id); },
    empName(id) { return this.empById(id)?.nombre ?? '(eliminado)'; },
    onLeave(empId, date) {
      return this.db.ausencias.find(a => a.empId === empId && a.estado === 'aprobada' && a.desde <= date && date <= a.hasta);
    },
    asistFor(empId, date) { return this.db.asistencia.find(a => a.empId === empId && a.fecha === date); },
    turnoDe(date, empId) { return this.db.turnos[date]?.[empId] || ''; },

    // ---------- resumen del día ----------
    get nActivos() { return this.activos.length; },
    get nPresentes() { return this.activos.filter(e => { const a = this.asistFor(e.id, this.hoy); return a?.entrada && !a?.salida; }).length; },
    get nEnLicencia() { return this.activos.filter(e => this.onLeave(e.id, this.hoy)).length; },
    get nLicPendientes() { return this.db.ausencias.filter(a => a.estado === 'pendiente').length; },
    get nominaMes() { return this.activos.reduce((s, e) => s + this.payrollFor(e, this.hoy.slice(0, 7)).total, 0); },
    estadoHoy(e) {
      const lic = this.onLeave(e.id, this.hoy), a = this.asistFor(e.id, this.hoy);
      if (lic) return { txt: lic.tipo, cls: 'bg-purple-200 text-purple-900' };
      if (a?.entrada && a?.salida) return { txt: 'Salió ' + a.salida, cls: 'bg-stone-300 text-stone-800' };
      if (a?.entrada) return { txt: 'Presente desde ' + a.entrada, cls: 'bg-green-200 text-green-900' };
      return { txt: 'Sin marcar', cls: 'bg-white/70 text-coffeeDark/60' };
    },
    get equipoHoy() {
      return this.activos.map(e => ({ e, turno: TURNOS[this.turnoDe(this.hoy, e.id)], est: this.estadoHoy(e) }));
    },

    // ---------- empleados ----------
    get empleadosFiltrados() {
      const q = this.empQuery.trim().toLowerCase();
      return this.db.employees
        .filter(e => (!this.empArea || e.area === this.empArea) && (!q || [e.nombre, e.dni, e.puesto].some(v => String(v).toLowerCase().includes(q))))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    },
    abrirEmpleado(id) {
      const e = id ? this.empById(id) : null;
      this.emp = {
        open: true, id: e?.id || '', nombre: e?.nombre || '', dni: e?.dni || '', puesto: e?.puesto || '',
        area: e?.area || 'Cafetería', ingreso: e?.ingreso || todayStr(), estado: e?.estado || 'activo',
        tipoPago: e?.tipoPago || 'mensual', monto: e?.monto ?? '', telefono: e?.telefono || '', email: e?.email || '', error: '',
      };
    },
    guardarEmpleado() {
      const f = this.emp;
      const t = v => String(v ?? '').trim();
      f.error = '';
      const data = {
        nombre: t(f.nombre), dni: t(f.dni), puesto: t(f.puesto), area: f.area, ingreso: f.ingreso, estado: f.estado,
        tipoPago: f.tipoPago, monto: Math.max(0, Number(f.monto) || 0), telefono: t(f.telefono), email: t(f.email),
      };
      if (!data.nombre || !data.dni || !data.puesto) { f.error = 'Nombre, DNI y puesto son obligatorios.'; return; }
      if (this.db.employees.some(e => e.dni === data.dni && e.id !== f.id)) { f.error = 'Ya existe un empleado con ese DNI.'; return; }
      if (f.id) Object.assign(this.empById(f.id), data);
      else this.db.employees.push({ id: uid(), ...data });
      this.save();
      f.open = false;
      this.toast('✓ Empleado guardado');
    },
    eliminarEmpleado(id) {
      const e = this.empById(id);
      if (!confirm(`¿Eliminar a ${e.nombre}? Se borrarán también sus turnos, asistencias y licencias.\n\nSi solo dejó de trabajar, es mejor marcarlo como Inactivo.`)) return;
      this.db.employees = this.db.employees.filter(x => x.id !== id);
      this.db.asistencia = this.db.asistencia.filter(a => a.empId !== id);
      this.db.ausencias = this.db.ausencias.filter(a => a.empId !== id);
      for (const d in this.db.turnos) delete this.db.turnos[d][id];
      for (const m in this.db.ajustes) delete this.db.ajustes[m][id];
      this.save();
      this.toast('Empleado eliminado');
    },
    cargarEjemplo() {
      if (this.db.employees.length) return;
      const mk = (nombre, dni, puesto, area, ingreso, tipoPago, monto) => ({ id: uid(), nombre, dni, puesto, area, ingreso, estado: 'activo', tipoPago, monto, telefono: '', email: '' });
      this.db.employees = [
        mk('Lucía Fernández', '30111222', 'Barista', 'Cafetería', '2024-03-01', 'mensual', 780000),
        mk('Martín Gómez', '33222333', 'Cajero', 'Salón', '2024-08-15', 'hora', 4500),
        mk('Camila Ríos', '35333444', 'Vendedora de boutique', 'Boutique', '2025-01-10', 'mensual', 720000),
        mk('Julián Paz', '36444555', 'Cocinero', 'Cocina', '2023-11-20', 'mensual', 850000),
      ];
      const wk = mondayOf(todayStr()), pat = ['M', 'M', 'T', 'T', 'M', 'T', 'F'];
      this.db.employees.forEach((e, k) => { for (let i = 0; i < 7; i++) { const d = addDays(wk, i); this.db.turnos[d] = this.db.turnos[d] || {}; this.db.turnos[d][e.id] = pat[(i + k) % 7]; } });
      this.save();
      this.toast('✓ Datos de ejemplo cargados');
    },

    // ---------- turnos ----------
    get diasSemana() { return Array.from({ length: 7 }, (_, i) => addDays(this.weekStart, i)); },
    etiquetaDia(d) { const x = parseD(d); return x.getDate() + '/' + (x.getMonth() + 1); },
    get rangoSemana() { return fmtDate(this.weekStart) + ' – ' + fmtDate(addDays(this.weekStart, 6)); },
    setTurno(d, empId, val) {
      this.db.turnos[d] = this.db.turnos[d] || {};
      if (val) this.db.turnos[d][empId] = val; else delete this.db.turnos[d][empId];
      if (!Object.keys(this.db.turnos[d]).length) delete this.db.turnos[d];
      this.save();
    },
    copiarSemana() {
      const prev = addDays(this.weekStart, -7);
      if (!confirm('¿Copiar los turnos de la semana anterior a esta? Se reemplazan los turnos ya cargados en esta semana.')) return;
      for (let i = 0; i < 7; i++) {
        const src = this.db.turnos[addDays(prev, i)], dst = addDays(this.weekStart, i);
        if (src) this.db.turnos[dst] = { ...src }; else delete this.db.turnos[dst];
      }
      this.save();
      this.toast('✓ Semana copiada');
    },

    // ---------- asistencia ----------
    setAsist(empId, field, val) {
      let a = this.asistFor(empId, this.attDate);
      if (!a) { a = { id: uid(), empId, fecha: this.attDate, entrada: '', salida: '' }; this.db.asistencia.push(a); a = this.asistFor(empId, this.attDate); }
      a[field] = val;
      if (!a.entrada && !a.salida) this.db.asistencia = this.db.asistencia.filter(x => x.id !== a.id);
      this.save();
    },
    marcarAhora(empId, field) {
      const n = new Date();
      this.setAsist(empId, field, `${pad(n.getHours())}:${pad(n.getMinutes())}`);
    },
    horasDe(empId) {
      const a = this.asistFor(empId, this.attDate);
      return a ? hoursBetween(a.entrada, a.salida) : 0;
    },

    // ---------- licencias ----------
    get ausenciasOrdenadas() { return [...this.db.ausencias].sort((a, b) => b.desde.localeCompare(a.desde)); },
    diasAus(a) { return Math.round((parseD(a.hasta) - parseD(a.desde)) / 864e5) + 1; },
    guardarAusencia() {
      const f = this.aus;
      if (f.hasta < f.desde) { this.toast('⚠ La fecha "Hasta" no puede ser anterior a "Desde"'); return; }
      this.db.ausencias.push({ id: uid(), empId: f.empId, tipo: f.tipo, desde: f.desde, hasta: f.hasta, motivo: f.motivo.trim(), estado: 'pendiente' });
      this.save();
      this.aus = { empId: '', tipo: 'Vacaciones', desde: todayStr(), hasta: todayStr(), motivo: '' };
      this.toast('✓ Solicitud registrada (pendiente de aprobación)');
    },
    setAusEstado(id, estado) { this.db.ausencias.find(a => a.id === id).estado = estado; this.save(); },
    borrarAus(id) {
      if (!confirm('¿Borrar esta solicitud?')) return;
      this.db.ausencias = this.db.ausencias.filter(a => a.id !== id);
      this.save();
    },

    // ---------- nómina ----------
    leaveDaysInMonth(empId, m, soloSinGoce) {
      const { from, to } = monthRange(m);
      let n = 0;
      this.db.ausencias.filter(a => a.empId === empId && a.estado === 'aprobada' && (!soloSinGoce || a.tipo === 'Permiso sin goce')).forEach(a => {
        const s = a.desde > from ? a.desde : from, e = a.hasta < to ? a.hasta : to;
        if (s <= e) n += Math.round((parseD(e) - parseD(s)) / 864e5) + 1;
      });
      return n;
    },
    payrollFor(e, m) {
      const { from, to } = monthRange(m);
      const horas = this.db.asistencia.filter(a => a.empId === e.id && a.fecha >= from && a.fecha <= to)
        .reduce((s, a) => s + hoursBetween(a.entrada, a.salida), 0);
      const base = e.tipoPago === 'hora' ? horas * e.monto : e.monto;
      const sinGoce = e.tipoPago === 'mensual' ? (e.monto / 30) * this.leaveDaysInMonth(e.id, m, true) : 0;
      const adj = this.db.ajustes[m]?.[e.id] || { extras: 0, descuentos: 0 };
      return { horas, base, sinGoce, extras: adj.extras, descuentos: adj.descuentos, total: Math.max(0, base - sinGoce + adj.extras - adj.descuentos) };
    },
    get filasNomina() { return this.activos.map(e => ({ e, p: this.payrollFor(e, this.payMonth) })); },
    get totalNomina() { return this.filasNomina.reduce((s, f) => s + f.p.total, 0); },
    setAjuste(empId, field, ev) {
      const m = this.payMonth;
      this.db.ajustes[m] = this.db.ajustes[m] || {};
      this.db.ajustes[m][empId] = this.db.ajustes[m][empId] || { extras: 0, descuentos: 0 };
      this.db.ajustes[m][empId][field] = Math.max(0, Number(ev.target.value) || 0);
      ev.target.value = this.db.ajustes[m][empId][field];
      this.save();
    },
    exportarNominaCSV() {
      const q = v => `"${String(v).replace(/"/g, '""')}"`;
      const lines = [['Empleado', 'DNI', 'Puesto', 'Tipo de pago', 'Horas', 'Base', 'Sin goce', 'Extras', 'Descuentos', 'Total'].map(q).join(',')];
      this.filasNomina.forEach(({ e, p }) => {
        lines.push([e.nombre, e.dni, e.puesto, e.tipoPago, p.horas.toFixed(2), Math.round(p.base), Math.round(p.sinGoce), p.extras, p.descuentos, Math.round(p.total)].map(q).join(','));
      });
      descargar(`nomina-${this.payMonth}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    },

    reiniciar() {
      if (prompt('Esto borra TODOS los datos de personal (empleados, turnos, asistencia, licencias y ajustes). Escribí BORRAR para confirmar.') !== 'BORRAR') return;
      this.db = emptyDB();
      this.save();
      this.toast('Datos de personal borrados.');
    },
  };
}
