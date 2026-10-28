# MillaOps Hub

> **Seguimiento de Servicios Última Milla**

Plataforma de despacho y seguimiento de servicios de última milla, diseñada para importar los
reportes operativos de **Sigma**, aplicar una matriz territorial de asignación automática y
despachar el trabajo diario a los técnicos en campo.

**Autor:** Daniel Córdoba — Asistente Técnico Distrital
**GitHub:** [@elald3ano](https://github.com/elald3ano)

---

## Problema de negocio que resuelve

El despacho de órdenes de servicio de última milla dependía de procesos manuales y propensos a
error: reportes de Excel sin depurar, asignación de técnicos por criterios informales y planillas
de trabajo impresas con información incompleta o desordenada.

**MillaOps Hub** centraliza ese flujo en una sola herramienta:

- **Ingesta de Excel (Sigma):** importa el reporte operativo y descarta automáticamente las órdenes
  de zonas fuera de la jurisdicción autorizada (lista blanca de 27 sucursales).
- **Matriz de asignación territorial:** un motor de cascada determinista asigna cada orden a un
  **Técnico Flotante** (servicio específico, prioridad 1) o a un **Técnico General de Carro**
  (dueño territorial del barrio, prioridad 2).
- **Despacho en vivo:** tablero con métricas, semáforo de SLA y filtros multi-selección para
  operar el día a día.
- **Planillas PDF:** hojas de trabajo por técnico y exportación táctica de la vista actual, con
  semáforo de SLA sólido y espacio físico para firmas.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 19 · TypeScript (strict) · Vite 8 |
| Estilos | Tailwind CSS v4 · `tailwind-merge` + `clsx` |
| Estado/Datos | Supabase (`@supabase/supabase-js`) · PostgREST |
| Excel | `xlsx` (carga dinámica) |
| PDF | `jspdf` + `jspdf-autotable` (carga dinámica) |
| Iconos | `lucide-react` |
| Fechas | `date-fns` |
| Lint | `oxlint` |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Ejecución local

### Requisitos

- Node.js ≥ 20 (se recomienda 22)
- npm

### Pasos

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/elald3ano/millaops-hub.git
cd millaops-hub
npm install

# 2. Configurar variables de entorno
cp .env.example .env
#   Edita .env con tus credenciales reales de Supabase:
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...

# 3. Arrancar el servidor de desarrollo
npm run dev
```

### Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Compila TypeScript (`tsc -b`) y genera el bundle de producción (`vite build`) |
| `npm run lint` | Ejecuta `oxlint` (0 errores / 0 advertencias) |
| `npm run preview` | Previsualiza el build de producción localmente |

---

## Despliegue a producción (GitHub Pages)

El despliegue es automático mediante **GitHub Actions** (`.github/workflows/deploy.yml`): cada
`push` a la rama `main` compila y publica en GitHub Pages.

### Configuración inicial (una sola vez)

1. **Crear los Secrets del repositorio** (Settings → Secrets and variables → Actions → *New
   repository secret*):
   - `VITE_SUPABASE_URL` → la URL de tu proyecto Supabase.
   - `VITE_SUPABASE_ANON_KEY` → la clave pública (`anon`) de Supabase.

2. **Configurar GitHub Pages** (Settings → Pages):
   - *Source*: **GitHub Actions**.

3. Hacer `push` a `main`. El workflow:
   - Instala dependencias con `npm ci`.
   - Compila con `npm run build` inyectando los secrets como variables de entorno.
   - Publica el directorio `dist/` en GitHub Pages.

> **Nota de seguridad:** las credenciales viajan como *secrets* del repositorio y **nunca** se
> suben al código. El archivo `.env` está excluido por `.gitignore` (patrones `.env` y `.env.*`).
> Solo la clave `anon` (pública) se expone en el frontend; el `service_role` nunca se usa en la app.

---

## Base de datos (Supabase)

El esquema y las migraciones viven en `supabase/`:

- `schema.sql` — esquema base, políticas RLS y semilla demo.
- `seed_matriz_completa.sql` — semilla idempotente de técnicos y matriz.
- `migration_*.sql` — migraciones incrementales (campos Sigma, índice de coexistencia P1/P2,
  ciudades activas por técnico, campo de documento).

> Las migraciones marcadas como **pendientes** deben ejecutarse en el **SQL Editor** de Supabase
> (la API REST de PostgREST no puede ejecutar DDL).

---

## Documentación

- **`ARCHITECTURE.md`** — dossier de control arquitectónico: modelo de datos, motor de asignación,
  invariantes del sistema y mapa de archivos.

---

© Daniel Córdoba — Asistente Técnico Distrital · MillaOps Hub
