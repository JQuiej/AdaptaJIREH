'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuthStore } from '@/store/authStore';
import Brand from '@/components/Brand';
import api from '@/services/api';

export default function PanelDocente() {
  const { user }      = useAuthGuard('docente');
  const { clearAuth } = useAuthStore();
  const router        = useRouter();

  const [alertas,  setAlertas]  = useState([]);
  const [materias, setMaterias] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [alertasRes, materiasRes] = await Promise.all([
        api.get('/analytics/alerts'),
        api.get('/material/subjects'),
      ]);
      setAlertas(alertasRes.data);
      setMaterias(materiasRes.data);
    } catch { /* interceptor maneja 401 */ }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function cerrarSesion() {
    await api.post('/auth/logout').catch(() => {});
    clearAuth();
    router.push('/login');
  }

  if (!user) return null;

  return (
    <div className="pagina">
      <header className="encabezado">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Brand />
          <span style={{ fontSize: '0.75rem', color: 'var(--gris-400)' }}>— Docente</span>
        </div>
        <div className="acciones-header">
          <button onClick={() => router.push('/teacher/upload')}    className="btn-primario">Subir material</button>
          <button onClick={() => router.push('/teacher/analytics')} className="btn-secundario">Dashboard</button>
          <button onClick={cerrarSesion}                            className="btn-secundario">Cerrar sesión</button>
        </div>
      </header>

      <main className="contenido" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* Alertas tempranas */}
        {!cargando && alertas.length > 0 && (
          <section>
            <p className="titulo-seccion" style={{ color: 'var(--peligro)' }}>
              Estudiantes en riesgo academico ({alertas.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alertas.map((a, i) => (
                <div key={i} className="tarjeta-alerta">
                  <p className="alerta-nombre">{a.nombre_usuario}</p>
                  <p className="alerta-detalle">
                    Tema: {a.nombre_unidad} — {a.olvidos_consecutivos} olvidos consecutivos en los últimos 14 días
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Materias */}
        <section>
          <p className="titulo-seccion">Materias</p>
          {cargando ? (
            <div className="cuadricula-2">
              {[1, 2].map((i) => <div key={i} className="esqueleto-tarjeta" />)}
            </div>
          ) : materias.length === 0 ? (
            <div className="tarjeta-vacia">No hay materias registradas.</div>
          ) : (
            <div className="cuadricula-2">
              {materias.map((m) => (
                <div key={m.id} className="tarjeta-materia">
                  <h3 className="nombre-materia">{m.nombre}</h3>
                  <div className="tarjeta-botones">
                    <button
                      className="btn-secundario"
                      style={{ flex: 1, fontSize: '0.875rem' }}
                      onClick={() => router.push(`/teacher/upload?subjectId=${m.id}`)}
                    >
                      Subir PDF
                    </button>
                    <button
                      className="btn-secundario"
                      style={{ flex: 1, fontSize: '0.875rem' }}
                      onClick={() => router.push(`/teacher/analytics?subjectId=${m.id}`)}
                    >
                      Ver analíticas
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Acciones */}
        <section>
          <p className="titulo-seccion">Acciones</p>
          <div className="cuadricula-2">
            <button className="tarjeta-accion" onClick={() => router.push('/teacher/upload')}>
              <p style={{ fontWeight: 500, color: 'var(--gris-800)', fontSize: '0.875rem' }}>
                Subir material nuevo
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.25rem' }}>
                Carga un PDF y genera preguntas automáticamente con IA
              </p>
            </button>
            <button className="tarjeta-accion" onClick={() => router.push('/teacher/analytics')}>
              <p style={{ fontWeight: 500, color: 'var(--gris-800)', fontSize: '0.875rem' }}>
                Dashboard analítico
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.25rem' }}>
                Monitorea R(t), TO, SST y exporta datos CSV para SPSS
              </p>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
