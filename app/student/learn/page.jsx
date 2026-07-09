'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import api from '@/services/api';

// Construye el mazo de flashcards de un tema: una carta de resumen (si existe)
// seguida de una carta por cada sección (frente = título, dorso = contenido).
function construirCartas(tema) {
  const cartas = [];
  if (tema.resumen) {
    cartas.push({ tipo: 'resumen', titulo: 'Resumen del tema', texto: tema.resumen });
  }
  for (const s of tema.secciones ?? []) {
    if (s?.titulo || s?.contenido) {
      cartas.push({ tipo: 'seccion', titulo: s.titulo ?? 'Concepto', texto: s.contenido ?? '' });
    }
  }
  if (cartas.length === 0) {
    cartas.push({ tipo: 'resumen', titulo: tema.unidad, texto: tema.resumen || 'Sin contenido disponible.' });
  }
  return cartas;
}

// Convierte **negritas** del texto en <strong>.
function conNegritas(texto) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith('**') && parte.endsWith('**')
      ? <strong key={i}>{parte.slice(2, -2)}</strong>
      : <span key={i}>{parte}</span>
  );
}

// Renderiza el contenido de teoría de forma legible: separa párrafos y
// convierte listas numeradas "1. ... 2. ..." en una lista ordenada real.
function TextoEnriquecido({ texto }) {
  if (!texto) return null;

  const bloques = texto.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const elementos = [];

  bloques.forEach((bloque, bi) => {
    const marcadores = bloque.match(/\d+\.\s/g);

    // Lista numerada embebida (al menos dos ítems "N. ").
    if (marcadores && marcadores.length >= 2) {
      const idx   = bloque.search(/\d+\.\s/);
      const intro = bloque.slice(0, idx).trim();
      const resto = bloque.slice(idx);

      if (intro) {
        elementos.push(
          <p key={`p${bi}`} className="rich-parrafo">{conNegritas(intro)}</p>
        );
      }

      const items = resto.split(/(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean);
      elementos.push(
        <ol key={`ol${bi}`} className="rich-lista">
          {items.map((it, ii) => (
            <li key={ii}>{conNegritas(it.replace(/^\d+\.\s/, ''))}</li>
          ))}
        </ol>
      );
    } else {
      elementos.push(
        <p key={`p${bi}`} className="rich-parrafo">{conNegritas(bloque)}</p>
      );
    }
  });

  return <>{elementos}</>;
}

// Emblema decorativo del frente (icono de tarjetas de estudio).
function IconoEstudio() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M7 5V3.5A1.5 1.5 0 0 1 8.5 2H19a2 2 0 0 1 2 2v11a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path d="M7 10h6M7 13.5h4" />
    </svg>
  );
}

export default function PaginaAprender() {
  const { user } = useAuthGuard('estudiante');
  const router   = useRouter();

  const [materias, setMaterias] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Modo de estudio (flashcards)
  const [temaActivo, setTemaActivo] = useState(null);
  const [idxCarta,   setIdxCarta]   = useState(0);
  const [volteada,   setVolteada]   = useState(false);
  // Contenedor del texto del dorso: se reinicia su scroll al cambiar de carta
  // para que la nueva empiece desde arriba (antes conservaba el scroll anterior).
  const textoRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/student/learn');
      setMaterias(data);
    } catch { /* interceptor maneja 401 */ }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cartas = useMemo(
    () => (temaActivo ? construirCartas(temaActivo) : []),
    [temaActivo]
  );

  // Al cambiar de carta, llevar el scroll del texto al inicio.
  useEffect(() => {
    if (textoRef.current) textoRef.current.scrollTop = 0;
  }, [idxCarta]);

  function abrirTema(tema) {
    setTemaActivo(tema);
    setIdxCarta(0);
    setVolteada(false);
  }

  function cerrarTema() {
    setTemaActivo(null);
    setIdxCarta(0);
    setVolteada(false);
  }

  function irA(nuevoIdx) {
    // Siempre mostrar el frente al cambiar de carta.
    setVolteada(false);
    setIdxCarta(Math.max(0, Math.min(cartas.length - 1, nuevoIdx)));
  }

  if (!user) return null;

  const hayTemas = materias.some((m) => m.temas.length > 0);

  // ════════════════════════════════════════════════════════════
  // MODO ESTUDIO: flashcards de un tema
  // ════════════════════════════════════════════════════════════
  if (temaActivo) {
    const carta       = cartas[idxCarta];
    const pctProgreso = Math.round(((idxCarta + 1) / cartas.length) * 100);
    const esUltima    = idxCarta === cartas.length - 1;

    return (
      <div className="pagina">
        <header className="encabezado">
          <button onClick={cerrarTema} className="enlace-volver">
            Volver a temas
          </button>
          <div className="encabezado-repaso-info">
            <span className="nombre-materia-header">{temaActivo.unidad}</span>
            <span className="contador-posicion">{idxCarta + 1} / {cartas.length}</span>
          </div>
        </header>

        <div className="barra-sesion-fondo">
          <div className="barra-sesion-relleno" style={{ width: `${pctProgreso}%` }} />
        </div>

        <main className="contenido-aprender-estudio">
          <button
            type="button"
            className={`carta-estudio ${volteada ? 'volteada' : ''}`}
            onClick={() => setVolteada((v) => !v)}
            aria-label={volteada ? 'Ver concepto' : 'Revelar contenido'}
          >
            <div className="carta-estudio-interior">
              {/* Frente: el concepto / título */}
              <div className="carta-cara carta-frente">
                <span className="carta-emblema"><IconoEstudio /></span>
                <span className="carta-tipo">
                  {carta.tipo === 'resumen' ? 'Resumen' : 'Concepto'}
                </span>
                <p className="carta-titulo-estudio">{carta.titulo}</p>
                <span className="carta-pista">↻ Toca para leer</span>
              </div>

              {/* Dorso: el contenido */}
              <div className="carta-cara carta-dorso">
                <p className="carta-dorso-titulo">{carta.titulo}</p>
                <div className="carta-texto-estudio" ref={textoRef}>
                  <TextoEnriquecido texto={carta.texto} />
                </div>
              </div>
            </div>
          </button>

          {/* Navegación entre cartas */}
          <div className="aprender-nav">
            <button
              className="btn-secundario"
              onClick={() => irA(idxCarta - 1)}
              disabled={idxCarta === 0}
            >
              ← Anterior
            </button>
            {esUltima ? (
              <button className="btn-primario" onClick={cerrarTema}>
                Terminar
              </button>
            ) : (
              <button className="btn-primario" onClick={() => irA(idxCarta + 1)}>
                Siguiente →
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // MODO LISTA: explorar temas ordenados (básico → complejo)
  // ════════════════════════════════════════════════════════════
  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/student')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Aprender</span>
      </header>

      <main className="contenido" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--gris-500)' }}>
          Estudia la teoría con tarjetas, a tu ritmo. Los temas están ordenados de lo
          más básico a lo más complejo. Toca una tarjeta para revelar su contenido.
        </p>

        {cargando ? (
          <div className="esqueleto-tarjeta" />
        ) : !hayTemas ? (
          <div className="tarjeta-vacia">
            Aún no hay teoría disponible. Tu docente la publicará al subir material.
          </div>
        ) : (
          materias.filter((m) => m.temas.length > 0).map((m) => (
            <section key={m.id}>
              <p className="titulo-seccion">{m.nombre}</p>
              <div className="aprender-lista-temas">
                {m.temas.map((t, i) => {
                  const numCartas = construirCartas(t).length;
                  return (
                    <button
                      key={t.id}
                      className="tarjeta tarjeta-tema-estudio"
                      onClick={() => abrirTema(t)}
                    >
                      <span className="tema-orden">{i + 1}</span>
                      <div className="tema-estudio-cuerpo">
                        <div className="tema-estudio-cabecera">
                          <p className="tema-titulo">{t.unidad}</p>
                        </div>
                        {t.resumen && <p className="tema-resumen">{t.resumen}</p>}
                        <span className="tema-estudio-meta">
                          {numCartas} tarjeta{numCartas !== 1 ? 's' : ''} · Estudiar →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
