'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import api from '@/services/api';

const NIVELES_BLOOM = [
  { valor: '1', etiqueta: 'Nivel 1 — Recordar' },
  { valor: '2', etiqueta: 'Nivel 2 — Comprender' },
  { valor: '3', etiqueta: 'Nivel 3 — Aplicar' },
  { valor: '4', etiqueta: 'Nivel 4 — Analizar' },
];

function ContenidoSubida() {
  useAuthGuard('docente');
  const router = useRouter();
  const params = useSearchParams();

  // ── Estado del formulario ──────────────────────────────
  const [materias,  setMaterias]  = useState([]);
  const [unidades,  setUnidades]  = useState([]);
  const [materiaId, setMateriaId] = useState(params.get('subjectId') ?? '');
  const [unidadId,  setUnidadId]  = useState('');
  const [bloom,     setBloom]     = useState('2');
  const [cantidad,  setCantidad]  = useState('5');
  const [archivo,   setArchivo]   = useState(null);

  // ── Estado de la previsualización ──────────────────────
  const [items,         setItems]         = useState([]);
  const [theory,        setTheory]        = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [actual,        setActual]        = useState(0);
  const [cantidadMas,   setCantidadMas]   = useState('5');

  // ── Estado de UI ───────────────────────────────────────
  const [mensaje,     setMensaje]     = useState('');
  const [error,       setError]       = useState('');
  const [cargando,    setCargando]    = useState(false);
  const [generandoMas, setGenerandoMas] = useState(false);
  const [guardando,   setGuardando]   = useState(false);

  const enPreview = items.length > 0;

  useEffect(() => {
    api.get('/material/subjects').then((r) => setMaterias(r.data)).catch(() => {});
  }, []);

  const cargarUnidades = useCallback(async (sid) => {
    if (!sid) { setUnidades([]); setUnidadId(''); return; }
    try {
      const { data } = await api.get(`/material/units?subjectId=${sid}`);
      setUnidades(data);
      setUnidadId('');
    } catch { setUnidades([]); }
  }, []);

  useEffect(() => { cargarUnidades(materiaId); }, [materiaId, cargarUnidades]);

  // ── Generar previsualización ───────────────────────────
  async function handleGenerar(e) {
    e.preventDefault();
    if (!archivo || !unidadId) return;
    setCargando(true);
    setMensaje('');
    setError('');

    const form = new FormData();
    form.append('pdf',        archivo);
    form.append('unitId',     unidadId);
    form.append('bloomLevel', bloom);
    form.append('itemCount',  cantidad);

    try {
      const { data } = await api.post('/material/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setItems(data.items ?? []);
      setTheory(data.theory ?? null);
      setExtractedText(data.extractedText ?? '');
      setActual(0);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al procesar el PDF. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  // ── Generar más ítems sin repetir ──────────────────────
  async function handleGenerarMas() {
    setGenerandoMas(true);
    setError('');
    try {
      const { data } = await api.post('/material/generate-more', {
        extractedText,
        unitId: unidadId,
        bloomLevel: bloom,
        itemCount: parseInt(cantidadMas, 10) || 5,
        excludeQuestions: items.map((it) => it.question),
      }, { timeout: 120000 });
      const nuevos = data.items ?? [];
      if (nuevos.length === 0) {
        setError('No se generaron ítems nuevos. Intenta de nuevo.');
      } else {
        setActual(items.length); // saltar al primero nuevo
        setItems((prev) => [...prev, ...nuevos]);
      }
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudieron generar más ítems.');
    } finally {
      setGenerandoMas(false);
    }
  }

  // ── Editar / eliminar ítem actual ──────────────────────
  function actualizarCampo(campo, valor) {
    setItems((prev) => prev.map((it, i) => (i === actual ? { ...it, [campo]: valor } : it)));
  }

  function eliminarActual() {
    const next = items.filter((_, i) => i !== actual);
    setActual(Math.max(0, Math.min(actual, next.length - 1)));
    setItems(next);
  }

  // ── Guardar todos ──────────────────────────────────────
  async function handleGuardar() {
    setGuardando(true);
    setError('');
    try {
      const { data } = await api.post('/material/save', {
        unitId: unidadId,
        bloomLevel: bloom,
        items,
        theory,
      }, { timeout: 120000 });
      setMensaje(data.message);
      setItems([]);
      setTheory(null);
      setExtractedText('');
      setArchivo(null);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al guardar los ítems.');
    } finally {
      setGuardando(false);
    }
  }

  function descartarPreview() {
    if (!confirm('¿Descartar los ítems generados? No se guardarán.')) return;
    setItems([]);
    setTheory(null);
    setExtractedText('');
    setError('');
  }

  // ════════════════════════════════════════════════════════
  // RENDER: PREVISUALIZACIÓN
  // ════════════════════════════════════════════════════════
  if (enPreview) {
    const item = items[actual];
    return (
      <div className="pagina">
        <header className="encabezado">
          <button onClick={descartarPreview} className="enlace-volver">
            Descartar
          </button>
          <span className="titulo-pagina">Revisar ítems generados</span>
        </header>

        <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '2rem 1rem' }}>
          {error && <p className="alerta-error" style={{ marginBottom: '1rem' }}>{error}</p>}

          {/* Navegación */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <button
              className="btn-secundario"
              onClick={() => setActual((a) => Math.max(0, a - 1))}
              disabled={actual === 0}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: '0.875rem', color: 'var(--gris-500)', fontWeight: 500 }}>
              Ítem {actual + 1} de {items.length}
            </span>
            <button
              className="btn-secundario"
              onClick={() => setActual((a) => Math.min(items.length - 1, a + 1))}
              disabled={actual === items.length - 1}
            >
              Siguiente →
            </button>
          </div>

          {/* Tarjeta del ítem (editable) */}
          <div className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="etiqueta">Pregunta</label>
              <textarea
                className="campo"
                rows={2}
                value={item.question ?? ''}
                onChange={(e) => actualizarCampo('question', e.target.value)}
              />
            </div>
            <div>
              <label className="etiqueta">Respuesta de referencia</label>
              <textarea
                className="campo"
                rows={3}
                value={item.reference_answer ?? ''}
                onChange={(e) => actualizarCampo('reference_answer', e.target.value)}
              />
            </div>
            <div>
              <label className="etiqueta">Pista</label>
              <textarea
                className="campo"
                rows={2}
                value={item.feedback_hint ?? ''}
                onChange={(e) => actualizarCampo('feedback_hint', e.target.value)}
              />
            </div>
            <button
              className="btn-secundario"
              style={{ color: 'var(--peligro)', borderColor: 'var(--peligro)' }}
              onClick={eliminarActual}
            >
              Eliminar este ítem
            </button>
          </div>

          {/* Apuntes de teoría que se guardarán para "Aprender" */}
          {theory && (theory.resumen || theory.secciones?.length > 0) && (
            <details className="tarjeta" style={{ marginTop: '1.5rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--gris-700)' }}>
                Apuntes de teoría generados ({theory.secciones?.length ?? 0} secciones)
              </summary>
              {theory.resumen && (
                <p style={{ fontSize: '0.875rem', color: 'var(--gris-600)', margin: '0.75rem 0' }}>
                  {theory.resumen}
                </p>
              )}
              {(theory.secciones ?? []).map((s, i) => (
                <div key={i} style={{ marginTop: '0.75rem' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gris-800)' }}>{s.titulo}</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--gris-600)', lineHeight: 1.6 }}>{s.contenido}</p>
                </div>
              ))}
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.75rem' }}>
                Estos apuntes se guardarán para que los estudiantes los lean en la sección «Aprender».
              </p>
            </details>
          )}

          {/* Generar más */}
          <div className="tarjeta" style={{ marginTop: '1.5rem' }}>
            <label className="etiqueta">¿Faltan temas? Genera más ítems (sin repetir)</label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ width: '6rem' }}>
                <input
                  type="number"
                  className="campo"
                  min={1}
                  max={15}
                  value={cantidadMas}
                  onChange={(e) => setCantidadMas(e.target.value)}
                />
              </div>
              <button
                className="btn-secundario"
                style={{ flex: 1 }}
                onClick={handleGenerarMas}
                disabled={generandoMas}
              >
                {generandoMas ? 'Generando...' : 'Generar más ítems'}
              </button>
            </div>
          </div>

          {/* Guardar */}
          <button
            className="btn-primario btn-ancho"
            style={{ marginTop: '1.5rem' }}
            onClick={handleGuardar}
            disabled={guardando || items.length === 0}
          >
            {guardando ? 'Guardando...' : `Guardar ${items.length} ítem${items.length !== 1 ? 's' : ''}`}
          </button>
        </main>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  // RENDER: FORMULARIO
  // ════════════════════════════════════════════════════════
  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Subir material</span>
      </header>

      <main style={{ maxWidth: '36rem', margin: '0 auto', padding: '2rem 1rem' }}>
        <div className="tarjeta">
          <p style={{ fontSize: '0.875rem', color: 'var(--gris-500)', marginBottom: '1.25rem' }}>
            Sube un PDF con el contenido del tema. El sistema extraerá el texto y
            generará preguntas que podrás <strong>revisar uno por uno</strong> antes de guardarlas.
          </p>

          <form onSubmit={handleGenerar} className="formulario-subida">
            <div>
              <label className="etiqueta">Materia</label>
              <select
                className="campo"
                value={materiaId}
                onChange={(e) => setMateriaId(e.target.value)}
                required
              >
                <option value="">Selecciona una materia...</option>
                {materias.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="etiqueta">Tema</label>
              <select
                className="campo"
                value={unidadId}
                onChange={(e) => setUnidadId(e.target.value)}
                disabled={!materiaId || unidades.length === 0}
                required
              >
                <option value="">
                  {!materiaId ? 'Selecciona una materia primero' : 'Selecciona un tema...'}
                </option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>

            <div className="cuadricula-form-2">
              <div>
                <label className="etiqueta">Nivel Bloom</label>
                <select className="campo" value={bloom} onChange={(e) => setBloom(e.target.value)}>
                  {NIVELES_BLOOM.map((n) => (
                    <option key={n.valor} value={n.valor}>{n.etiqueta}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="etiqueta">Cantidad de preguntas</label>
                <input
                  type="number"
                  className="campo"
                  min={5}
                  max={30}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="etiqueta">Archivo PDF</label>
              <input
                type="file"
                accept=".pdf"
                className="campo"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                required
              />
              {archivo && <p className="nombre-archivo">{archivo.name}</p>}
            </div>

            {mensaje && <p className="alerta-exito">{mensaje}</p>}
            {error   && <p className="alerta-error">{error}</p>}

            <button
              type="submit"
              className="btn-primario btn-ancho"
              disabled={cargando || !archivo || !unidadId}
            >
              {cargando ? 'Generando ítems con IA...' : 'Generar ítems con IA'}
            </button>
          </form>
        </div>

        {cargando && (
          <p className="nota-carga">
            Este proceso puede tardar entre 30 y 60 segundos según el tamaño del PDF.
          </p>
        )}
      </main>
    </div>
  );
}

export default function PaginaSubida() {
  return (
    <Suspense fallback={
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando...</p>
      </div>
    }>
      <ContenidoSubida />
    </Suspense>
  );
}
