'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuthStore } from '@/store/authStore';
import Brand from '@/components/Brand';
import api, { limpiarCacheOffline } from '@/services/api';

export default function PanelDocente() {
  const { user }      = useAuthGuard('docente');
  const { clearAuth } = useAuthStore();
  const router        = useRouter();

  const [alertas,  setAlertas]  = useState([]);
  const [materias, setMaterias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [alertasAbierto, setAlertasAbierto] = useState(false);

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
    limpiarCacheOffline(); // datos personales cacheados para offline
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
          <button onClick={() => router.push('/teacher/temas')}     className="btn-secundario">Temas</button>
          <button onClick={() => router.push('/teacher/theory')}    className="btn-secundario">Material de estudio</button>
          <button onClick={() => router.push('/teacher/items')}     className="btn-secundario">Mis ítems</button>
          <button onClick={() => router.push('/teacher/analytics')} className="btn-secundario">Dashboard</button>
          <button onClick={() => router.push('/teacher/uso')}       className="btn-secundario">Uso</button>
          <button onClick={() => router.push('/teacher/admin')}     className="btn-secundario">Administrar</button>
          <button onClick={() => router.push('/cambiar-clave')}     className="btn-secundario">Cambiar contraseña</button>
          <button onClick={cerrarSesion}                            className="btn-secundario">Cerrar sesión</button>
        </div>
      </header>

      <main className="contenido" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* Alertas tempranas (colapsadas por defecto) */}
        {!cargando && alertas.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setAlertasAbierto((v) => !v)}
              className="titulo-seccion"
              style={{
                color: 'var(--peligro)', background: 'none', border: 'none',
                padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: '0.4rem', font: 'inherit',
              }}
              aria-expanded={alertasAbierto}
            >
              <span style={{ display: 'inline-block', transform: alertasAbierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
              Estudiantes en riesgo academico ({alertas.length})
              <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.8 }}>
                {alertasAbierto ? '— Ver menos' : '— Ver más'}
              </span>
            </button>
            {alertasAbierto && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {alertas.map((a, i) => (
                  <div key={i} className="tarjeta-alerta">
                    <p className="alerta-nombre">{a.nombre_usuario}</p>
                    <p className="alerta-detalle">
                      Tema: {a.nombre_unidad} — precisión {Math.round((a.precision_prom ?? 0) * 100)}% en {a.items_evaluados} ítems (últimos 14 días)
                    </p>
                  </div>
                ))}
              </div>
            )}
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
            <button className="tarjeta-accion" onClick={() => router.push('/teacher/temas')}>
              <p style={{ fontWeight: 500, color: 'var(--gris-800)', fontSize: '0.875rem' }}>
                Temas
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.25rem' }}>
                Activa u oculta temas para controlar qué ven los alumnos y cuándo
              </p>
            </button>
            <button className="tarjeta-accion" onClick={() => router.push('/teacher/theory')}>
              <p style={{ fontWeight: 500, color: 'var(--gris-800)', fontSize: '0.875rem' }}>
                Material de estudio
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.25rem' }}>
                Revisa y edita los apuntes de cada tema; agrega secciones que falten
              </p>
            </button>
            <button className="tarjeta-accion" onClick={() => router.push('/teacher/items')}>
              <p style={{ fontWeight: 500, color: 'var(--gris-800)', fontSize: '0.875rem' }}>
                Mis ítems
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.25rem' }}>
                Revisa tus preguntas como flashcards con el % de aciertos de los alumnos
              </p>
            </button>
            <button className="tarjeta-accion" onClick={() => router.push('/teacher/analytics')}>
              <p style={{ fontWeight: 500, color: 'var(--gris-800)', fontSize: '0.875rem' }}>
                Dashboard analítico
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.25rem' }}>
                Monitorea PA, AR, TR, SST y exporta datos CSV para SPSS
              </p>
            </button>
            <button className="tarjeta-accion" onClick={() => router.push('/teacher/uso')}>
              <p style={{ fontWeight: 500, color: 'var(--gris-800)', fontSize: '0.875rem' }}>
                Uso de la aplicación
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', marginTop: '0.25rem' }}>
                Mira qué porcentaje de días ha usado la app cada estudiante
              </p>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
