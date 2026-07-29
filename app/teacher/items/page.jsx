'use client';
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import BloomBadge from '@/components/BloomBadge';
import api from '@/services/api';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const nivelLogro = (v) => (v == null ? 'nulo' : v >= 0.7 ? 'alto' : v >= 0.4 ? 'medio' : 'bajo');

// Nota que el SISTEMA le dio a una respuesta, tal como la vio el estudiante.
// Si hay grade_score (respuestas desde la migración 022) se muestra el % exacto;
// si no, se reconstruye la BANDA desde rating_frs (mismos cortes de pantalla).
function notaDe(r) {
  if (r.gradeScore != null) {
    const clave = r.gradeScore >= 0.71 ? 'alto' : r.gradeScore >= 0.41 ? 'medio' : 'bajo';
    return { texto: `${Math.round(r.gradeScore * 100)}%`, clave };
  }
  if (r.ratingFrs === 3) return { texto: 'Alto',  clave: 'alto'  };
  if (r.ratingFrs === 2) return { texto: 'Medio', clave: 'medio' };
  if (r.ratingFrs == null) return { texto: '—', clave: 'nulo' };
  return { texto: 'Bajo', clave: 'bajo' };
}

const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-GT', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

function KPI({ etiqueta, valor, sub }) {
  return (
    <div className="bloque-kpi">
      <p className="kpi-valor">{valor}</p>
      <p className="kpi-etiqueta">{etiqueta}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
}

// Tarjeta tipo flashcard: se voltea al tocarla (frente = pregunta, reverso =
// respuesta de referencia + pista + estadísticas detalladas).
function TarjetaItem({ item, onRegenerar, onVerRespuestas }) {
  const [volteada, setVolteada] = useState(false);
  const logro = nivelLogro(item.precision);
  const sinDatos = item.totalRespuestas === 0;

  return (
    <div
      className={`flip-card ${volteada ? 'volteada' : ''}`}
      onClick={() => setVolteada((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVolteada((v) => !v); } }}
    >
      <div className="flip-card-inner">
        {/* Frente: pregunta */}
        <div className="flip-card-cara flip-card-front">
          <div className="flip-top">
            <BloomBadge nivel={item.nivel_bloom} />
            {!item.activo && <span className="flip-inactivo">inactivo</span>}
          </div>
          <p className="flip-tema">{item.unidad}</p>
          <p className="flip-pregunta">{item.pregunta}</p>
          <div className="flip-stats">
            {sinDatos ? (
              <span className="stat-pill nulo">Sin respuestas aún</span>
            ) : (
              <>
                <span className={`stat-pill ${logro}`}>{pct(item.precision)} aciertos</span>
                <span className="stat-mini">{item.totalRespuestas} resp · {item.estudiantes} alumnos</span>
              </>
            )}
          </div>
          <div className="flip-acciones">
            <button
              type="button"
              className="btn-regenerar"
              onClick={(e) => { e.stopPropagation(); onVerRespuestas(item); }}
              disabled={sinDatos}
              title={sinDatos ? 'Este ítem aún no tiene respuestas' : 'Ver las respuestas de los estudiantes'}
            >
              💬 Respuestas{item.totalRespuestas ? ` (${item.totalRespuestas})` : ''}
            </button>
            <button
              type="button"
              className="btn-regenerar"
              onClick={(e) => { e.stopPropagation(); onRegenerar(item); }}
            >
              ↻ Regenerar
            </button>
            <span className="flip-hint">Toca para ver la respuesta →</span>
          </div>
        </div>

        {/* Reverso: respuesta + estadísticas */}
        <div className="flip-card-cara flip-card-back">
          <p className="flip-label">Respuesta de referencia</p>
          <p className="flip-respuesta">{item.respuesta_ref}</p>
          {item.pista && (
            <>
              <p className="flip-label">Pista</p>
              <p className="flip-pista">{item.pista}</p>
            </>
          )}
          <div className="flip-stats-detalle">
            <div><strong className={`logro-${logro}`}>{pct(item.precision)}</strong><span>aciertos</span></div>
            <div><strong>{item.sst != null ? item.sst.toFixed(2) : '—'}</strong><span>SST</span></div>
            <div><strong>{item.rating != null ? item.rating.toFixed(1) : '—'}</strong><span>rating /4</span></div>
            <div><strong>{item.tiempoMs != null ? `${Math.round(item.tiempoMs / 1000)}s` : '—'}</strong><span>tiempo</span></div>
          </div>
          <span className="flip-hint">← Toca para volver</span>
        </div>
      </div>
    </div>
  );
}

// Modal para regenerar un ítem: el docente indica cómo quiere cambiarlo antes
// de que la IA lo reescriba (mismo nivel Bloom, distinto contenido).
function ModalRegenerar({ item, onCerrar, onRegenerado }) {
  const [ajuste,      setAjuste]      = useState('similar');
  const [instruccion, setInstruccion] = useState('');
  const [generando,   setGenerando]   = useState(false);
  const [error,       setError]       = useState('');

  const confirmar = async () => {
    setGenerando(true);
    setError('');
    try {
      const { data } = await api.post('/teacher/items/regenerate', {
        itemId: item.id,
        ajuste,
        instruccion: instruccion.trim(),
      });
      onRegenerado(data.item);
    } catch (e) {
      setError(e.response?.data?.error ?? 'No se pudo regenerar el ítem. Intenta de nuevo.');
      setGenerando(false);
    }
  };

  const opciones = [
    { valor: 'facil',   titulo: 'Muy difícil',      desc: 'Hazla más fácil y sencilla (mismo nivel).' },
    { valor: 'dificil', titulo: 'Muy fácil',        desc: 'Hazla un poco más exigente (mismo nivel).' },
    { valor: 'similar', titulo: 'Solo cámbiala',    desc: 'Otra pregunta con dificultad parecida.' },
  ];

  return (
    <div className="regen-overlay" onClick={generando ? undefined : onCerrar}>
      <div className="regen-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="regen-titulo">Regenerar ítem</h3>
        <p className="regen-sub">
          <BloomBadge nivel={item.nivel_bloom} /> La nueva pregunta mantendrá este nivel.
        </p>
        <p className="regen-pregunta-actual">{item.pregunta}</p>

        <label className="etiqueta">¿Cómo quieres cambiarla?</label>
        <div className="regen-opciones">
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              className={`regen-opcion ${ajuste === o.valor ? 'activa' : ''}`}
              onClick={() => setAjuste(o.valor)}
              disabled={generando}
            >
              <strong>{o.titulo}</strong>
              <span>{o.desc}</span>
            </button>
          ))}
        </div>

        <label className="etiqueta" style={{ marginTop: '0.75rem' }}>
          Indicación adicional (opcional)
        </label>
        <textarea
          className="campo"
          rows={2}
          placeholder="Ej. enfócala en vocabulario de la familia, usa un ejemplo cotidiano..."
          value={instruccion}
          onChange={(e) => setInstruccion(e.target.value)}
          disabled={generando}
        />

        {error && <p className="alerta-error" style={{ marginTop: '0.75rem' }}>{error}</p>}

        <div className="regen-botones">
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={generando}>
            Cancelar
          </button>
          <button type="button" className="btn-primario" onClick={confirmar} disabled={generando}>
            {generando ? 'Generando...' : 'Regenerar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para crear ítems NUEVOS en un tema (cuando quedan pocos y los alumnos
// ya avanzaron). Genera `perLevel` ítems por cada nivel Bloom usando el material
// de estudio del tema como contexto, sin repetir los existentes.
function ModalCrearItems({ materias, materiaInicial, onCerrar, onCreado }) {
  const [materiaId, setMateriaId] = useState(materiaInicial || (materias[0]?.id ?? ''));
  const [temas,     setTemas]     = useState([]);
  const [temaId,    setTemaId]    = useState('');
  const [perLevel,  setPerLevel]  = useState(2);
  const [cargTemas, setCargTemas] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (!materiaId) { setTemas([]); setTemaId(''); return; }
    setCargTemas(true);
    api.get(`/material/units?subjectId=${materiaId}`)
      .then((r) => { setTemas(r.data); setTemaId(r.data[0]?.id ?? ''); })
      .catch(() => { setTemas([]); setTemaId(''); })
      .finally(() => setCargTemas(false));
  }, [materiaId]);

  const crear = async () => {
    if (!temaId) { setError('Selecciona un tema.'); return; }
    setGenerando(true);
    setError('');
    try {
      const { data } = await api.post('/teacher/items/generate', { unitId: temaId, perLevel });
      onCreado(data.count ?? 0, materiaId);
    } catch (e) {
      setError(e.response?.data?.error ?? 'No se pudieron crear los ítems. Intenta de nuevo.');
      setGenerando(false);
    }
  };

  return (
    <div className="regen-overlay" onClick={generando ? undefined : onCerrar}>
      <div className="regen-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="regen-titulo">Crear más ítems</h3>
        <p className="regen-sub">
          Genera preguntas nuevas para un tema (una tanda por cada nivel Bloom), sin repetir las que ya existen.
        </p>

        <label className="etiqueta">Materia</label>
        <select className="campo" value={materiaId} onChange={(e) => setMateriaId(e.target.value)} disabled={generando}>
          {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>

        <label className="etiqueta" style={{ marginTop: '0.75rem' }}>Tema</label>
        <select className="campo" value={temaId} onChange={(e) => setTemaId(e.target.value)} disabled={generando || cargTemas}>
          {cargTemas
            ? <option>Cargando temas...</option>
            : temas.length === 0
              ? <option value="">Esta materia no tiene temas</option>
              : temas.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre} ({t.items} ítem{t.items !== 1 ? 's' : ''})</option>
                ))}
        </select>

        <label className="etiqueta" style={{ marginTop: '0.75rem' }}>Ítems por nivel Bloom</label>
        <select className="campo" style={{ width: '8rem' }} value={perLevel} onChange={(e) => setPerLevel(Number(e.target.value))} disabled={generando}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <p className="kpi-sub" style={{ margin: '0.375rem 0 0' }}>
          Se crearán {perLevel * 4} ítems en total (4 niveles × {perLevel}).
        </p>

        {error && <p className="alerta-error" style={{ marginTop: '0.75rem' }}>{error}</p>}

        <div className="regen-botones">
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={generando}>
            Cancelar
          </button>
          <button type="button" className="btn-primario" onClick={crear} disabled={generando || !temaId}>
            {generando ? 'Generando...' : 'Crear ítems'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal «Respuestas»: lista los estudiantes que respondieron el ítem y, al
// seleccionar uno, despliega TODAS sus respuestas a esa pregunta con la nota
// que el sistema le dio a cada una.
function ModalRespuestas({ item, onCerrar }) {
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState('');
  const [respuestas, setRespuestas] = useState([]);
  const [selId,      setSelId]      = useState(null);

  useEffect(() => {
    let vivo = true;
    api.get(`/teacher/items/responses?itemId=${item.id}`)
      .then((r) => { if (vivo) setRespuestas(r.data); })
      .catch(() => { if (vivo) setError('No se pudieron cargar las respuestas. Intenta de nuevo.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [item.id]);

  // Agrupar las respuestas por estudiante (ordenadas por código anónimo).
  const estudiantes = useMemo(() => {
    const mapa = new Map();
    for (const r of respuestas) {
      if (!mapa.has(r.estudianteId)) {
        mapa.set(r.estudianteId, { id: r.estudianteId, codigo: r.codigoAnonimo, grado: r.grado, respuestas: [] });
      }
      mapa.get(r.estudianteId).respuestas.push(r);
    }
    return [...mapa.values()].sort((a, b) => (a.codigo ?? '').localeCompare(b.codigo ?? ''));
  }, [respuestas]);

  // Autoselecciona el primer estudiante al cargar.
  useEffect(() => {
    if (selId == null && estudiantes.length) setSelId(estudiantes[0].id);
  }, [estudiantes, selId]);

  const sel = estudiantes.find((e) => e.id === selId) ?? null;

  return (
    <div className="regen-overlay" onClick={onCerrar}>
      <div
        className="regen-modal"
        style={{ maxWidth: '820px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="regen-titulo">Respuestas de los estudiantes</h3>
        <p className="regen-pregunta-actual">{item.pregunta}</p>

        {cargando ? (
          <div className="tarjeta-vacia">Cargando respuestas...</div>
        ) : error ? (
          <p className="alerta-error">{error}</p>
        ) : estudiantes.length === 0 ? (
          <div className="tarjeta-vacia">Este ítem aún no tiene respuestas.</div>
        ) : (
          <div className="resp-layout">
            {/* Lista de estudiantes */}
            <div className="resp-lista">
              {estudiantes.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`resp-estudiante ${e.id === selId ? 'activo' : ''}`}
                  onClick={() => setSelId(e.id)}
                >
                  <span className="resp-estudiante-codigo">{e.codigo}</span>
                  <span className="resp-estudiante-meta">
                    {e.respuestas.length} resp{e.respuestas.length !== 1 ? '.' : ''}
                  </span>
                </button>
              ))}
            </div>

            {/* Respuestas del estudiante seleccionado */}
            <div className="resp-detalle">
              {sel && (
                <>
                  <p className="resp-detalle-titulo">
                    {sel.codigo}{sel.grado ? ` · ${sel.grado}` : ''} — {sel.respuestas.length} respuesta{sel.respuestas.length !== 1 ? 's' : ''}
                  </p>
                  {sel.respuestas.map((r) => {
                    const nota = notaDe(r);
                    return (
                      <div key={r.id} className="resp-item">
                        <div className="resp-item-cabecera">
                          <span className={`stat-pill ${nota.clave}`}>{nota.texto}</span>
                          <span className="resp-item-fecha">{fechaHora(r.fecha)}</span>
                        </div>
                        <p className="resp-item-texto">{r.texto || <em>(respuesta vacía)</em>}</p>
                        <div className="resp-item-extra">
                          {r.usoPista && <span>Usó pista</span>}
                          {r.tiempoMs != null && <span>{Math.round(r.tiempoMs / 1000)}s</span>}
                          {r.sst != null && <span>SST {Math.round(r.sst * 100)}%</span>}
                        </div>
                        {r.retro ? (
                          <details className="resp-retro">
                            <summary>Ver retroalimentación</summary>
                            {r.retro.diagnostico && (
                              <div className="resp-retro-parte">
                                <span className="resp-retro-titulo">Qué pasó</span>
                                <p>{r.retro.diagnostico}</p>
                              </div>
                            )}
                            {r.retro.explicacion && (
                              <div className="resp-retro-parte">
                                <span className="resp-retro-titulo">Punto de mejora</span>
                                <p>{r.retro.explicacion}</p>
                              </div>
                            )}
                            {r.retro.ejemplo && (
                              <div className="resp-retro-parte">
                                <span className="resp-retro-titulo">Ejemplo</span>
                                <p>{r.retro.ejemplo}</p>
                              </div>
                            )}
                          </details>
                        ) : (
                          <p className="resp-sin-retro">Sin retroalimentación</p>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        <div className="regen-botones">
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function ContenidoItems() {
  useAuthGuard('docente');
  const router = useRouter();
  const params = useSearchParams();

  const [materias,  setMaterias]  = useState([]);
  const [materiaId, setMateriaId] = useState(params.get('subjectId') ?? '');
  const [items,     setItems]     = useState([]);
  const [busqueda,  setBusqueda]  = useState('');
  const [bloomFilt, setBloomFilt] = useState(''); // '' | '1'..'4'
  const [temaFilt,  setTemaFilt]  = useState(''); // '' | unidadId
  const [cargando,  setCargando]  = useState(true);
  const [regenItem, setRegenItem] = useState(null); // ítem en modal de regeneración
  const [verResp,   setVerResp]   = useState(null); // ítem en modal de respuestas
  const [crearOpen, setCrearOpen] = useState(false); // modal de crear ítems nuevos
  const [aviso,     setAviso]     = useState('');   // confirmación tras regenerar

  // Reemplaza en la lista el ítem regenerado con su nuevo contenido.
  const alRegenerar = useCallback((nuevo) => {
    setItems((prev) => prev.map((it) => (it.id === nuevo.id ? { ...it, ...nuevo } : it)));
    setRegenItem(null);
    setAviso('Ítem regenerado correctamente.');
    setTimeout(() => setAviso(''), 4000);
  }, []);

  useEffect(() => {
    api.get('/material/subjects').then((r) => setMaterias(r.data)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = materiaId ? `?subjectId=${materiaId}` : '';
      const { data } = await api.get(`/teacher/items${q}`);
      setItems(data);
    } catch { setItems([]); }
    finally { setCargando(false); }
  }, [materiaId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Tras crear ítems nuevos: cierra el modal, avisa y recarga la lista (ajusta
  // el filtro de materia si se crearon en otra distinta a la mostrada).
  const alCrear = useCallback((count, materiaUsada) => {
    setCrearOpen(false);
    setAviso(`${count} ítem${count !== 1 ? 's' : ''} nuevo${count !== 1 ? 's' : ''} creado${count !== 1 ? 's' : ''}.`);
    setTimeout(() => setAviso(''), 4000);
    if (materiaUsada && materiaUsada !== materiaId) {
      setTemaFilt('');
      setMateriaId(materiaUsada);
    } else {
      cargar();
    }
  }, [materiaId, cargar]);

  // Temas disponibles (únicos) según los ítems cargados de la materia actual.
  const temas = useMemo(() => {
    const mapa = new Map();
    for (const it of items) {
      if (it.unidadId && !mapa.has(it.unidadId)) mapa.set(it.unidadId, it.unidad);
    }
    return [...mapa.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  }, [items]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return items.filter((it) => {
      if (temaFilt && it.unidadId !== temaFilt) return false;
      if (bloomFilt && String(it.nivel_bloom) !== bloomFilt) return false;
      if (texto && !(`${it.pregunta} ${it.respuesta_ref} ${it.unidad}`.toLowerCase().includes(texto))) return false;
      return true;
    });
  }, [items, busqueda, bloomFilt, temaFilt]);

  // Resumen: aciertos global ponderado por número de respuestas.
  const resumen = useMemo(() => {
    let respuestas = 0, aciertosPond = 0, conDatos = 0;
    for (const it of items) {
      if (it.totalRespuestas > 0 && it.precision != null) {
        respuestas += it.totalRespuestas;
        aciertosPond += it.precision * it.totalRespuestas;
        conDatos += 1;
      }
    }
    return {
      totalItems: items.length,
      conDatos,
      respuestas,
      aciertos: respuestas > 0 ? aciertosPond / respuestas : null,
    };
  }, [items]);

  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Mis ítems</span>
        <button onClick={() => setCrearOpen(true)} className="btn-primario" style={{ marginLeft: 'auto' }}>
          + Crear más ítems
        </button>
      </header>

      <main className="contenido-ancho" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Filtros */}
        <div className="filtros-fila">
          <div className="filtro-campo">
            <label className="etiqueta">Materia</label>
            <select className="campo campo-angosto" value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setTemaFilt(''); }}>
              <option value="">Todas las materias</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div className="filtro-campo">
            <label className="etiqueta">Tema</label>
            <select className="campo" style={{ width: '13rem' }} value={temaFilt} onChange={(e) => setTemaFilt(e.target.value)}>
              <option value="">Todos los temas</option>
              {temas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <div className="filtro-campo">
            <label className="etiqueta">Nivel Bloom</label>
            <select className="campo" style={{ width: '11rem' }} value={bloomFilt} onChange={(e) => setBloomFilt(e.target.value)}>
              <option value="">Todos</option>
              <option value="1">Bloom 1 — Recordar / Comprender</option>
              <option value="2">Bloom 2 — Aplicar / Analizar</option>
              <option value="3">Bloom 3 — Evaluar</option>
              <option value="4">Bloom 4 — Crear</option>
            </select>
          </div>
          <div className="filtro-campo" style={{ flex: 1, minWidth: '12rem' }}>
            <label className="etiqueta">Buscar</label>
            <input
              className="campo"
              placeholder="Buscar en preguntas, respuestas o temas..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* Resumen */}
        <div className="cuadricula-kpis-4">
          <KPI etiqueta="Ítems creados" valor={resumen.totalItems} />
          <KPI etiqueta="Con respuestas" valor={resumen.conDatos} sub={`${resumen.totalItems - resumen.conDatos} sin actividad`} />
          <KPI etiqueta="Aciertos global" valor={pct(resumen.aciertos)} sub="ponderado por respuestas" />
          <KPI etiqueta="Respuestas totales" valor={resumen.respuestas} />
        </div>

        {/* Flashcards */}
        {cargando ? (
          <div className="tarjeta-vacia">Cargando ítems...</div>
        ) : filtrados.length === 0 ? (
          <div className="tarjeta-vacia">
            {items.length === 0
              ? 'Aún no has creado ítems. Sube material desde «Subir material».'
              : 'Ningún ítem coincide con los filtros.'}
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.8125rem', color: 'var(--gris-400)', margin: 0 }}>
              Mostrando {filtrados.length} de {items.length} ítems · toca una tarjeta para voltearla
            </p>
            <div className="grid-flashcards">
              {filtrados.map((it) => (
                <TarjetaItem key={it.id} item={it} onRegenerar={setRegenItem} onVerRespuestas={setVerResp} />
              ))}
            </div>
          </>
        )}
      </main>

      {aviso && <div className="toast-exito">{aviso}</div>}

      {regenItem && (
        <ModalRegenerar
          item={regenItem}
          onCerrar={() => setRegenItem(null)}
          onRegenerado={alRegenerar}
        />
      )}

      {verResp && (
        <ModalRespuestas item={verResp} onCerrar={() => setVerResp(null)} />
      )}

      {crearOpen && (
        <ModalCrearItems
          materias={materias}
          materiaInicial={materiaId}
          onCerrar={() => setCrearOpen(false)}
          onCreado={alCrear}
        />
      )}
    </div>
  );
}

export default function PaginaItems() {
  return (
    <Suspense fallback={
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando...</p>
      </div>
    }>
      <ContenidoItems />
    </Suspense>
  );
}
