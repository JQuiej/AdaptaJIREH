# AdaptaJIREH — Guía de instalación

Stack: **Next.js 14 (App Router) · Supabase · Vercel**

---

## 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd Sistema\ AdaptaJIREH
npm install
```

---

## 2. Variables de entorno

Copia el archivo de ejemplo y completa los valores:

```bash
cp .env.example .env.local
```

| Variable | Dónde obtenerla |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role |
| `JWT_SECRET` | Genera uno: `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | `8h` recomendado |
| `GEMINI_API_KEY` | Google AI Studio → Get API Key |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| *(embeddings)* | Se usa `text-embedding-004` de Gemini — misma API key, sin costo extra |

---

## 3. Ejecutar migraciones en Supabase

En Supabase Dashboard → SQL Editor, ejecuta en orden:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_functions.sql`

---

## 4. Generar hash de contraseñas y cargar seed

```bash
# Genera el hash para "jireh2024"
cd supabase/seeds
node generate-hash.js
```

Copia el hash generado y pégalo en `supabase/seeds/initial_data.sql`
reemplazando `$2a$10$YourHashHere` en la variable `hash_val`.

Luego ejecuta ese archivo en Supabase Dashboard → SQL Editor.

Usuarios creados:
- Docente: `docente01` / `jireh2024`
- Estudiantes: `est001`–`est005` (experimental, 1ro Básico A)
- Estudiantes: `est006`–`est010` (control, 2do Básico B)

---

## 5. Correr en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## 6. Despliegue en Vercel

```bash
npm install -g vercel
vercel
```

En Vercel Dashboard → Project → Settings → Environment Variables,
agrega todas las variables del paso 2 en el entorno **Production**.

---

## Flujo de uso

### Docente
1. Login con `docente01`
2. Panel principal → **Subir material**
3. Selecciona materia → unidad → nivel Bloom → sube PDF
4. El sistema genera ítems con Gemini y los asigna a todos los estudiantes
5. Panel → **Analíticas** para ver variables de investigación y exportar CSV

### Estudiante
1. Login con `est001` (o cualquier `est00X`)
2. Panel muestra ítems pendientes por materia
3. Clic en **Iniciar revisión** → responde en texto libre
4. El sistema evalúa con SST (similitud semántica) y retroalimenta con Gemini si SST < 0.41
5. FSRS-5 programa la próxima revisión automáticamente

---

## Variables de investigación registradas por sesión

| Variable | Descripción |
|---|---|
| TO | Tasa de olvido (forgetting rate) |
| IRE | Intervalo de revisión estimado (días) |
| D | Dificultad FSRS |
| S | Estabilidad FSRS |
| R | Recuperabilidad / Retención estimada |
| SST | Similitud semántica textual (0–1) |
| ELC | Estado de conocimiento latente |
| CE | Carga de estudio (workload) |
| DD | Nivel Bloom del ítem |
| CR | Calidad de respuesta (rating 0–3) |
