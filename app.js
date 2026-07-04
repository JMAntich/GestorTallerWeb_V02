import {
  watchEmpleados, watchTrabajos, saveEmpleado, deleteEmpleado,
  saveTrabajo, deleteTrabajo, fetchBackup, restoreBackup,
} from './db-client.js';

const state = { empleados: [], trabajos: [] };

const ESPECIALIDADES = ['Mecánica', 'Electricidad', 'Casco y estructura', 'Administración'];
const ESTADOS = ['Pendiente', 'En proceso', 'Espera de piezas', 'Terminado'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CAL_DAYS = 14;

let currentView = 'panel';
let trabajosFilter = 'Todos';
let calendarStart = todayStr();
let empleadoDraft = null;
let trabajoDraft = null;

// --- Utilidades ---

function qs(selector, root = document) { return root.querySelector(selector); }

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((db - da) / 86400000);
}

function formatDateEs(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateShort(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  return `${dias[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hashHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function trabajoColor(id) { return `hsl(${hashHue(id)}, 55%, 45%)`; }

function estadoIcon(estado) {
  return { Pendiente: '⏳', 'En proceso': '⏸', 'Espera de piezas': '⏪', Terminado: '✔' }[estado] || '';
}

function pillEstadoClass(estado) {
  return { Pendiente: 'pill-idle', 'En proceso': 'pill-warn', 'Espera de piezas': 'pill-wait', Terminado: 'pill-ok' }[estado] || 'pill-idle';
}

function pillPrioridadClass(prioridad) {
  return { Alta: 'pill-danger', Media: 'pill-warn', Baja: 'pill-idle' }[prioridad] || 'pill-idle';
}

// --- Dominio: incompatibilidades y sobrecargas ---

function getEmpleado(id) { return state.empleados.find((e) => e.id === id); }

function isVacationDate(empleado, fecha) {
  if (!empleado) return false;
  return empleado.vacaciones.some((v) => fecha >= v.inicio && fecha <= v.fin);
}

function getAllAsignaciones() {
  const list = [];
  for (const t of state.trabajos) {
    for (const a of t.asignaciones) list.push({ ...a, trabajo: t });
  }
  return list;
}

function getIncompatibilidades() {
  return getAllAsignaciones().filter((a) => isVacationDate(getEmpleado(a.empleadoId), a.fecha));
}

function getHorasPorEmpleadoFecha() {
  const map = new Map();
  for (const a of getAllAsignaciones()) {
    const key = `${a.empleadoId}|${a.fecha}`;
    map.set(key, (map.get(key) || 0) + Number(a.horas));
  }
  return map;
}

function getSobrecargas() {
  const map = getHorasPorEmpleadoFecha();
  const result = [];
  for (const [key, horas] of map) {
    const [empleadoId, fecha] = key.split('|');
    const emp = getEmpleado(empleadoId);
    if (emp && horas > emp.horasDiarias) result.push({ empleadoId, fecha, horas, capacidad: emp.horasDiarias });
  }
  return result;
}

function getTrabajosVencenPronto() {
  const hoy = todayStr();
  return state.trabajos.filter((t) => {
    if (t.estado === 'Terminado' || !t.fechaLimite) return false;
    const diff = diffDays(hoy, t.fechaLimite);
    return diff >= 0 && diff <= 3;
  });
}

// --- Toast ---

function toast(message, isError = false) {
  const container = qs('#toast-container');
  const el = document.createElement('div');
  el.className = `toast ${isError ? 'error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// --- Modal genérico ---

function openModal(html, wide = false) {
  const overlay = qs('#modal-overlay');
  const content = qs('#modal-content');
  content.className = wide ? 'modal-wide' : '';
  content.innerHTML = html;
  overlay.classList.remove('hidden');
}

function closeModal() {
  qs('#modal-overlay').classList.add('hidden');
  qs('#modal-content').innerHTML = '';
  empleadoDraft = null;
  trabajoDraft = null;
}

// --- Vistas ---

function renderCurrentView() {
  const renderers = {
    panel: renderPanel,
    empleados: renderEmpleados,
    trabajos: renderTrabajos,
    calendario: renderCalendario,
    sugerencias: renderSugerencias,
  };
  renderers[currentView]();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  renderCurrentView();
}

function metricCard(value, label, danger = false) {
  return `<div class="metric-card ${danger ? 'danger' : ''}">
    <div class="metric-value mono">${value}</div>
    <div class="metric-label">${label}</div>
  </div>`;
}

function renderPanel() {
  const pendientes = state.trabajos.filter((t) => t.estado === 'Pendiente').length;
  const enProceso = state.trabajos.filter((t) => t.estado === 'En proceso').length;
  const esperaPiezas = state.trabajos.filter((t) => t.estado === 'Espera de piezas').length;
  const terminados = state.trabajos.filter((t) => t.estado === 'Terminado').length;
  const hoy = todayStr();
  const vacacionesHoy = state.empleados.filter((e) => isVacationDate(e, hoy)).length;
  const incompatibilidades = getIncompatibilidades();
  const venceProntoList = getTrabajosVencenPronto();

  qs('#content').innerHTML = `
    <div class="view-header"><h1>Panel</h1></div>
    <div class="metric-grid">
      ${metricCard(pendientes, 'Pendientes')}
      ${metricCard(enProceso, 'En proceso')}
      ${metricCard(esperaPiezas, 'Espera de piezas')}
      ${metricCard(terminados, 'Terminados')}
      ${metricCard(vacacionesHoy, 'De vacaciones hoy')}
      ${metricCard(incompatibilidades.length, 'Incompatibilidades', incompatibilidades.length > 0)}
    </div>
    <div class="columns-2">
      <div class="card">
        <h3>Vence pronto</h3>
        ${venceProntoList.length ? venceProntoList.map((t) => `
          <div class="list-item">
            <div class="title">${esc(t.embarcacion)} — ${esc(t.cliente)}</div>
            <div class="subtitle">Fecha límite: ${formatDateEs(t.fechaLimite)} · ${esc(t.estado)}</div>
          </div>
        `).join('') : '<div class="list-empty">No hay trabajos que venzan en los próximos 3 días.</div>'}
      </div>
      <div class="card">
        <h3>Incompatibilidades activas</h3>
        ${incompatibilidades.length ? incompatibilidades.map((a) => {
          const emp = getEmpleado(a.empleadoId);
          return `
          <div class="list-item">
            <div class="title">${esc(emp ? emp.nombre : 'Empleado eliminado')}</div>
            <div class="subtitle">${esc(a.trabajo.embarcacion)} · ${formatDateEs(a.fecha)} · ${a.horas}h durante vacaciones</div>
          </div>`;
        }).join('') : '<div class="list-empty">No hay incompatibilidades activas.</div>'}
      </div>
    </div>
  `;
}

// --- Empleados ---

function renderEmpleados() {
  const rows = state.empleados.map((e) => `
    <tr>
      <td>${esc(e.nombre)}</td>
      <td>${esc(e.especialidad)}</td>
      <td class="mono">${e.horasDiarias}h</td>
      <td>${e.vacaciones.length ? e.vacaciones.map((v) => `<span class="tag">${formatDateEs(v.inicio)} – ${formatDateEs(v.fin)}</span>`).join('') : '<span class="list-empty">Sin vacaciones</span>'}</td>
      <td><button class="btn btn-sm" data-action="editar-empleado" data-id="${e.id}">Editar</button></td>
    </tr>
  `).join('');

  qs('#content').innerHTML = `
    <div class="view-header">
      <h1>Empleados</h1>
      <button class="btn btn-primary" data-action="nuevo-empleado">+ Nuevo empleado</button>
    </div>
    ${state.empleados.length ? `
    <table>
      <thead><tr><th>Nombre</th><th>Especialidad</th><th>Horas/día</th><th>Vacaciones</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="card empty-state">No hay empleados todavía. Crea el primero.</div>'}
  `;
}

function openEmpleadoModal(id) {
  const empleado = id ? state.empleados.find((e) => e.id === id) : null;
  empleadoDraft = { id: empleado ? empleado.id : null, vacaciones: empleado ? empleado.vacaciones.map((v) => ({ ...v })) : [] };

  const html = `
    <div class="modal-header">
      <h2>${empleado ? 'Editar empleado' : 'Nuevo empleado'}</h2>
      <button class="modal-close" data-action="modal-close">&times;</button>
    </div>
    <div class="form-row">
      <label for="f-nombre">Nombre</label>
      <input type="text" id="f-nombre" value="${empleado ? esc(empleado.nombre) : ''}" />
    </div>
    <div class="form-row-2">
      <div class="form-row">
        <label for="f-especialidad">Especialidad</label>
        <select id="f-especialidad">
          ${ESPECIALIDADES.map((s) => `<option value="${s}" ${empleado && empleado.especialidad === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label for="f-horas">Horas/día</label>
        <input type="number" id="f-horas" min="0" step="0.5" value="${empleado ? empleado.horasDiarias : 8}" />
      </div>
    </div>
    <div class="form-row">
      <label>Vacaciones</label>
      <div id="vacaciones-list"></div>
      <div class="add-row">
        <input type="date" id="f-vac-inicio" />
        <input type="date" id="f-vac-fin" />
        <button class="btn" data-action="add-vacacion">Añadir</button>
      </div>
    </div>
    <div class="modal-actions">
      ${empleado ? `<button class="btn btn-danger" data-action="eliminar-empleado" data-id="${empleado.id}">Eliminar</button>` : '<span></span>'}
      <div class="right">
        <button class="btn" data-action="modal-close">Cancelar</button>
        <button class="btn btn-primary" data-action="guardar-empleado">Guardar</button>
      </div>
    </div>
  `;
  openModal(html);
  renderVacacionesList();
}

function renderVacacionesList() {
  const el = qs('#vacaciones-list');
  if (!el) return;
  el.innerHTML = empleadoDraft.vacaciones.length ? empleadoDraft.vacaciones.map((v, i) => `
    <div class="sub-list-item">
      <span class="grow">${formatDateEs(v.inicio)} – ${formatDateEs(v.fin)}</span>
      <button class="remove-x" data-action="remove-vacacion" data-index="${i}">&times;</button>
    </div>
  `).join('') : '<div class="list-empty">Sin periodos de vacaciones.</div>';
}

function addVacacion() {
  const inicio = qs('#f-vac-inicio').value;
  const fin = qs('#f-vac-fin').value;
  if (!inicio || !fin || inicio > fin) { toast('Introduce un rango de fechas válido', true); return; }
  empleadoDraft.vacaciones.push({ inicio, fin });
  renderVacacionesList();
  qs('#f-vac-inicio').value = '';
  qs('#f-vac-fin').value = '';
}

function removeVacacion(index) {
  empleadoDraft.vacaciones.splice(index, 1);
  renderVacacionesList();
}

async function guardarEmpleado() {
  const nombre = qs('#f-nombre').value.trim();
  const especialidad = qs('#f-especialidad').value;
  const horasDiarias = Number(qs('#f-horas').value);
  if (!nombre) { toast('El nombre es obligatorio', true); return; }
  try {
    await saveEmpleado({ id: empleadoDraft.id, nombre, especialidad, horasDiarias, vacaciones: empleadoDraft.vacaciones });
    closeModal();
    toast('Empleado guardado');
  } catch (err) {
    toast(err.message, true);
  }
}

async function eliminarEmpleadoConfirm(id) {
  if (!confirm('¿Eliminar este empleado? Esta acción no se puede deshacer.')) return;
  try {
    await deleteEmpleado(id);
    closeModal();
    toast('Empleado eliminado');
  } catch (err) {
    toast(err.message, true);
  }
}

// --- Trabajos ---

function renderTrabajos() {
  const filtered = trabajosFilter === 'Todos' ? state.trabajos : state.trabajos.filter((t) => t.estado === trabajosFilter);

  const rows = filtered.map((t) => {
    const horasAsignadas = t.asignaciones.reduce((sum, a) => sum + Number(a.horas), 0);
    const empleadosNombres = [...new Set(t.asignaciones.map((a) => a.empleadoId))]
      .map((id) => getEmpleado(id)?.nombre)
      .filter(Boolean);
    return `
    <tr data-action="editar-trabajo" data-id="${t.id}" style="cursor:pointer">
      <td>
        <span class="color-dot" style="background:${trabajoColor(t.id)}"></span>${esc(t.embarcacion)}
        <div class="cell-subtitle">${esc(t.cliente)}</div>
      </td>
      <td>${esc(t.localizacion) || '—'}</td>
      <td>${empleadosNombres.length ? empleadosNombres.map((n) => `<span class="tag">${esc(n)}</span>`).join('') : '<span class="list-empty">Sin asignar</span>'}</td>
      <td><span class="pill ${pillPrioridadClass(t.prioridad)}">${t.prioridad}</span></td>
      <td class="mono">${horasAsignadas}/${t.horasEstimadas}h</td>
      <td>${formatDateEs(t.fechaLimite)}</td>
      <td><span class="pill ${pillEstadoClass(t.estado)}">${t.estado}</span></td>
    </tr>
  `;
  }).join('');

  qs('#content').innerHTML = `
    <div class="view-header">
      <h1>Trabajos</h1>
      <button class="btn btn-primary" data-action="nuevo-trabajo">+ Nuevo trabajo</button>
    </div>
    <div class="filter-bar">
      ${['Todos', ...ESTADOS].map((f) => `<button class="filter-btn ${trabajosFilter === f ? 'active' : ''}" data-filter="${f}">${f}</button>`).join('')}
    </div>
    ${filtered.length ? `
    <table>
      <thead><tr><th>Embarcación / Cliente</th><th>Localización</th><th>Empleados</th><th>Prioridad</th><th>Horas</th><th>Fecha límite</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="card empty-state">No hay trabajos en este estado.</div>'}
  `;
}

function openTrabajoModal(id) {
  const trabajo = id ? state.trabajos.find((t) => t.id === id) : null;
  trabajoDraft = { id: trabajo ? trabajo.id : null, asignaciones: trabajo ? trabajo.asignaciones.map((a) => ({ ...a })) : [] };

  const html = `
    <div class="modal-header">
      <h2>${trabajo ? 'Editar trabajo' : 'Nuevo trabajo'}</h2>
      <button class="modal-close" data-action="modal-close">&times;</button>
    </div>
    <div class="form-row-2">
      <div class="form-row"><label for="f-cliente">Cliente</label><input type="text" id="f-cliente" value="${trabajo ? esc(trabajo.cliente) : ''}" /></div>
      <div class="form-row"><label for="f-embarcacion">Embarcación</label><input type="text" id="f-embarcacion" value="${trabajo ? esc(trabajo.embarcacion) : ''}" /></div>
    </div>
    <div class="form-row"><label for="f-descripcion">Descripción</label><textarea id="f-descripcion">${trabajo ? esc(trabajo.descripcion) : ''}</textarea></div>
    <div class="form-row"><label for="f-localizacion">Localización</label><input type="text" id="f-localizacion" value="${trabajo ? esc(trabajo.localizacion) : ''}" /></div>
    <div class="form-row-2">
      <div class="form-row">
        <label for="f-prioridad">Prioridad</label>
        <select id="f-prioridad">${PRIORIDADES.map((p) => `<option value="${p}" ${trabajo && trabajo.prioridad === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <label for="f-estado">Estado</label>
        <select id="f-estado">${ESTADOS.map((s) => `<option value="${s}" ${(trabajo ? trabajo.estado === s : s === 'Pendiente') ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-row"><label for="f-horas-est">Horas estimadas</label><input type="number" id="f-horas-est" min="0" step="0.5" value="${trabajo ? trabajo.horasEstimadas : ''}" /></div>
      <div class="form-row"><label for="f-fecha-limite">Fecha límite</label><input type="date" id="f-fecha-limite" value="${trabajo && trabajo.fechaLimite ? trabajo.fechaLimite : ''}" /></div>
    </div>
    <div class="form-row hidden" id="row-horas-reales">
      <label for="f-horas-reales">Horas reales</label>
      <input type="number" id="f-horas-reales" min="0" step="0.5" value="${trabajo && trabajo.horasReales != null ? trabajo.horasReales : ''}" />
    </div>
    <div class="form-row">
      <label>Asignaciones</label>
      <div id="asignaciones-list"></div>
      <div class="add-row">
        <select id="f-asig-empleado">
          ${state.empleados.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}
        </select>
        <input type="date" id="f-asig-fecha" />
        <input type="number" id="f-asig-horas" min="0" step="0.5" placeholder="Horas" />
        <button class="btn" data-action="add-asignacion">Añadir</button>
      </div>
    </div>
    <div class="modal-actions">
      ${trabajo ? `<button class="btn btn-danger" data-action="eliminar-trabajo" data-id="${trabajo.id}">Eliminar</button>` : '<span></span>'}
      <div class="right">
        <button class="btn" data-action="modal-close">Cancelar</button>
        <button class="btn btn-primary" data-action="guardar-trabajo">Guardar</button>
      </div>
    </div>
  `;
  openModal(html, true);
  renderAsignacionesList();
  toggleHorasReales();
}

function toggleHorasReales() {
  const estadoSel = qs('#f-estado');
  const row = qs('#row-horas-reales');
  if (!estadoSel || !row) return;
  row.classList.toggle('hidden', estadoSel.value !== 'Terminado');
}

function renderAsignacionesList() {
  const el = qs('#asignaciones-list');
  if (!el) return;
  el.innerHTML = trabajoDraft.asignaciones.length ? trabajoDraft.asignaciones.map((a, i) => {
    const emp = getEmpleado(a.empleadoId);
    const conflict = isVacationDate(emp, a.fecha);
    return `
    <div class="sub-list-item">
      <span class="grow">${esc(emp ? emp.nombre : 'Empleado eliminado')} · ${formatDateEs(a.fecha)} · ${a.horas}h ${conflict ? '<span class="warning-text">⚠ coincide con vacaciones</span>' : ''}</span>
      <button class="remove-x" data-action="remove-asignacion" data-index="${i}">&times;</button>
    </div>`;
  }).join('') : '<div class="list-empty">Sin asignaciones.</div>';
}

function addAsignacion() {
  const empleadoSel = qs('#f-asig-empleado');
  const empleadoId = empleadoSel ? empleadoSel.value : '';
  const fecha = qs('#f-asig-fecha').value;
  const horas = Number(qs('#f-asig-horas').value);
  if (!empleadoId) { toast('No hay empleados para asignar', true); return; }
  if (!fecha || !horas || horas <= 0) { toast('Introduce fecha y horas válidas', true); return; }
  trabajoDraft.asignaciones.push({ id: crypto.randomUUID(), empleadoId, fecha, horas });
  renderAsignacionesList();
  qs('#f-asig-fecha').value = '';
  qs('#f-asig-horas').value = '';
}

function removeAsignacion(index) {
  trabajoDraft.asignaciones.splice(index, 1);
  renderAsignacionesList();
}

async function guardarTrabajo() {
  const cliente = qs('#f-cliente').value.trim();
  const embarcacion = qs('#f-embarcacion').value.trim();
  const descripcion = qs('#f-descripcion').value.trim();
  const localizacion = qs('#f-localizacion').value.trim();
  const prioridad = qs('#f-prioridad').value;
  const estado = qs('#f-estado').value;
  const horasEstimadas = Number(qs('#f-horas-est').value);
  const fechaLimite = qs('#f-fecha-limite').value || null;
  const horasReales = estado === 'Terminado' ? Number(qs('#f-horas-reales').value) || 0 : null;

  if (!cliente || !embarcacion) { toast('Cliente y embarcación son obligatorios', true); return; }

  try {
    await saveTrabajo({
      id: trabajoDraft.id, cliente, embarcacion, descripcion, localizacion, prioridad, estado,
      horasEstimadas, horasReales, fechaLimite, asignaciones: trabajoDraft.asignaciones,
    });
    closeModal();
    toast('Trabajo guardado');
  } catch (err) {
    toast(err.message, true);
  }
}

async function eliminarTrabajoConfirm(id) {
  if (!confirm('¿Eliminar este trabajo? Esta acción no se puede deshacer.')) return;
  try {
    await deleteTrabajo(id);
    closeModal();
    toast('Trabajo eliminado');
  } catch (err) {
    toast(err.message, true);
  }
}

// --- Calendario ---

function calPrev() { calendarStart = addDays(calendarStart, -1); renderCalendario(); }
function calNext() { calendarStart = addDays(calendarStart, 1); renderCalendario(); }
function calToday() { calendarStart = todayStr(); renderCalendario(); }

function renderCalendario() {
  const dates = Array.from({ length: CAL_DAYS }, (_, i) => addDays(calendarStart, i));
  const horasMap = getHorasPorEmpleadoFecha();

  const trabajosVisibles = new Map();
  for (const t of state.trabajos) {
    for (const a of t.asignaciones) {
      if (dates.includes(a.fecha)) trabajosVisibles.set(t.id, t);
    }
  }

  const headerCells = dates.map((d) => `<div class="cal-header-cell">${formatDateShort(d)}</div>`).join('');

  const empRows = state.empleados.map((e) => {
    const cells = dates.map((d) => {
      const vac = isVacationDate(e, d);
      const asigs = [];
      for (const t of state.trabajos) {
        for (const a of t.asignaciones) {
          if (a.empleadoId === e.id && a.fecha === d) asigs.push({ ...a, trabajo: t });
        }
      }
      const totalHoras = horasMap.get(`${e.id}|${d}`) || 0;
      const overload = totalHoras > e.horasDiarias;
      const conflict = vac && asigs.length > 0;

      const bars = asigs.map((a) => {
        const heightPx = Math.min(60, Math.max(18, (Number(a.horas) / Math.max(e.horasDiarias, 1)) * 40));
        return `<div class="cal-bar" style="background:${trabajoColor(a.trabajo.id)};height:${heightPx}px" data-action="editar-trabajo" data-id="${a.trabajo.id}" title="${esc(a.trabajo.embarcacion)} · ${a.horas}h">
          <span>${estadoIcon(a.trabajo.estado)}</span><span>${esc(a.trabajo.embarcacion)}</span>
        </div>`;
      }).join('');

      return `<div class="cal-cell ${vac ? 'vacation' : ''}">
        ${conflict ? '<div class="cal-badge conflict" title="Conflicto con vacaciones">!</div>' : (overload ? '<div class="cal-badge overload" title="Sobrecarga de horas">+</div>' : '')}
        ${bars}
      </div>`;
    }).join('');
    return `<div class="cal-emp-label">${esc(e.nombre)}</div>${cells}`;
  }).join('');

  qs('#content').innerHTML = `
    <div class="view-header"><h1>Calendario</h1></div>
    <div class="calendar-toolbar">
      <button class="btn" data-action="cal-prev">&larr; Día anterior</button>
      <button class="btn" data-action="cal-today">Hoy</button>
      <button class="btn" data-action="cal-next">Día siguiente &rarr;</button>
    </div>
    <div class="calendar-legend">
      <span class="legend-item">⏳ Pendiente</span>
      <span class="legend-item">⏸ En proceso</span>
      <span class="legend-item">⏪ Espera de piezas</span>
      <span class="legend-item">✔ Terminado</span>
    </div>
    <div class="calendar-legend">
      ${trabajosVisibles.size ? [...trabajosVisibles.values()].map((t) => `<span class="legend-item"><span class="color-dot" style="background:${trabajoColor(t.id)}"></span>${estadoIcon(t.estado)} ${esc(t.embarcacion)}</span>`).join('') : '<span class="list-empty">Sin trabajos en este periodo.</span>'}
    </div>
    <div class="calendar-scroll">
      <div class="calendar-grid" style="grid-template-columns: 160px repeat(${CAL_DAYS}, 1fr);">
        <div class="cal-header-cell" style="border-left:none;background:var(--surface)"></div>
        ${headerCells}
        ${empRows}
      </div>
    </div>
  `;
}

// --- Sugerencias ---

function suggestionCard(type, icon, title, desc) {
  return `<div class="suggestion-card type-${type}">
    <div class="icon">${icon}</div>
    <div><div class="title">${esc(title)}</div><div class="desc">${esc(desc)}</div></div>
  </div>`;
}

function renderSugerencias() {
  const incompatibilidades = getIncompatibilidades();
  const sobrecargas = getSobrecargas();
  const sinAsignar = state.trabajos.filter((t) => t.estado !== 'Terminado' && t.asignaciones.length === 0);
  const venceProto = getTrabajosVencenPronto();
  const esperaPiezas = state.trabajos.filter((t) => t.estado === 'Espera de piezas');

  const cards = [];

  incompatibilidades.forEach((a) => {
    const emp = getEmpleado(a.empleadoId);
    cards.push(suggestionCard('danger', '⚠', 'Incompatibilidad con vacaciones', `${emp ? emp.nombre : 'Empleado eliminado'} tiene asignado "${a.trabajo.embarcacion}" el ${formatDateEs(a.fecha)}, dentro de su periodo de vacaciones.`));
  });

  sobrecargas.forEach((s) => {
    const emp = getEmpleado(s.empleadoId);
    cards.push(suggestionCard('warn', '⏱', 'Sobrecarga de horas', `${emp ? emp.nombre : 'Empleado eliminado'} tiene ${s.horas}h asignadas el ${formatDateEs(s.fecha)}, por encima de su capacidad diaria de ${s.capacidad}h.`));
  });

  sinAsignar.forEach((t) => {
    cards.push(suggestionCard('warn', '📋', 'Trabajo pendiente sin asignar', `"${t.embarcacion}" (${t.cliente}) no tiene ningún empleado asignado todavía.`));
  });

  venceProto.forEach((t) => {
    cards.push(suggestionCard('warn', '⏰', 'Vence pronto', `"${t.embarcacion}" (${t.cliente}) tiene fecha límite el ${formatDateEs(t.fechaLimite)}.`));
  });

  esperaPiezas.forEach((t) => {
    cards.push(suggestionCard('ok', '📦', 'Parado en espera de piezas', `"${t.embarcacion}" (${t.cliente}) lleva parado en espera de piezas.`));
  });

  qs('#content').innerHTML = `
    <div class="view-header"><h1>Sugerencias</h1></div>
    ${cards.length ? cards.join('') : '<div class="card empty-state">No hay sugerencias por ahora. Todo en orden.</div>'}
  `;
}

// --- Herramientas ---

function openHerramientasModal() {
  const now = new Date();
  const html = `
    <div class="modal-header">
      <h2>Herramientas</h2>
      <button class="modal-close" data-action="modal-close">&times;</button>
    </div>
    <div class="tool-section">
      <h3>Informe mensual (Excel)</h3>
      <div class="row">
        <select id="f-informe-mes">
          ${MESES.map((m, i) => `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <input type="number" id="f-informe-anio" value="${now.getFullYear()}" style="max-width:100px" />
        <button class="btn btn-primary" data-action="export-excel">Descargar Excel</button>
      </div>
    </div>
    <div class="tool-section">
      <h3>Copia de seguridad</h3>
      <div class="row">
        <button class="btn" data-action="export-backup">Exportar copia de seguridad</button>
        <label class="btn" style="cursor:pointer">
          Importar copia de seguridad
          <input type="file" id="f-import-backup" accept="application/json" class="hidden" />
        </label>
      </div>
    </div>
    <div class="modal-actions">
      <span></span>
      <div class="right"><button class="btn" data-action="modal-close">Cerrar</button></div>
    </div>
  `;
  openModal(html);
  qs('#f-import-backup').addEventListener('change', handleImportBackup);
}

function exportExcel() {
  const mes = Number(qs('#f-informe-mes').value);
  const anio = Number(qs('#f-informe-anio').value);
  const inicio = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const fin = new Date(anio, mes + 1, 0).toISOString().slice(0, 10);

  const trabajosDelMes = state.trabajos.filter((t) => t.asignaciones.some((a) => a.fecha >= inicio && a.fecha <= fin) || (t.fechaLimite && t.fechaLimite >= inicio && t.fechaLimite <= fin));

  const resumenData = [
    ['Informe mensual', `${MESES[mes]} ${anio}`],
    [],
    ['Pendientes', state.trabajos.filter((t) => t.estado === 'Pendiente').length],
    ['En proceso', state.trabajos.filter((t) => t.estado === 'En proceso').length],
    ['Espera de piezas', state.trabajos.filter((t) => t.estado === 'Espera de piezas').length],
    ['Terminados', state.trabajos.filter((t) => t.estado === 'Terminado').length],
    ['Trabajos con actividad este mes', trabajosDelMes.length],
  ];

  const trabajosData = [
    ['Cliente', 'Embarcación', 'Localización', 'Prioridad', 'Estado', 'Horas estimadas', 'Horas reales', 'Fecha límite'],
    ...trabajosDelMes.map((t) => [t.cliente, t.embarcacion, t.localizacion, t.prioridad, t.estado, t.horasEstimadas, t.horasReales ?? '', t.fechaLimite ?? '']),
  ];

  const horasPorDiaMap = new Map();
  for (const t of trabajosDelMes) {
    for (const a of t.asignaciones) {
      if (a.fecha < inicio || a.fecha > fin) continue;
      const emp = getEmpleado(a.empleadoId);
      const key = `${a.fecha}|${emp ? emp.nombre : a.empleadoId}`;
      horasPorDiaMap.set(key, (horasPorDiaMap.get(key) || 0) + Number(a.horas));
    }
  }
  const horasPorDiaData = [
    ['Fecha', 'Empleado', 'Horas'],
    ...[...horasPorDiaMap.entries()].map(([key, horas]) => {
      const [fecha, nombre] = key.split('|');
      return [fecha, nombre, horas];
    }),
  ];

  const incompatibilidadesDelMes = getIncompatibilidades().filter((a) => a.fecha >= inicio && a.fecha <= fin);
  const incompatibilidadesData = [
    ['Empleado', 'Trabajo', 'Fecha', 'Horas'],
    ...incompatibilidadesDelMes.map((a) => {
      const emp = getEmpleado(a.empleadoId);
      return [emp ? emp.nombre : a.empleadoId, a.trabajo.embarcacion, a.fecha, a.horas];
    }),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenData), 'Resumen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trabajosData), 'Trabajos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(horasPorDiaData), 'Horas por día');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incompatibilidadesData), 'Incompatibilidades');
  XLSX.writeFile(wb, `informe-${MESES[mes].toLowerCase()}-${anio}.xlsx`);
  toast('Informe generado');
}

async function exportBackup() {
  try {
    const data = await fetchBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-taller-naval-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Copia de seguridad exportada');
  } catch (err) {
    toast(err.message, true);
  }
}

function handleImportBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.empleados) || !Array.isArray(data.trabajos)) throw new Error('El archivo no tiene el formato esperado');
      if (!confirm('Esto sustituirá TODOS los datos actuales por los del archivo. ¿Continuar?')) return;
      await restoreBackup(data);
      closeModal();
      toast('Copia de seguridad restaurada');
    } catch (err) {
      toast(err.message, true);
    }
  };
  reader.readAsText(file);
}

// --- Eventos globales ---

document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('.nav-btn');
  if (navBtn) { switchView(navBtn.dataset.view); return; }

  if (e.target.closest('#btn-herramientas')) { openHerramientasModal(); return; }

  const filterBtn = e.target.closest('[data-filter]');
  if (filterBtn) { trabajosFilter = filterBtn.dataset.filter; renderTrabajos(); return; }

  if (e.target === qs('#modal-overlay')) { closeModal(); return; }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const { action, id } = actionEl.dataset;

  switch (action) {
    case 'modal-close': closeModal(); break;
    case 'nuevo-empleado': openEmpleadoModal(null); break;
    case 'editar-empleado': openEmpleadoModal(id); break;
    case 'eliminar-empleado': eliminarEmpleadoConfirm(id); break;
    case 'guardar-empleado': guardarEmpleado(); break;
    case 'add-vacacion': addVacacion(); break;
    case 'remove-vacacion': removeVacacion(Number(actionEl.dataset.index)); break;
    case 'nuevo-trabajo': openTrabajoModal(null); break;
    case 'editar-trabajo': openTrabajoModal(id); break;
    case 'eliminar-trabajo': eliminarTrabajoConfirm(id); break;
    case 'guardar-trabajo': guardarTrabajo(); break;
    case 'add-asignacion': addAsignacion(); break;
    case 'remove-asignacion': removeAsignacion(Number(actionEl.dataset.index)); break;
    case 'cal-prev': calPrev(); break;
    case 'cal-next': calNext(); break;
    case 'cal-today': calToday(); break;
    case 'export-excel': exportExcel(); break;
    case 'export-backup': exportBackup(); break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'f-estado') toggleHorasReales();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// --- Arranque ---

watchEmpleados((empleados) => { state.empleados = empleados; renderCurrentView(); });
watchTrabajos((trabajos) => { state.trabajos = trabajos; renderCurrentView(); });

renderCurrentView();
