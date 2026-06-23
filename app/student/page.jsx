'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuthStore } from '@/store/authStore';
import { useSessionStore } from '@/store/sessionStore';
import OfflineBanner from '@/components/OfflineBanner';
import ForecastCalendar from '@/components/ForecastCalendar';
import Brand from '@/components/Brand';
import api from '@/services/api';

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
            <button onClick={() => router.push('/student/learn')} className="btn-secundario">Aprender</button>
            <button onClick={cerrarSesion} className="btn-secundario">Cerrar sesión</button>
          </div>
        </header>

        <main className="contenido" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
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
    </>
  );
}
