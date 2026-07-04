const socket = io();

export function watchEmpleados(onChange) {
  socket.on('empleados', onChange);
}

export function watchTrabajos(onChange) {
  socket.on('trabajos', onChange);
}

async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error en ${url}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function saveEmpleado(empleado) {
  const method = empleado.id ? 'PUT' : 'POST';
  const url = empleado.id ? `/api/empleados/${empleado.id}` : '/api/empleados';
  return request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(empleado),
  });
}

export async function deleteEmpleado(id) {
  return request(`/api/empleados/${id}`, { method: 'DELETE' });
}

export async function saveTrabajo(trabajo) {
  const method = trabajo.id ? 'PUT' : 'POST';
  const url = trabajo.id ? `/api/trabajos/${trabajo.id}` : '/api/trabajos';
  return request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trabajo),
  });
}

export async function deleteTrabajo(id) {
  return request(`/api/trabajos/${id}`, { method: 'DELETE' });
}

export async function fetchAllFresh() {
  const [empleados, trabajos] = await Promise.all([
    request('/api/empleados'),
    request('/api/trabajos'),
  ]);
  return { empleados, trabajos };
}

export async function fetchBackup() {
  return request('/api/backup');
}

export async function restoreBackup(data) {
  return request('/api/backup/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
