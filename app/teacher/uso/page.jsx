'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import api from '@/services/api';

const nivelUso = (v) => (v >= 70 ? 'alto' : v >= 40 ? 'medio' : 'bajo');
const fecha = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function KPI({ etiqueta, valor, sub }) {
  return (
    <div className="bloque-kpi">
      <p className="kpi-valor">{valor}</p>
      <p className="kpi-etiqueta">{etiqueta}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
}

export default function PaginaUso() {
  const { user } = useAuthGuard('docente');
  const router   = useRouter();

  const [filas,    setFilas]    = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    let vivo = true;
    api.get('/teacher/usage')
      .then((r) => { if (vivo) setFilas(r.data); })
      .catch(() => { if (vivo) setError('No se pudo cargar el uso de los estudiantes.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const resumen = useMemo(() => {
    const conActividad = filas.filter((f) => f.totalRespuestas > 0);
    const promedio = conActividad.length
      ? conActividad.reduce((s, f) => s + f.porcentajeUso, 0) / conActividad.length
      : 0;
    return {
      total:        filas.length,
      conActividad: conActividad.length,
      sinActividad: filas.length - conActividad.length,
      promedio:     Math.round(promedio * 10) / 10,
    };
  }, [filas]);

  if (!user) return null;

  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Uso de la aplicación</span>
      </header>

      <main className="contenido-ancho" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--gris-600)', margin: 0 }}>
          Porcentaje de días que cada estudiante usó la app, desde su primera respuesta hasta hoy.
          Los días que dejó de entrar cuentan como inactivos y bajan el porcentaje.
        </p>

        {/* Resumen */}
        <div className="cuadricula-kpis-4">
          <KPI etiqueta="Estudiantes" valor={resumen.total} />
          <KPI etiqueta="Con actividad" valor={resumen.conActividad} sub={`${resumen.sinActividad} sin actividad`} />
          <KPI etiqueta="Uso promedio" valor={`${resumen.promedio}%`} sub="entre los que han usado la app" />
        </div>

        {cargando ? (
          <div className="tarjeta-vacia">Cargando uso...</div>
        ) : error ? (
          <p className="alerta-error">{error}</p>
        ) : filas.length === 0 ? (
          <div className="tarjeta-vacia">No hay estudiantes inscritos en tus materias.</div>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla-uso">
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Grado</th>
                  <th>Primer uso</th>
                  <th>Última actividad</th>
                  <th className="num">Días activos</th>
                  <th className="num">Días totales</th>
                  <th className="num">Respuestas</th>
                  <th>% de uso</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const sinDatos = f.totalRespuestas === 0;
                  const clave = nivelUso(f.porcentajeUso);
                  return (
                    <tr key={f.estudianteId}>
                      <td className="uso-codigo">{f.codigoAnonimo}</td>
                      <td>{f.grado ?? '—'}</td>
                      <td>{fecha(f.primeraFecha)}</td>
                      <td>{fecha(f.ultimaFecha)}</td>
                      <td className="num">{sinDatos ? '—' : f.diasActivos}</td>
                      <td className="num">{sinDatos ? '—' : f.diasTranscurridos}</td>
                      <td className="num">{f.totalRespuestas}</td>
                      <td>
                        {sinDatos ? (
                          <span className="stat-pill nulo">Sin actividad</span>
                        ) : (
                          <div className="uso-barra-fila">
                            <div className="uso-barra">
                              <div className={`uso-barra-relleno ${clave}`} style={{ width: `${f.porcentajeUso}%` }} />
                            </div>
                            <span className={`uso-pct ${clave}`}>{f.porcentajeUso}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
