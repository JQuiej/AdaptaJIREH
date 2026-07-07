'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuthStore } from '@/store/authStore';
import { useSessionStore } from '@/store/sessionStore';
import OfflineBanner from '@/components/OfflineBanner';
import ForecastCalendar from '@/components/ForecastCalendar';
import PanelRacha from '@/components/PanelRacha';
import Brand from '@/components/Brand';
import api from '@/services/api';

// Icono minimalista de estudio (libro abierto de trazo simple).
function IconoAprender() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      <path d="M12 6.5C10.5 5.2 8.5 4.5 6 4.5H3.5v13H6c2.5 0 4.5.7 6 2 1.5-1.3 3.5-2 6-2h2.5v-13H18c-2.5 0-4.5.7-6 2Z" />
      <path d="M12 6.5v12" />
    </svg>
  );
}

function InsigniaRetencion({ pct }) {
  const clase = pct >= 70 ? 'retencion-alta' : pct >= 40 ? 'retencion-media' : 'retencion-baja';
  return (
    <span className={`insignia-retencion ${clase}`}>R(t) = {pct}%</span>
  );
}

export default function PanelEstudiante() {
  const { user }         = useAuthGuard('estudiante');
  const { clearAuth }    = useAuthStore();
  const { setSessionId } = useSessionStore();
  const router           = useRouter();

  const [materias,  setMaterias]  = useState([]);
  const [pronostico, setPronostico] = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [iniciando, setIniciando] = useState(null);
  const [dato,      setDato]      = useState(null); // dato curioso diario

  const cargar = useCallback(async () => {
    try {
      const [matRes, foreRes] = await Promise.all([
        api.get('/student/subjects'),
        api.get('/student/forecast'),
      ]);
      setMaterias(matRes.data);
      setPronostico(foreRes.data);
    } catch { /* el interceptor maneja 401 */ }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Dato curioso del día (solo la primera vez que entra). No bloquea el panel.
  // Al mostrarlo se marca como visto en el servidor (POST), de forma que si la
  // respuesta nunca llegara a mostrarse, el dato no se pierde.
  useEffect(() => {
    api.get('/student/daily-fact')
      .then((r) => {
        if (r.data?.fact?.texto) {
          setDato(r.data.fact);
          api.post('/student/daily-fact').catch(() => {}); // marcar visto (fire-and-forget)
        }
      })
      .catch(() => {});
  }, []);

  async function iniciarSesion(materiaId) {
    setIniciando(materiaId);
    try {
      const { data } = await api.post('/fsrs/session/start', { subjectId: materiaId });
      setSessionId(data.sessionId);
      router.push(`/student/review?subjectId=${materiaId}`);
    } catch { setIniciando(null); }
  }

  async function cerrarSesion() {
    await api.post('/auth/logout').catch(() => {});
    clearAuth();
    router.push('/login');
  }

  if (!user) return null;

  const totalPendientes = materias.reduce((s, m) => s + m.pending_count, 0);
  const retPromedio     = materias.length
    ? Math.round(materias.reduce((s, m) => s + m.avg_retention, 0) / materias.length)
    : null;

  return (
    <>
      <OfflineBanner />
      <div className="pagina">
        <header className="encabezado">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Brand />
            <span style={{ fontSize: '0.75rem', color: 'var(--gris-400)' }}>{user.grade}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="oculto-movil" style={{ fontSize: '0.875rem', color: 'var(--gris-500)' }}>
              {user.username}
            </span>
            <button onClick={() => router.push('/student/learn')} className="btn-primario btn-aprender-header">
              <IconoAprender /> Aprender
            </button>
            <button onClick={() => router.push('/cambiar-clave')} className="btn-secundario oculto-movil">Cambiar contraseña</button>
            <button onClick={cerrarSesion} className="btn-secundario">Cerrar sesión</button>
          </div>
        </header>

        <main className="contenido" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Acceso destacado a Aprender */}
          <button
            type="button"
            className="tarjeta-aprender-cta"
            onClick={() => router.push('/student/learn')}
          >
            <span className="tarjeta-aprender-icono"><IconoAprender /></span>
            <span className="tarjeta-aprender-texto">
              <span className="tarjeta-aprender-titulo">Aprender</span>
              <span className="tarjeta-aprender-sub">
                Estudia la teoría con tarjetas, a tu ritmo
              </span>
            </span>
            <span className="tarjeta-aprender-flecha" aria-hidden="true">→</span>
          </button>

          {/* Resumen del día */}
          <section className="tarjeta">
            <p className="titulo-seccion">Resumen de hoy</p>
            <div className="resumen-fila">
              <div style={{ flex: 1 }}>
                <p className="contador-principal">{cargando ? '—' : totalPendientes}</p>
                <p className="texto-contador">
                  {totalPendientes === 1 ? 'ítem pendiente' : 'ítems pendientes'}
                  {totalPendientes === 0 && ' — al día'}
                </p>
              </div>
              {retPromedio !== null && (
                <div className="retencion-promedio">
                  <p className="retencion-etiqueta">Retención promedio</p>
                  <InsigniaRetencion pct={retPromedio} />
                </div>
              )}
            </div>
          </section>

          {/* Racha de estudio y recordatorios */}
          <PanelRacha />

          {/* Pronóstico de repasos */}
          {!cargando && <ForecastCalendar dias={pronostico} />}

          {/* Materias */}
          <section>
            <p className="titulo-seccion">Mis materias</p>

            {cargando ? (
              <div className="cuadricula-2">
                {[1, 2].map((i) => <div key={i} className="esqueleto-tarjeta" />)}
              </div>
            ) : materias.length === 0 ? (
              <div className="tarjeta-vacia">
                No hay materias disponibles. El docente debe subir material primero.
              </div>
            ) : (
              <div className="cuadricula-2">
                {materias.map((m) => (
                  <div key={m.id} className="tarjeta-materia">
                    <div className="tarjeta-materia-header">
                      <h3 className="nombre-materia">{m.nombre}</h3>
                      <InsigniaRetencion pct={m.avg_retention} />
                    </div>
                    <p className={m.pending_count > 0 ? 'texto-pendiente' : 'texto-al-dia'}>
                      {m.pending_count > 0
                        ? `${m.pending_count} ítem${m.pending_count !== 1 ? 's' : ''} para hoy`
                        : 'Sin pendientes por hoy'}
                    </p>
                    {m.pending_count > 0 && m.recommended > 0 && m.pending_count > m.recommended && (
                      <p className="texto-recomendado">
                        Te recomendamos repasar <strong>{m.recommended}</strong> hoy
                      </p>
                    )}
                    <button
                      className="btn-primario btn-ancho"
                      style={{ marginTop: 'auto' }}
                      disabled={m.pending_count === 0 || iniciando !== null}
                      onClick={() => iniciarSesion(m.id)}
                    >
                      {iniciando === m.id ? 'Iniciando...' : 'Iniciar repaso'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Modal del dato curioso del día (primera entrada) */}
      {dato && (
        <div className="dato-overlay" onClick={() => setDato(null)}>
          <div className="dato-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="dato-modal-cerrar"
              onClick={() => setDato(null)}
              aria-label="Cerrar"
            >
              ✕
            </button>
            <span className="dato-modal-icono" aria-hidden="true">💡</span>
            <p className="dato-modal-titulo">
              ¿Sabías que…{dato.tema ? <span className="dato-modal-tema"> {dato.tema}</span> : ''}
            </p>
            <p className="dato-modal-cuerpo">{dato.texto}</p>
            <button type="button" className="btn-primario btn-ancho" onClick={() => setDato(null)}>
              ¡Genial! Empezar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
