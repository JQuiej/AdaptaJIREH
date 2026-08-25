# Estudio de concordancia docente–sistema (Figura 22)

Comparación entre la calificación automática del juez LLM del sistema y la calificación
manual del docente, sobre **30 respuestas abiertas reales** escritas por estudiantes de
bachillerato del Liceo JIREH durante el uso en aula (23–28 de julio de 2026).

## Cómo se construyó la muestra

- Fuente: tabla `respuesta`, filtrando `grade_score IS NOT NULL` — es decir, únicamente
  respuestas calificadas por el juez LLM real en producción (columna creada en la
  migración 022). Las respuestas simuladas por `seed-sesiones.mjs` **no** tienen
  `grade_score`, por lo que quedan excluidas automáticamente.
- Universo disponible: 1 000 respuestas calificadas (655 de Inglés, 345 de Matemáticas).
- Muestra: 15 de Inglés + 15 de Matemáticas, estratificada según la distribución real de
  bandas del sistema, con muestreo aleatorio de semilla fija (reproducible), sin repetir
  ítem ni texto de respuesta y con un máximo de 2 respuestas por estudiante.
- Resultado: 13 estudiantes distintos, 30 ítems distintos, punteo promedio del sistema 59.0.
  Bandas: Alto (≥71) 15 · Medio (41–70) 5 · Bajo (<41) 10.

## Procedimiento

1. Entregue al docente de Inglés `hoja_docente_ingles.md` y al de Matemáticas
   `hoja_docente_matematicas.md` (o `hoja_docente.csv` si prefieren Excel).
   **Estas hojas no muestran el punteo del sistema**, para evitar el sesgo de anclaje.
2. Cada docente asigna un punteo de 0 a 100 a cada respuesta con su criterio de aula.
3. Traslade los punteos a la columna `punteo_docente` de `clave_sistema.csv`
   (o de una copia) y guárdelo, por ejemplo, como `punteos_docentes.csv`.
4. Calcule la concordancia:

```bash
node tesis/concordancia/calcular_concordancia.mjs punteos_docentes.csv
```

`clave_sistema.csv` ya trae las fórmulas de Excel equivalentes en las columnas
`banda_docente`, `concuerda_banda`, `dif_abs` y `concuerda_10pts`, por si prefiere
hacer el cálculo en la hoja de cálculo.

## Criterios de concordancia

Se reportan dos criterios; conviene declarar en la tesis cuál se usa como principal:

- **Por banda** (recomendado como principal): coincide si ambas calificaciones caen en la
  misma banda pedagógica que ve el estudiante — Alto ≥71, Medio 41–70, Bajo <41. Es el
  criterio con significado real para el alumno, porque esas bandas determinan el mensaje
  y la retroalimentación que recibe.
- **Estricto (±10 puntos)**: coincide si la diferencia absoluta entre ambos punteos es
  de 10 puntos o menos. Es más exigente y suele dar un porcentaje menor.

El porcentaje de concordancia es `coincidencias / 30 × 100`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `hoja_docente_ingles.md` | Hoja ciega de calificación — docente de Inglés |
| `hoja_docente_matematicas.md` | Hoja ciega de calificación — docente de Matemáticas |
| `hoja_docente.csv` | Las 30 respuestas en formato Excel, sin el punteo del sistema |
| `clave_sistema.md` | Clave legible con los punteos del sistema (**no entregar al docente**) |
| `clave_sistema.csv` | Clave en Excel con fórmulas de concordancia listas |
| `muestra.json` | La muestra completa con todos los campos (dato crudo del estudio) |
| `calcular_concordancia.mjs` | Calcula los porcentajes una vez llenos los punteos |
| `01_extraer_respuestas.mjs` | Extrae de Supabase las respuestas con `grade_score` |
| `02_seleccionar_muestra.mjs` | Selecciona la muestra estratificada (semilla fija) |
| `03_generar_documentos.mjs` | Genera hojas, clave y CSV a partir de `muestra.json` |

Los scripts `01`–`03` se incluyen para que la muestra sea auditable y reproducible;
no hace falta volver a correrlos salvo que quiera regenerar el estudio.
