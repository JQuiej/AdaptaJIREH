'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import api from '@/services/api';
import MathField from '@/components/MathField';
import BloomBadge from '@/components/BloomBadge';
import { NIVELES_BLOOM } from '@/lib/bloom';

// Detecta si el nombre de la materia corresponde a Matemáticas, para mostrar
// la paleta de símbolos solo en ese caso.
const esMateriaMatematicas = (nombre) => /matem[aá]tic/i.test(nombre ?? '');

// Mínimo de ítems por nivel Bloom (coincide con el backend).
const MIN_POR_NIVEL = 3;

function ContenidoSubida() {
  useAuthGuard('docente');
  const router = useRouter();
  const params = useSearchParams();

  // ── Estado del formulario ──────────────────────────────
  const [materias,  setMaterias]  = useState([]);
  const [unidades,  setUnidades]  = useState([]);
  const [materiaId, setMateriaId] = useState(params.get('subjectId') ?? '');
  const [unidadId,  setUnidadId]  = useState('');
  const [porNivel,  setPorNivel]  = useState('5'); // ítems por nivel Bloom
  const [archivo,   setArchivo]   = useState(null);

  // ── Estado de la previsualización ──────────────────────
  const [items,         setItems]         = useState([]);
  const [theory,        setTheory]        = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [actual,        setActual]        = useState(0);
  const [masPorNivel,   setMasPorNivel]   = useState('2'); // ítems extra por nivel

  // ── Estado de UI ───────────────────────────────────────
  const [mensaje,     setMensaje]     = useState('');
  const [error,       setError]       = useState('');
  const [cargando,    setCargando]    = useState(false);
  const [generandoMas, setGenerandoMas] = useState(false);
  const [generandoTeoria, setGenerandoTeoria] = useState(false);
  const [guardando,   setGuardando]   = useState(false);

  // ── Estado para crear un tema nuevo ────────────────────
  const [modoNuevoTema,   setModoNuevoTema]   = useState(false);
  const [nuevoTemaNombre, setNuevoTemaNombre] = useState('');
  const [creandoTema,     setCreandoTema]     = useState(false);
  const [borrandoTema,    setBorrandoTema]    = useState(false);

  const enPreview = items.length > 0;
  const materiaMate = esMateriaMatematicas(
    materias.find((m) => m.id === materiaId)?.nombre
  );

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

  // ── Crear un tema nuevo en la materia seleccionada ─────
  async function crearTema() {
    const nombre = nuevoTemaNombre.trim();
    if (!materiaId || !nombre) return;
    setCreandoTema(true);
    setError('');
    try {
      const { data } = await api.post('/material/units', {
        subjectId: materiaId,
        nombre,
      });
      // Agregar el tema nuevo a la lista y seleccionarlo automáticamente.
      setUnidades((prev) =>
        [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setUnidadId(data.id);
      setNuevoTemaNombre('');
      setModoNuevoTema(false);
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo crear el tema.');
    } finally {
      setCreandoTema(false);
    }
  }

  // ── Eliminar el tema seleccionado ──────────────────────
  async function eliminarTema() {
    const tema = unidades.find((u) => u.id === unidadId);
    if (!tema) return;
    if (!confirm(
      `¿Eliminar el tema «${tema.nombre}»?\n\nSe borrarán también todos sus ítems, ` +
      `apuntes de teoría y el avance de los estudiantes en ese tema. Esta acción no se puede deshacer.`
    )) return;

    setBorrandoTema(true);
    setError('');
    setMensaje('');
    try {
      await api.delete(`/material/units?unitId=${unidadId}`);
      setUnidades((prev) => prev.filter((u) => u.id !== unidadId));
      setUnidadId('');
      setMensaje(`Tema «${tema.nombre}» eliminado.`);
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar el tema.');
    } finally {
      setBorrandoTema(false);
    }
  }

  // ── Generar previsualización ───────────────────────────
  async function handleGenerar(e) {
    e.preventDefault();
    if (!archivo || !unidadId) return;
    setCargando(true);
    setMensaje('');
    setError('');

    const form = new FormData();
    form.append('pdf',      archivo);
    form.append('unitId',   unidadId);
    form.append('perLevel', porNivel);

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

  // ── Generar SOLO la teoría de un tema (sin crear ítems) ─────
  // Recupera temas que quedaron sin teoría (p. ej. si esa generación falló).
  async function handleGenerarTeoria() {
    if (!archivo || !unidadId) return;
    setGenerandoTeoria(true);
    setMensaje('');
    setError('');

    const form = new FormData();
    form.append('pdf',    archivo);
    form.append('unitId', unidadId);

    try {
      const { data } = await api.post('/material/generate-theory', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setMensaje(data.message ?? 'Teoría generada.');
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo generar la teoría. Intenta de nuevo.');
    } finally {
      setGenerandoTeoria(false);
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
        perLevel: parseInt(masPorNivel, 10) || 2,
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
        items, // cada ítem lleva su propio nivel `bloom`
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

          {/* Nivel Bloom del ítem actual */}
          {item.bloom != null && (
            <div style={{ marginBottom: '0.75rem' }}>
              <BloomBadge nivel={item.bloom} />
            </div>
          )}

          {/* Tarjeta del ítem (editable) */}
          <div className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="etiqueta">Pregunta</label>
              {materiaMate ? (
                <MathField
                  rows={2}
                  value={item.question ?? ''}
                  onChange={(v) => actualizarCampo('question', v)}
                />
              ) : (
                <textarea
                  className="campo"
                  rows={2}
                  value={item.question ?? ''}
                  onChange={(e) => actualizarCampo('question', e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="etiqueta">Respuesta de referencia</label>
              {materiaMate ? (
                <MathField
                  rows={3}
                  value={item.reference_answer ?? ''}
                  onChange={(v) => actualizarCampo('reference_answer', v)}
                />
              ) : (
                <textarea
                  className="campo"
                  rows={3}
                  value={item.reference_answer ?? ''}
                  onChange={(e) => actualizarCampo('reference_answer', e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="etiqueta">Pista</label>
              {materiaMate ? (
                <MathField
                  rows={2}
                  value={item.feedback_hint ?? ''}
                  onChange={(v) => actualizarCampo('feedback_hint', v)}
                />
              ) : (
                <textarea
                  className="campo"
                  rows={2}
                  value={item.feedback_hint ?? ''}
                  onChange={(e) => actualizarCampo('feedback_hint', e.target.value)}
                />
              )}
            </div>
            <button
              className="btn-secundario"
              style={{ color: 'var(--peligro)', borderColor: 'var(--peligro)' }}
              onClick={eliminarActual}
            >
              Eliminar este ítem
            </button>
          </div>

          {/* Aviso: no se generó teoría (la IA pudo fallar en esa llamada) */}
          {!(theory && (theory.resumen || theory.secciones?.length > 0)) && (
            <p className="alerta-aviso" style={{ marginTop: '1.5rem' }}>
              No se generaron apuntes de teoría para este tema. Puedes guardar los ítems
              igual y luego generar la teoría con el botón «Generar solo teoría» en la
              pantalla anterior (selecciona el mismo tema y PDF).
            </p>
          )}

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

          {/* Generar más (por nivel Bloom, sin repetir) */}
          <div className="tarjeta" style={{ marginTop: '1.5rem' }}>
            <label className="etiqueta">¿Faltan ítems? Genera más por cada nivel Bloom (sin repetir)</label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ width: '6rem' }}>
                <input
                  type="number"
                  className="campo"
                  min={1}
                  max={5}
                  value={masPorNivel}
                  onChange={(e) => setMasPorNivel(e.target.value)}
                />
              </div>
              <button
                className="btn-secundario"
                style={{ flex: 1 }}
                onClick={handleGenerarMas}
                disabled={generandoMas}
              >
                {generandoMas
                  ? 'Generando...'
                  : `Generar ${(parseInt(masPorNivel, 10) || 2) * 4} ítems más (${parseInt(masPorNivel, 10) || 2} × 4 niveles)`}
              </button>
            </div>
          </div>

          {/* Aviso: el tema está oculto para los alumnos */}
          {unidades.find((u) => u.id === unidadId)?.visible === false && (
            <p className="alerta-aviso" style={{ marginTop: '1.5rem' }}>
              Este tema está <strong>oculto</strong> para los alumnos. Después de guardar,
              actívalo en «Temas» para que aparezca en «Aprender» y en sus sesiones.
            </p>
          )}

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
              <div className="fila-etiqueta-accion">
                <label className="etiqueta">Tema</label>
                {materiaId && !modoNuevoTema && (
                  <button
                    type="button"
                    className="enlace-accion"
                    onClick={() => { setModoNuevoTema(true); setError(''); }}
                  >
                    + Nuevo tema
                  </button>
                )}
              </div>

              {modoNuevoTema ? (
                <div className="fila-nuevo-tema">
                  <input
                    type="text"
                    className="campo"
                    placeholder="Nombre del tema nuevo"
                    value={nuevoTemaNombre}
                    onChange={(e) => setNuevoTemaNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); crearTema(); }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-primario"
                    onClick={crearTema}
                    disabled={creandoTema || !nuevoTemaNombre.trim()}
                  >
                    {creandoTema ? 'Creando...' : 'Crear'}
                  </button>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => { setModoNuevoTema(false); setNuevoTemaNombre(''); }}
                    disabled={creandoTema}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="fila-tema-select">
                  <select
                    className="campo"
                    value={unidadId}
                    onChange={(e) => setUnidadId(e.target.value)}
                    disabled={!materiaId || unidades.length === 0}
                    required
                  >
                    <option value="">
                      {!materiaId
                        ? 'Selecciona una materia primero'
                        : unidades.length === 0
                          ? 'Aún no hay temas — crea uno con «+ Nuevo tema»'
                          : 'Selecciona un tema...'}
                    </option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                  </select>
                  {unidadId && (
                    <button
                      type="button"
                      className="btn-secundario btn-eliminar-tema"
                      onClick={eliminarTema}
                      disabled={borrandoTema}
                      title="Eliminar este tema"
                    >
                      {borrandoTema ? 'Eliminando...' : 'Eliminar tema'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="etiqueta">Ítems por nivel Bloom</label>
              <input
                type="number"
                className="campo"
                min={MIN_POR_NIVEL}
                max={10}
                value={porNivel}
                onChange={(e) => setPorNivel(e.target.value)}
              />
              <p className="nivel-bloom-desc" style={{ marginTop: '0.5rem' }}>
                El sistema genera esta cantidad de preguntas <strong>en cada uno de los 4 niveles
                de Bloom</strong> (total: {(parseInt(porNivel, 10) || MIN_POR_NIVEL) * 4} ítems),
                para que ningún nivel del tema quede con muy pocos ítems. Mínimo {MIN_POR_NIVEL} por nivel.
              </p>
            </div>

            {/* Niveles de Bloom que se generarán */}
            <ul className="lista-niveles-bloom">
              {NIVELES_BLOOM.map((n) => (
                <li key={n.valor}>
                  <BloomBadge nivel={n.valor} />
                  <span>{n.descripcion}</span>
                </li>
              ))}
            </ul>

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

          {/* Recuperación: generar solo la teoría de un tema que ya tiene ítems
              pero quedó sin apuntes para «Aprender». */}
          <div className="bloque-solo-teoria">
            <p className="solo-teoria-texto">
              ¿El tema ya tiene ítems pero no aparece teoría en «Aprender»? Selecciona
              el tema y su PDF, y genera solo los apuntes (no crea ítems nuevos).
            </p>
            <button
              type="button"
              className="btn-secundario btn-ancho"
              onClick={handleGenerarTeoria}
              disabled={generandoTeoria || !archivo || !unidadId}
            >
              {generandoTeoria ? 'Generando teoría...' : 'Generar solo teoría'}
            </button>
          </div>
        </div>

        {(cargando || generandoTeoria) && (
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
