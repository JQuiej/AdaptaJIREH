'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import BloomBadge from '@/components/BloomBadge';
import api from '@/services/api';

// Textarea que crece con su contenido: así el docente lee todo el texto de una
// vez, sin scrollbars internos que aprietan el material.
function AutoTextarea({ value, className = 'campo', minRows = 2, ...props }) {
  const ref = useRef(null);
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => { ajustar(); }, [value, ajustar]);
  return (
    <textarea
      ref={ref}
      className={`${className} teoria-textarea`}
      value={value}
      rows={minRows}
      onInput={ajustar}
      {...props}
    />
  );
}

// Editor del material de estudio (teoría) de un tema: resumen + secciones que el
// docente puede ver, editar, reordenar el contenido, agregar o quitar.
function EditorTema({ tema, onGuardado }) {
  const [resumen,   setResumen]   = useState(tema.resumen ?? '');
  const [secciones, setSecciones] = useState(
    tema.secciones?.length ? tema.secciones.map((s) => ({ ...s })) : []
  );
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error,     setError]     = useState('');
  const [avisoIA,   setAvisoIA]   = useState('');

  const actualizarSeccion = (i, campo, valor) => {
    setSecciones((prev) => prev.map((s, idx) => (idx === i ? { ...s, [campo]: valor } : s)));
  };
  const agregarSeccion = () => setSecciones((prev) => [...prev, { titulo: '', contenido: '' }]);
  const quitarSeccion  = (i) => setSecciones((prev) => prev.filter((_, idx) => idx !== i));
  const moverSeccion   = (i, dir) => {
    setSecciones((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  };

  // Pide a la IA secciones nuevas (distintas de las actuales) y las agrega al
  // final para que el docente las revise antes de guardar.
  const generarConIA = async () => {
    setGenerando(true);
    setError('');
    setAvisoIA('');
    try {
      const { data } = await api.post('/teacher/theory', {
        unitId:    tema.id,
        resumen,
        secciones,
        count:     2,
      });
      const nuevas = Array.isArray(data.secciones) ? data.secciones : [];
      if (nuevas.length) {
        setSecciones((prev) => [...prev, ...nuevas]);
        setAvisoIA(`Se agregaron ${nuevas.length} sección${nuevas.length !== 1 ? 'es' : ''} nueva${nuevas.length !== 1 ? 's' : ''}. Revísalas y guarda.`);
      }
    } catch (e) {
      setError(e.response?.data?.error ?? 'No se pudieron generar secciones. Intenta de nuevo.');
    } finally {
      setGenerando(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const { data } = await api.put('/teacher/theory', {
        unitId:    tema.id,
        resumen,
        secciones,
      });
      onGuardado(tema.id, data.teoria);
    } catch (e) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el material. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="teoria-editor">
      <label className="etiqueta">Resumen del tema</label>
      <AutoTextarea
        minRows={2}
        placeholder="1-2 oraciones que resumen de qué trata el tema..."
        value={resumen}
        onChange={(e) => setResumen(e.target.value)}
        disabled={guardando}
      />

      <div className="teoria-secciones-cab">
        <label className="etiqueta" style={{ margin: 0 }}>
          Secciones ({secciones.length})
        </label>
        <div className="teoria-secciones-acc">
          <button type="button" className="btn-secundario btn-mini" onClick={generarConIA} disabled={guardando || generando}>
            {generando ? 'Generando...' : '✨ Generar con IA'}
          </button>
          <button type="button" className="btn-secundario btn-mini" onClick={agregarSeccion} disabled={guardando || generando}>
            + Agregar sección
          </button>
        </div>
      </div>

      {avisoIA && <p className="teoria-aviso-ia">{avisoIA}</p>}

      {secciones.length === 0 ? (
        <p className="teoria-vacia-hint">
          Este tema aún no tiene secciones de estudio. Agrega una para que los alumnos tengan material que leer.
        </p>
      ) : (
        <div className="teoria-lista-secciones">
          {secciones.map((s, i) => (
            <div key={i} className="teoria-seccion">
              <div className="teoria-seccion-cab">
                <span className="teoria-seccion-num">Sección {i + 1}</span>
                <div className="teoria-seccion-acciones">
                  <button type="button" className="icono-btn" onClick={() => moverSeccion(i, -1)} disabled={guardando || i === 0} aria-label="Subir">↑</button>
                  <button type="button" className="icono-btn" onClick={() => moverSeccion(i, 1)} disabled={guardando || i === secciones.length - 1} aria-label="Bajar">↓</button>
                  <button type="button" className="icono-btn peligro" onClick={() => quitarSeccion(i)} disabled={guardando} aria-label="Quitar">✕</button>
                </div>
              </div>
              <input
                className="campo teoria-titulo-input"
                placeholder="Título de la sección"
                value={s.titulo}
                onChange={(e) => actualizarSeccion(i, 'titulo', e.target.value)}
                disabled={guardando}
              />
              <AutoTextarea
                minRows={3}
                placeholder="Explicación / contenido de la sección..."
                value={s.contenido}
                onChange={(e) => actualizarSeccion(i, 'contenido', e.target.value)}
                disabled={guardando}
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="alerta-error" style={{ marginTop: '0.75rem' }}>{error}</p>}

      <div className="teoria-editor-botones">
        <button type="button" className="btn-primario" onClick={guardar} disabled={guardando || generando}>
          {guardando ? 'Guardando...' : 'Guardar material'}
        </button>
      </div>
    </div>
  );
}

function ContenidoTeoria() {
  useAuthGuard('docente');
  const router = useRouter();
  const params = useSearchParams();

  const [materias,  setMaterias]  = useState([]);
  const [materiaId, setMateriaId] = useState(params.get('subjectId') ?? '');
  const [temas,     setTemas]     = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [error,     setError]     = useState('');
  const [abierto,   setAbierto]   = useState(null); // id del tema expandido
  const [aviso,     setAviso]     = useState('');

  useEffect(() => {
    api.get('/material/subjects').then((r) => {
      setMaterias(r.data);
      if (!materiaId && r.data[0]) setMateriaId(r.data[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    if (!materiaId) { setTemas([]); return; }
    setCargando(true);
    try {
      const { data } = await api.get(`/teacher/theory?subjectId=${materiaId}`);
      setTemas(data);
      setError('');
    } catch {
      setError('No se pudo cargar el material de estudio.');
    } finally {
      setCargando(false);
    }
  }, [materiaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const alGuardado = useCallback((unitId, teoria) => {
    setTemas((prev) => prev.map((t) => (t.id === unitId ? { ...t, ...teoria } : t)));
    setAviso('Material de estudio guardado.');
    setTimeout(() => setAviso(''), 4000);
  }, []);

  const conMaterial = temas.filter((t) => t.tieneTeoria).length;

  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Material de estudio</span>
      </header>

      <main style={{ maxWidth: '46rem', margin: '0 auto', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--gris-500)', margin: 0 }}>
          Revisa y edita los apuntes que estudian los alumnos en cada tema. Puedes
          corregir el texto, reordenar, <strong>agregar secciones</strong> que falten o
          crear el material desde cero donde no exista.
        </p>

        <div className="filtro-campo" style={{ maxWidth: '18rem' }}>
          <label className="etiqueta">Materia</label>
          <select className="campo" value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setAbierto(null); }}>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>

        {error && <p className="alerta-error">{error}</p>}

        {cargando ? (
          <div className="tarjeta-vacia">Cargando material...</div>
        ) : temas.length === 0 ? (
          <div className="tarjeta-vacia">Esta materia aún no tiene temas.</div>
        ) : (
          <>
            <p style={{ fontSize: '0.8125rem', color: 'var(--gris-400)', margin: 0 }}>
              {conMaterial} de {temas.length} temas con material de estudio
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {temas.map((t) => {
                const expandido = abierto === t.id;
                return (
                  <div key={t.id} className="tarjeta teoria-fila">
                    <button
                      type="button"
                      className="teoria-fila-cab"
                      onClick={() => setAbierto(expandido ? null : t.id)}
                      aria-expanded={expandido}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p className="tema-vis-nombre">{t.nombre}</p>
                        <p className="tema-vis-meta">
                          <BloomBadge nivel={t.nivel_bloom} />
                          {' '}
                          {t.tieneTeoria
                            ? `${t.secciones.length} sección${t.secciones.length !== 1 ? 'es' : ''}`
                            : <span className="tema-vis-estado oculto">Sin material</span>}
                        </p>
                      </div>
                      <span className={`teoria-chevron ${expandido ? 'abierto' : ''}`}>▾</span>
                    </button>

                    {expandido && (
                      <EditorTema key={`${t.id}-${t.tieneTeoria}`} tema={t} onGuardado={alGuardado} />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {aviso && <div className="toast-exito">{aviso}</div>}
    </div>
  );
}

export default function PaginaTeoria() {
  return (
    <Suspense fallback={
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando...</p>
      </div>
    }>
      <ContenidoTeoria />
    </Suspense>
  );
}
