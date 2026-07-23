# AdaptaJIREH — Contexto completo del sistema

Sistema de aprendizaje adaptativo con IA para el Liceo JIREH (Guatemala). Tesis de grado.
Objetivo de investigación: medir el efecto de la **repetición espaciada adaptativa (FSRS-5) + retroalimentación con IA** sobre la **retención cognitiva** de estudiantes de bachillerato, comparando un grupo experimental contra uno de control.

---

## 1. Stack tecnológico

- **Next.js 14** (App Router, `app/`), React 18, JavaScript (no TypeScript).
- **Supabase** (PostgreSQL) accedido con `@supabase/supabase-js` usando **service_role key** desde el servidor (`lib/supabase.js`).
- **Gemini** (`@google/generative-ai`): generación de ítems/teoría, juez LLM, traducción, datos curiosos, y **embeddings** (`gemini-embedding-001`). Modelo de texto: `gemini-2.5-flash-lite` (env `GEMINI_MODEL`).
- **Auth propia**: JWT (`jsonwebtoken`) + `bcryptjs`. No se usa Supabase Auth.
- **Zustand** (con `persist`) para estado cliente. **Dexie** (IndexedDB) para offline.
- **web-push** (VAPID) para notificaciones. **PWA** con `public/sw.js` + `app/manifest.js`.
- **recharts** para gráficas. **Tailwind CSS v4**. **pdf-parse** para leer PDFs.
- Deploy: **Vercel** (incluye cron). `vercel.json` define el cron de recordatorios.

### Variables de entorno (ver `SETUP.md`)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `JWT_EXPIRES_IN` (8h), `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-2.5-flash-lite`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.

---

## 2. Roles y autenticación

Tres roles: **`administrador`**, **`docente`**, **`estudiante`** (columna `usuario.rol`).

- Login: `POST /api/auth/login` → valida `nombre_usuario` + clave (bcrypt), firma JWT con payload `{ id, role, ... }`.
- El JWT viaja en header `Authorization: Bearer <token>`. `lib/auth.js` expone:
  - `signToken(payload)`
  - `withAuth(handler, requiredRole)` — HOF que protege cada route handler. `requiredRole` puede ser string o array de roles. Devuelve 401/403 según corresponda. **Nota:** el token usa `user.role` pero en los handlers el id del usuario se lee como `user.id`.
- **Home por rol** (`lib/rutas.js` → `rutaPorRol`): `administrador → /admin`, `docente → /teacher`, `estudiante → /student`.
- **Cambio de clave obligatorio**: al crear/resetear un usuario, `usuario.debe_cambiar_clave = TRUE` y clave por defecto `jireh2024` (`lib/usuarios.js` → `CLAVE_POR_DEFECTO`, `CLAVE_MIN = 4`). Flujo en `/cambiar-clave` y `POST /api/auth/change-password`.
- Estado cliente: `store/authStore.js` (zustand persist, key `adaptajireh-auth`, guarda `token` + `user`, flag `hasHydrated`). Guard de rutas: `hooks/useAuthGuard.js`.

---

## 3. Modelo de datos (PostgreSQL)

Migraciones en `supabase/migrations/001..021`. Ejecutar en orden en el SQL Editor de Supabase.

### Tablas núcleo (migración 001)
- **`usuario`**: `id_usuario` (UUID PK), `codigo_anonimo` (único, p.ej. `EST-001`), `nombre_usuario` (único), `clave_hash`, `rol` (`docente|estudiante`, luego +`administrador`), `grado`, `creado_en`.
- **`materia`**: `id_materia`, `nombre`, `id_docente`, `activa`.
- **`unidad_curricular`** (= "tema"): `id_unidad`, `id_materia`, `nombre`, `nivel_bloom` (1–4). Luego +`visible` (mig. 010).
- **`inscripcion`**: `id_estudiante` + `id_materia` (único). Qué materias cursa cada alumno.
- **`item`** (pregunta): `id_item`, `id_unidad`, `nivel_bloom` (1–4), `pregunta`, `respuesta_ref`, `pista`, `embedding_ref` (JSON serializado del embedding de la respuesta ref), `activo`, `creado_en`. Luego +`pregunta_es`, `pista_es` (traducciones, mig. 004/012).
- **`item_fsrs`** (estado de memoria por ítem×estudiante): `id_registro`, `id_item`, `id_estudiante`, `D` (dificultad), `S` (estabilidad), `R` (retenibilidad), `proxima_revision` (DATE), `ultima_revision`, `total_repasos`. Único `(id_item, id_estudiante)`. **Ojo casing:** columnas `D/S/R` se crearon mayúsculas pero en Postgres quedan minúsculas → en las queries se usan alias `D:d, S:s, R:r`.
- **`sesion`**: `id_sesion`, `id_estudiante`, `id_materia`, `fecha`, `hora_inicio`, `hora_fin`, `total_items`, `items_completados`, `duracion_min`.
- **`respuesta`** (fila cruda de investigación, una por ítem respondido): `id_respuesta`, `id_sesion`, `id_item`, `id_estudiante`, `respuesta_texto`, `tiempo_respuesta_ms`, `timestamp_resp`, y las **variables**: `SST`, `TO_rate`, `IRE_dias`, `D_post`, `S_post`, `R_post`, `ELC`, `CE`, `DD`, `CR`, `rating_frs`. Migraciones posteriores agregan `tr, pa, ar, uso_pista, retencion_decaida, dias_desde_repaso`. **Casing:** en JS se insertan en minúsculas (`sst, ire_dias, d_post, s_post, ce, dd, cr, tr, pa, ar, ...`).
- **`retroalimentacion`**: `id_respuesta`, `diagnostico`, `explicacion`, `ejemplo`, `tipo` (`generativa|explicativa|basica`).

### Tablas añadidas por migraciones
- **`teoria`** (003): apuntes por unidad — `id_teoria`, `id_unidad`, `resumen`, `secciones` (JSON: `[{titulo, contenido}]`), `creado_en`.
- **Racha/notificaciones** (005): tablas para push subscriptions y recordatorios.
- **`dia_sin_pendientes`** (015): días de descanso del alumno (para no romper la racha).
- Otras: 006 alertas por docente, 007 variables tesis, 008 admin/clave, 009 ítems docente, 011 uso_pista, 013 precisión FSRS-5, 014 dato curioso, 016 variable LR, 017 retención decaída, 018 rol administrador, 019/020/021 agregación y export de variables.

### Funciones RPC de Postgres (mig. 002 y otras)
- `incrementar_items_completados(p_id_sesion)`, `cerrar_sesion(p_id_sesion)` (calcula `duracion_min`).
- `get_retention_chart(p_id_materia, p_fecha_desde)` — evolución de R(t) por día.
- `get_at_risk_students()` — alumnos con olvidos altos.
- `export_research_csv(...)`, y **`export_variables_por_estudiante(p_id_materia, p_fecha_desde)`** (mig. 020): **una fila por estudiante con las 10 variables + su categoría** (0/1/2/3) según la matriz de operacionalización.

---

## 4. Las 10 variables de investigación (matriz de operacionalización)

Actualmente **10 variables** (se eliminaron TO/R/ELC; CR se renombró a LR en jul 2026). Fuente: mig. 020 y `lib/telemetry.js`.

| # | Var | Significado | Cómo se calcula | Cortes de categoría |
|---|-----|-------------|-----------------|---------------------|
| 1 | **TR** | Índice de transferencia | aciertos en ítems Bloom 3/4 (`esItemDeTransferencia`); NULL en Bloom 1–2 | ≤0.40 baja · ≤0.70 media · >0.70 alta |
| 2 | **IRE** | Intervalo de repetición estimado (días) | `calculateInterval(S)` de FSRS | ≤3 · ≤7 · ≤14 · >14 |
| 3 | **D** | Dificultad FSRS (escala **1–10**) | `d_post` tras actualizar FSRS | ≤4 · ≤7 · >7 |
| 4 | **S** | Estabilidad (días) | `s_post` | ≤7 · ≤21 · ≤60 · >60 |
| 5 | **PA** | Precisión en primer intento | `usedHint ? 0 : acierto` (acierto = rating≥3) | ≤0.50 · ≤0.80 · >0.80 |
| 6 | **SST** | Similitud semántica textual [0,1] | embeddings, coseno calibrado (`lib/nlp.js`) | ≤0.40 · ≤0.70 · >0.70 |
| 7 | **AR** | Adherencia al repaso | `onTime ? 1 : 0` (hoy ≤ proxima_revision); solo repasos programados reales | ≤0.60 · ≤0.85 · >0.85 |
| 8 | **CE** | Carga de estudio | por ítems y minutos/sesión; categoría = la más exigente | <10 · 10–20 · >20 |
| 9 | **DD** | Dificultad deseable (nivel Bloom) | `nivel_bloom` del ítem | cat = ROUND(nivel)−1 |
| 10 | **LR** | Latencia de respuesta (segundos) | `tiempo_respuesta_ms/1000` | <15 · ≤45 · >45 |

`TR` solo aplica en Bloom 3 (transferencia cercana) y 4 (lejana).
Medida interna de la **Variable Dependiente (Retención Cognitiva)**: `retencion_decaida` (R(t) decaída antes del repaso) + `dias_desde_repaso`, solo desde el 2.º repaso.

---

## 5. Motor FSRS-5 (`lib/fsrs5.js`)

Implementación canónica de Free Spaced Repetition Scheduler v5. 19 pesos `w0..w18`.
Modelo de memoria por ítem×estudiante: **D** (dificultad 1–10), **S** (estabilidad, días), **R** (retenibilidad [0,1]).

- Curva de olvido: `R(t) = (1 + FACTOR·t/S)^DECAY`, `DECAY=-0.5`, `FACTOR≈0.2346`.
- `REQUEST_RETENTION = 0.9` (retención objetivo para agendar).
- Funciones exportadas:
  - `calculateRetrieval(S, daysSince)` → R actual.
  - `calculateInterval(S, retention)` → IRE en días.
  - `updateFSRS(currentD, currentS, currentR, rating, totalReviews)` → `{difficulty, stability, retrievability, next_review, ire_days}`. En el **1er repaso** (`totalReviews=0`) fija D₀ y S₀ e ignora valores previos.
  - `ratingFromSST(score)`: `≥0.71→3 (Good)`, `≥0.41→2 (Hard)`, `<0.41→1 (Again)`. Rating 4 (Easy) no se infiere automáticamente.
- Ratings FSRS: 1=Again, 2=Hard, 3=Good, 4=Easy.

---

## 6. NLP / Embeddings (`lib/nlp.js`)

- `computeReferenceEmbedding(referenceAnswer)` → serializa embedding de la respuesta de referencia (se guarda en `item.embedding_ref` al crear el ítem).
- `computeSST(studentResponse, referenceEmbedding)` → coseno **calibrado**: los embeddings de Gemini tienen "piso" ≈0.5, así que se remapea `[SST_PISO=0.5, 0.95]→[0,1]`.
- `classifyFeedback(sst)`: `≥0.71 basic`, `≥0.41 explanatory`, `<0.41 generative`.

---

## 7. Capa LLM (`lib/llm.js`) — Gemini

Modelo `gemini-2.5-flash-lite`, `apiVersion: v1beta`. Helpers: `withRetry` (backoff ante 503/429), `parseJSONSeguro`/`repararJSON`/`rescatarSecciones` (tolerante a JSON truncado). `MAX_CONTEXT_CHARS = 40000`.

Funciones:
- `checkTopicRelevance(...)` — verifica que el PDF corresponda al tema (fail-open: si falla, `relacionado:true`).
- `generateItems(...)` — ítems de un solo nivel Bloom.
- `generateItemsByLevel({perLevel, esIngles, esMatematicas, ...})` — **genera `perLevel` ítems por cada uno de los 4 niveles Bloom en UNA sola llamada**; cada ítem etiquetado con su `bloom`.
- `regenerateItem(...)` — regenera 1 ítem manteniendo su Bloom; ajuste `facil|dificil|similar` + instrucción libre del docente.
- `generateTheory(...)` — apuntes de estudio (`{resumen, secciones}`); si recibe `preguntas`, cubre los conceptos necesarios para resolverlas.
- `generateMoreTheorySections(...)` — amplía teoría sin repetir secciones.
- `generateDailyFact({temas})` — un dato curioso motivador al entrar a la app.
- `gradeAnswer({question, referenceAnswer, studentResponse, bloomLevel})` — **juez LLM**: `{score 0–1, diagnostico, explicacion, ejemplo, texto}`. Penaliza definiciones invertidas/negaciones que el SST no detecta. Feedback en 2ª persona ("tú").
- `translateQuestions(questions)` — traduce lote al español; `null` si ya está en español.
- `generateFeedback(...)` — retroalimentación cuando SST<0.41.

**Ajustes especiales por materia** (`lib/idioma.js` → `esMateriaIngles`, `esMateriaMatematicas`):
- **Matemáticas** (`AJUSTE_MATEMATICAS`): baja notoriamente la dificultad, números pequeños, un solo paso, pistas que no revelan.
- **Inglés** (`BLOOM_LABELS_INGLES` en `lib/bloom.js`): niveles 2–4 simplificados; enunciado/respuesta/pista **en español**, solo el vocabulario a aprender en inglés.
- `INSTRUCCIONES_CLARAS`: obliga enunciados claros + pedir justificación explícita.

---

## 8. Niveles de Bloom (`lib/bloom.js`)

**Fuente única** de los 4 niveles (no duplicar en otros archivos):
1. **Recordar / Comprender**
2. **Aplicar / Analizar**
3. **Evaluar**
4. **Crear**

Exporta `NIVELES_BLOOM`, `NIVELES_BLOOM_VALORES` `[1,2,3,4]`, `BLOOM_LABELS` (guía para el LLM), `BLOOM_LABELS_INGLES` (guía simplificada para inglés), `bloomInfo(nivel)`.

---

## 9. Progresión y composición de sesión (`lib/progression.js`)

**Compuerta de maestría por nivel Bloom, por unidad:**
- Un nivel se **domina** (y desbloquea el siguiente) cuando el alumno acierta ≥ **`UMBRAL_DOMINIO = 0.9`** (90%) de los ítems activos de ese nivel. Acierto = `rating_frs ≥ RATING_ACIERTO (3)`.
- `itemsAcertados(studentId, ids)` — usa histórico (progresión monótona: dominar no se revierte).
- `nivelDesbloqueado(items, acertados)` — primer nivel no dominado.
- `filtrarPorBloom(filas, acertados)` — deja solo ítems de niveles desbloqueados.
- `componerSesion(permitidos, today)` — **TODOS los repasos vencidos** (sin tope, ordenados por menor R = más a punto de olvidar) + hasta **`MAX_NUEVOS = 6`** ítems nuevos (del Bloom más bajo hacia arriba).
- `cargaCognitivaRecomendada(filas)` — recomendación por alumno (Teoría de carga cognitiva de Sweller): combina retención R (60%) y facilidad (40%), escala entre `CARGA_MIN=5` y `CARGA_MAX=15`. Sin historial: `CARGA_BASE_SIN_HISTORIAL=8`. **Solo orienta, no recorta la sesión.**

---

## 10. Flujo de evaluación de una respuesta (`app/api/fsrs/evaluate/route.js`)

`POST /api/fsrs/evaluate` (rol estudiante). Body: `{sessionId, itemId, studentResponse, responseTimeMs, totalItemsInSession, usedHint}`.

1. Obtiene el ítem y su registro `item_fsrs` (lo crea si no existe).
2. Calcula `previousR` = retenibilidad real decaída con `calculateRetrieval(S, díasDesdeÚltimaRevisión)`.
3. Calcula `onTime` (AR): hoy ≤ `proxima_revision`.
4. **Doble evaluación**:
   - **SST** por embeddings (`computeSST`) → variable de investigación.
   - **Juez LLM** (`gradeAnswer`) → `gradeScore` = corrección real que impulsa el rating y el feedback. Si el juez falla, cae a usar SST.
5. `rating = ratingFromSST(gradeScore)` → `updateFSRS(...)` → guarda D/S/R, `proxima_revision`, `ultima_revision`, `total_repasos++`.
6. `logSessionEntry(...)` (`lib/telemetry.js`) inserta la fila en `respuesta` con todas las variables (CE, PA, AR, TR, DD, SST, rating, retención decaída, etc.) y, si corresponde, la fila en `retroalimentacion`.
7. `incrementar_items_completados(sessionId)` (RPC).
8. Responde con `sst_score`, `grade_score`, `feedback_type`, `feedback`/`feedback_parts` (diagnóstico/explicación/ejemplo), `reference_answer`, `fsrs`. El feedback solo se muestra si `gradeScore < 0.71`.

**Sesión**: `POST /api/fsrs/session/start` y `/end` (cierra con RPC `cerrar_sesion`). Cola pendiente: `GET /api/fsrs/pending?subjectId=` (aplica compuerta Bloom + composición; devuelve `{items, recommended}`).

---

## 11. Rachas (`lib/streak.js`)

- Zona horaria Guatemala UTC−6 (`fechaGT`, `horaGT`).
- `estadoRacha(studentId)` → `{goal, todayCount, todayMet, current, best}`.
- La **meta diaria** = carga cognitiva recomendada, **limitada por lo realmente disponible hoy** (misma lógica que `/fsrs/pending`), para que nunca pida más ítems de los desbloqueados.
- **Día de descanso**: si no hay nada que repasar (capacidad 0), se registra en `dia_sin_pendientes` y cuenta como cumplido (no rompe la racha).
- `calcularRacha(diasCumplidos, hoy)` → racha actual (cuenta hacia atrás desde hoy/ayer) + mejor racha.
- Endpoints: `GET /api/student/streak`, componente `components/PanelRacha.jsx`.

---

## 12. Estructura de rutas (páginas y APIs)

### Páginas (`app/`)
- Público: `/` (redirección), `/login`, `/cambiar-clave`.
- **Estudiante** `/student`: panel principal; `/student/learn` (aprender teoría), `/student/review` (responder ítems).
- **Docente** `/teacher`: panel; `/teacher/upload` (subir PDF→generar), `/teacher/items` (gestión de ítems), `/teacher/theory` (teoría), `/teacher/temas` (unidades/temas, visibilidad), `/teacher/analytics` (variables + CSV), `/teacher/admin`.
- **Admin** `/admin`: gestión de usuarios/contraseñas, materias, inscripciones.

### APIs (`app/api/`)
- **auth**: `login`, `logout`, `me`, `change-password`.
- **student**: `subjects`, `learn`, `notifications`, `streak`, `daily-fact`, `forecast`.
- **fsrs**: `pending`, `evaluate`, `session/start`, `session/end`.
- **teacher**: `items` (GET/POST), `items/generate`, `items/regenerate`, `theory`.
- **material**: `upload` (PDF→preview de ítems+teoría, NO guarda), `save` (confirma y guarda), `generate-more`, `generate-theory`, `subjects`, `units`.
- **analytics**: `metrics`, `alerts`, `retention-chart`.
- **admin**: `students`, `students/[id]`, `students/[id]/reset-password`, `subjects`, `users`, `users/[id]`, `users/[id]/enrollments`, `users/[id]/reset-password`.
- **export**: `csv` (llama a las funciones RPC de export).
- **push**: `public-key`, `subscribe`, `unsubscribe`.
- **cron**: `send-reminders` (protegido por `CRON_SECRET`; configurado en `vercel.json`).

---

## 13. Flujo del docente (subir material)

1. `/teacher/upload`: elige materia → tema (unidad) → nº de ítems por nivel → sube PDF.
2. `POST /api/material/upload`: extrae texto (`lib/pdf.js`), verifica relevancia (`checkTopicRelevance`), genera ítems en los 4 niveles Bloom (`generateItemsByLevel`) + teoría (`generateTheory`). **Devuelve preview, no guarda.** `MIN_POR_NIVEL = 3`.
3. El docente revisa/edita/regenera ítems y luego confirma con `POST /api/material/save`, que persiste `item` (calculando `embedding_ref` de cada respuesta ref) y `teoria`.
4. **Asignación a alumnos** (`lib/usuarios.js`): `inscribirEnMateria` / `asignarItemsDeMateria` crean los `item_fsrs` (una fila por ítem×estudiante) — **esto es lo que llena la cola de repaso**; inscribir solo en `inscripcion` no basta. `desinscribirDeMateria` borra avance pero conserva `respuesta` histórica.

---

## 14. Gestión de usuarios (`lib/usuarios.js`)

- `CLAVE_POR_DEFECTO = 'jireh2024'`, `CLAVE_MIN = 4`, `hashClave` (bcrypt 10 rondas).
- `siguienteCodigoAnonimo(prefijo)` — correlativos `EST-001`, `DOC-001`, `ADM-001`.
- Al crear/resetear: se marca `debe_cambiar_clave = TRUE`.
- Admin gestiona usuarios, materias e inscripciones (con asignación de ítems) desde `/admin` y `app/api/admin/*`.

---

## 15. PWA / Offline / Notificaciones

- **PWA**: `app/manifest.js`, `public/sw.js`, íconos en `public/`. `public/offline.html` de fallback.
- **Offline**: `hooks/useOfflineSync.js` (detecta `online/offline`), `store/sessionStore.js`, Dexie (IndexedDB) para encolar respuestas offline. Componentes `ModoOffline.jsx`, `OfflineBanner.jsx`.
- **Push**: `lib/push.js` (web-push VAPID). Suscripción vía `/api/push/subscribe`. Cron diario `/api/cron/send-reminders` envía recordatorios (protegido con `CRON_SECRET`, agendado en `vercel.json`).

---

## 16. Componentes clave (`components/`)

`Brand.jsx`, `Flashcard.jsx` (tarjeta de pregunta/respuesta), `BloomBadge.jsx`, `SemanticBar.jsx` (barra de SST), `MathField.jsx` (fórmulas), `ForecastCalendar.jsx` (pronóstico de repasos), `PanelRacha.jsx` (racha), `ModoOffline.jsx`, `OfflineBanner.jsx`.

---

## 17. Convenciones y "gotchas" importantes

- **Casing de columnas**: las variables (`D, S, R` en `item_fsrs`; `SST, D_post, ...` en `respuesta`) están en **minúsculas** en Postgres. En JS: leer con alias (`D:d`) e insertar en minúsculas (`d_post`, `sst`, `ire_dias`, ...). El CSV/RPC usa comillas dobles para exponerlas en mayúsculas.
- **`user.role`** (en el JWT/`withAuth`) vs **`user.id`** (id del usuario en los handlers).
- **Variables actuales = 10**. Eliminadas: TO, R, ELC. Renombre: **CR → LR** (jul 2026). El `SETUP.md` todavía lista la nomenclatura vieja (TO/R/ELC/CR) — usar la matriz de la sección 4 / mig. 020 como fuente de verdad.
- **SST vs juez LLM**: SST (embeddings) es variable de investigación; el **juez LLM** (`gradeAnswer`) es lo que realmente decide el rating y el feedback mostrado.
- **Repasos sin tope, nuevos con tope** (`MAX_NUEVOS=6`): el alumno siempre puede saldar toda su deuda de olvido.
- **Compuerta Bloom al 90%** por unidad, monótona (histórico de aciertos).
- Idiomas: seed con `docente01/jireh2024`, `est001–est005` (experimental, 1ro Básico A), `est006–est010` (control, 2do Básico B).
- Grupos de investigación: **experimental** (usa el sistema completo) vs **control**.
