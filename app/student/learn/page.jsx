'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import api from '@/services/api';

export default function PaginaAprender() {
  const { user } = useAuthGuard('estudiante');
  const router   = useRouter();

  const [materias, setMaterias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto,  setAbierto]  = useState(null); // id del tema expandido

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/student/learn');
      setMaterias(data);
    } catch { /* interceptor maneja 401 */ }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (!user) return null;

  const hayTemas = materias.some((m) => m.temas.length > 0);

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
          Repasa la teoría de tus materias a tu ritmo. Ideal para los días con pocos
          repasos pendientes.
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {m.temas.map((t) => {
                  const exp = abierto === t.id;
                  return (
                    <div key={t.id} className="tarjeta tarjeta-tema">
                      <button
                        className="tema-cabecera"
                        onClick={() => setAbierto(exp ? null : t.id)}
                      >
                        <div>
                          <p className="tema-titulo">{t.unidad}</p>
                          {t.resumen && <p className="tema-resumen">{t.resumen}</p>}
                        </div>
                        <span className="tema-flecha">{exp ? '−' : '+'}</span>
                      </button>

                      {exp && (
                        <div className="tema-contenido">
                          {t.secciones.length === 0 ? (
                            <p className="tema-seccion-texto">{t.resumen}</p>
                          ) : (
                            t.secciones.map((s, i) => (
                              <div key={i} className="tema-seccion">
                                <p className="tema-seccion-titulo">{s.titulo}</p>
                                <p className="tema-seccion-texto">{s.contenido}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
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
