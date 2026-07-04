# Taller Naval

Aplicación web para gestionar un taller naval: empleados, trabajos de reparación, planificación en calendario y alertas automáticas de incompatibilidades (vacaciones) y sobrecargas de horas.

Variante autoalojada: no usa ningún servicio en la nube. Los datos viven en una base de datos SQLite gestionada por un servidor Node.js propio (tu ordenador o un NAS/PC de la red del taller). El frontend es HTML5 + CSS + JavaScript vanilla, sin frameworks ni bundler.

## Stack

- **Backend**: Node.js + Express (API REST) + Socket.IO (tiempo real).
- **Base de datos**: SQLite mediante el módulo nativo [`node:sqlite`](https://nodejs.org/api/sqlite.html) incluido en Node.js — no requiere compilar nada.
- **Frontend**: HTML5 + CSS + JavaScript (ES modules), sin build ni dependencias externas salvo [SheetJS/xlsx](https://www.npmjs.com/package/xlsx) por CDN para el informe Excel.

## Requisitos

- Node.js **22.5 o superior** (necesario para `node:sqlite`).

## Puesta en marcha

```bash
cd server
npm install
node server.js
```

Abre `http://localhost:3000` desde cualquier ordenador de la red local (o `http://<IP-del-servidor>:3000` desde otro equipo del taller).

La base de datos (`server/taller.db`) se crea automáticamente al arrancar por primera vez; no requiere ningún paso de migración manual.

## Estructura

```
/server
  server.js    Express + Socket.IO + rutas /api/*, sirve /public como estático
  db.js        conexión node:sqlite, creación de tablas, funciones CRUD
  taller.db    archivo SQLite (se genera solo, no se versiona en git)
/public
  index.html
  styles.css
  app.js       lógica de las vistas: Panel, Empleados, Trabajos, Calendario, Sugerencias, Herramientas
  db-client.js fetch() + socket.io-client hacia la API del servidor
```

## Copias de seguridad

Desde el botón de Herramientas (icono de engranaje) se puede exportar toda la base de datos como `.json` y restaurarla más adelante, o generar un informe mensual en Excel.
