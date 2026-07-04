const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'taller.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS empleados (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    especialidad TEXT NOT NULL,
    horasDiarias REAL NOT NULL,
    vacaciones TEXT NOT NULL DEFAULT '[]',
    actualizadoEn TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trabajos (
    id TEXT PRIMARY KEY,
    cliente TEXT NOT NULL,
    embarcacion TEXT NOT NULL,
    descripcion TEXT,
    localizacion TEXT,
    prioridad TEXT NOT NULL,
    estado TEXT NOT NULL,
    horasEstimadas REAL NOT NULL,
    horasReales REAL,
    fechaLimite TEXT,
    asignaciones TEXT NOT NULL DEFAULT '[]',
    actualizadoEn TEXT NOT NULL
  );
`);

function rowToEmpleado(row) {
  if (!row) return null;
  return { ...row, vacaciones: JSON.parse(row.vacaciones) };
}

function rowToTrabajo(row) {
  if (!row) return null;
  return { ...row, asignaciones: JSON.parse(row.asignaciones) };
}

const stmts = {
  getAllEmpleados: db.prepare('SELECT * FROM empleados ORDER BY nombre COLLATE NOCASE'),
  getEmpleado: db.prepare('SELECT * FROM empleados WHERE id = ?'),
  insertEmpleado: db.prepare(`
    INSERT INTO empleados (id, nombre, especialidad, horasDiarias, vacaciones, actualizadoEn)
    VALUES ($id, $nombre, $especialidad, $horasDiarias, $vacaciones, $actualizadoEn)
  `),
  updateEmpleado: db.prepare(`
    UPDATE empleados SET nombre=$nombre, especialidad=$especialidad, horasDiarias=$horasDiarias,
      vacaciones=$vacaciones, actualizadoEn=$actualizadoEn WHERE id=$id
  `),
  deleteEmpleado: db.prepare('DELETE FROM empleados WHERE id = ?'),
  deleteAllEmpleados: db.prepare('DELETE FROM empleados'),

  getAllTrabajos: db.prepare('SELECT * FROM trabajos ORDER BY actualizadoEn DESC'),
  getTrabajo: db.prepare('SELECT * FROM trabajos WHERE id = ?'),
  insertTrabajo: db.prepare(`
    INSERT INTO trabajos (id, cliente, embarcacion, descripcion, localizacion, prioridad, estado,
      horasEstimadas, horasReales, fechaLimite, asignaciones, actualizadoEn)
    VALUES ($id, $cliente, $embarcacion, $descripcion, $localizacion, $prioridad, $estado,
      $horasEstimadas, $horasReales, $fechaLimite, $asignaciones, $actualizadoEn)
  `),
  updateTrabajo: db.prepare(`
    UPDATE trabajos SET cliente=$cliente, embarcacion=$embarcacion, descripcion=$descripcion,
      localizacion=$localizacion, prioridad=$prioridad, estado=$estado, horasEstimadas=$horasEstimadas,
      horasReales=$horasReales, fechaLimite=$fechaLimite, asignaciones=$asignaciones, actualizadoEn=$actualizadoEn
    WHERE id=$id
  `),
  deleteTrabajo: db.prepare('DELETE FROM trabajos WHERE id = ?'),
  deleteAllTrabajos: db.prepare('DELETE FROM trabajos'),
};

function getAllEmpleados() {
  return stmts.getAllEmpleados.all().map(rowToEmpleado);
}

function getAllTrabajos() {
  return stmts.getAllTrabajos.all().map(rowToTrabajo);
}

function createEmpleado(data) {
  const empleado = {
    id: crypto.randomUUID(),
    nombre: data.nombre,
    especialidad: data.especialidad,
    horasDiarias: Number(data.horasDiarias) || 0,
    vacaciones: Array.isArray(data.vacaciones) ? data.vacaciones : [],
    actualizadoEn: new Date().toISOString(),
  };
  stmts.insertEmpleado.run({
    $id: empleado.id,
    $nombre: empleado.nombre,
    $especialidad: empleado.especialidad,
    $horasDiarias: empleado.horasDiarias,
    $vacaciones: JSON.stringify(empleado.vacaciones),
    $actualizadoEn: empleado.actualizadoEn,
  });
  return empleado;
}

function updateEmpleado(id, data) {
  const existing = stmts.getEmpleado.get(id);
  if (!existing) return null;
  const empleado = {
    id,
    nombre: data.nombre,
    especialidad: data.especialidad,
    horasDiarias: Number(data.horasDiarias) || 0,
    vacaciones: Array.isArray(data.vacaciones) ? data.vacaciones : [],
    actualizadoEn: new Date().toISOString(),
  };
  stmts.updateEmpleado.run({
    $id: empleado.id,
    $nombre: empleado.nombre,
    $especialidad: empleado.especialidad,
    $horasDiarias: empleado.horasDiarias,
    $vacaciones: JSON.stringify(empleado.vacaciones),
    $actualizadoEn: empleado.actualizadoEn,
  });
  return empleado;
}

function deleteEmpleado(id) {
  const info = stmts.deleteEmpleado.run(id);
  return info.changes > 0;
}

function createTrabajo(data) {
  const trabajo = {
    id: crypto.randomUUID(),
    cliente: data.cliente,
    embarcacion: data.embarcacion,
    descripcion: data.descripcion || '',
    localizacion: data.localizacion || '',
    prioridad: data.prioridad,
    estado: data.estado,
    horasEstimadas: Number(data.horasEstimadas) || 0,
    horasReales: data.estado === 'Terminado' ? Number(data.horasReales) || 0 : null,
    fechaLimite: data.fechaLimite || null,
    asignaciones: Array.isArray(data.asignaciones) ? data.asignaciones : [],
    actualizadoEn: new Date().toISOString(),
  };
  stmts.insertTrabajo.run({
    $id: trabajo.id,
    $cliente: trabajo.cliente,
    $embarcacion: trabajo.embarcacion,
    $descripcion: trabajo.descripcion,
    $localizacion: trabajo.localizacion,
    $prioridad: trabajo.prioridad,
    $estado: trabajo.estado,
    $horasEstimadas: trabajo.horasEstimadas,
    $horasReales: trabajo.horasReales,
    $fechaLimite: trabajo.fechaLimite,
    $asignaciones: JSON.stringify(trabajo.asignaciones),
    $actualizadoEn: trabajo.actualizadoEn,
  });
  return trabajo;
}

function updateTrabajo(id, data) {
  const existing = stmts.getTrabajo.get(id);
  if (!existing) return null;
  const trabajo = {
    id,
    cliente: data.cliente,
    embarcacion: data.embarcacion,
    descripcion: data.descripcion || '',
    localizacion: data.localizacion || '',
    prioridad: data.prioridad,
    estado: data.estado,
    horasEstimadas: Number(data.horasEstimadas) || 0,
    horasReales: data.estado === 'Terminado' ? Number(data.horasReales) || 0 : null,
    fechaLimite: data.fechaLimite || null,
    asignaciones: Array.isArray(data.asignaciones) ? data.asignaciones : [],
    actualizadoEn: new Date().toISOString(),
  };
  stmts.updateTrabajo.run({
    $id: trabajo.id,
    $cliente: trabajo.cliente,
    $embarcacion: trabajo.embarcacion,
    $descripcion: trabajo.descripcion,
    $localizacion: trabajo.localizacion,
    $prioridad: trabajo.prioridad,
    $estado: trabajo.estado,
    $horasEstimadas: trabajo.horasEstimadas,
    $horasReales: trabajo.horasReales,
    $fechaLimite: trabajo.fechaLimite,
    $asignaciones: JSON.stringify(trabajo.asignaciones),
    $actualizadoEn: trabajo.actualizadoEn,
  });
  return trabajo;
}

function deleteTrabajo(id) {
  const info = stmts.deleteTrabajo.run(id);
  return info.changes > 0;
}

function restoreBackup(empleados, trabajos) {
  db.exec('BEGIN TRANSACTION');
  try {
    stmts.deleteAllTrabajos.run();
    stmts.deleteAllEmpleados.run();
    for (const e of empleados) {
      stmts.insertEmpleado.run({
        $id: e.id || crypto.randomUUID(),
        $nombre: e.nombre,
        $especialidad: e.especialidad,
        $horasDiarias: Number(e.horasDiarias) || 0,
        $vacaciones: JSON.stringify(Array.isArray(e.vacaciones) ? e.vacaciones : []),
        $actualizadoEn: e.actualizadoEn || new Date().toISOString(),
      });
    }
    for (const t of trabajos) {
      stmts.insertTrabajo.run({
        $id: t.id || crypto.randomUUID(),
        $cliente: t.cliente,
        $embarcacion: t.embarcacion,
        $descripcion: t.descripcion || '',
        $localizacion: t.localizacion || '',
        $prioridad: t.prioridad,
        $estado: t.estado,
        $horasEstimadas: Number(t.horasEstimadas) || 0,
        $horasReales: t.estado === 'Terminado' ? Number(t.horasReales) || 0 : null,
        $fechaLimite: t.fechaLimite || null,
        $asignaciones: JSON.stringify(Array.isArray(t.asignaciones) ? t.asignaciones : []),
        $actualizadoEn: t.actualizadoEn || new Date().toISOString(),
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  getAllEmpleados,
  createEmpleado,
  updateEmpleado,
  deleteEmpleado,
  getAllTrabajos,
  createTrabajo,
  updateTrabajo,
  deleteTrabajo,
  restoreBackup,
};
