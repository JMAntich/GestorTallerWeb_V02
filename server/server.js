const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const db = require('./db');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server);

function broadcastEmpleados() {
  io.emit('empleados', db.getAllEmpleados());
}

function broadcastTrabajos() {
  io.emit('trabajos', db.getAllTrabajos());
}

io.on('connection', (socket) => {
  socket.emit('empleados', db.getAllEmpleados());
  socket.emit('trabajos', db.getAllTrabajos());
});

// --- Empleados ---

app.get('/api/empleados', (req, res) => {
  res.json(db.getAllEmpleados());
});

app.post('/api/empleados', (req, res) => {
  const empleado = db.createEmpleado(req.body);
  broadcastEmpleados();
  res.status(201).json(empleado);
});

app.put('/api/empleados/:id', (req, res) => {
  const empleado = db.updateEmpleado(req.params.id, req.body);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  broadcastEmpleados();
  res.json(empleado);
});

app.delete('/api/empleados/:id', (req, res) => {
  const ok = db.deleteEmpleado(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Empleado no encontrado' });
  broadcastEmpleados();
  res.status(204).end();
});

// --- Trabajos ---

app.get('/api/trabajos', (req, res) => {
  res.json(db.getAllTrabajos());
});

app.post('/api/trabajos', (req, res) => {
  const trabajo = db.createTrabajo(req.body);
  broadcastTrabajos();
  res.status(201).json(trabajo);
});

app.put('/api/trabajos/:id', (req, res) => {
  const trabajo = db.updateTrabajo(req.params.id, req.body);
  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
  broadcastTrabajos();
  res.json(trabajo);
});

app.delete('/api/trabajos/:id', (req, res) => {
  const ok = db.deleteTrabajo(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Trabajo no encontrado' });
  broadcastTrabajos();
  res.status(204).end();
});

// --- Backup ---

app.get('/api/backup', (req, res) => {
  res.json({ empleados: db.getAllEmpleados(), trabajos: db.getAllTrabajos() });
});

app.post('/api/backup/restore', (req, res) => {
  const { empleados, trabajos } = req.body;
  if (!Array.isArray(empleados) || !Array.isArray(trabajos)) {
    return res.status(400).json({ error: 'Formato de copia de seguridad invalido' });
  }
  db.restoreBackup(empleados, trabajos);
  broadcastEmpleados();
  broadcastTrabajos();
  res.json({ empleados: db.getAllEmpleados(), trabajos: db.getAllTrabajos() });
});

server.listen(PORT, () => {
  console.log(`Taller Naval escuchando en http://localhost:${PORT}`);
});
