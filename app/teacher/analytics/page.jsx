'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import api from '@/services/api';

const PERIODOS = [
  { valor: '7d',  etiqueta: 'Últimos 7 días' },
  { valor: '30d', etiqueta: 'Últimos 30 días' },
  { valor: '60d', etiqueta: 'Últimos 60 días' },
];

function KPI({ etiqueta, valor, sub }) {
  return (
    <div className="bloque-kpi">
      <p className="kpi-valor">{valor}</p>
      <p className="kpi-etiqueta">{etiqueta}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
}

function ContenidoAnalytics() {
  useAuthGuard('docente');
  const router = useRouter();
  const params = useSearchParams();

  const [materias,  setMaterias]  = useState([]);
  const [materiaId, setMateriaId] = useState(params.get('subjectId') ?? '');
  const [periodo,   setPeriodo]   = useState('30d');
  const [grafico,   setGrafico]   = useState([]);
  const [sesiones,  setSesiones]  = useState([]);
  const [alertas,   setAlertas]   = useState([]);
  const [cargando,  setCargando]  = useState(false);

  useEffect(() => {
    api.get('/material/subjects').then((r) => setMaterias(r.data)).catch(() => {});
    api.get('/analytics/alerts').then((r) => setAlertas(r.data)).catch(() => {});
  }, []);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const q = new URLSearchParams({ periodo, ...(materiaId ? { subjectId: materiaId } : {}) }).toString();
      const [grafRes, metRes] = await Promise.all([
        api.get(`/analytics/retention-chart?${q}`),
        api.get(`/analytics/metrics?${q}`),
      ]);
      setGrafico(grafRes.data);
      setSesiones(metRes.data);
    } catch { /* no-op */ }
    finally { setCargando(false); }
  }, [materiaId, periodo]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  function exportarCSV() {
    const q   = new URLSearchParams({ period: periodo, ...(materiaId ? { subjectId: materiaId } : {}) }).toString();
    const tok = JSON.parse(localStorage.getItem('adaptajireh-auth') ?? '{}')?.state?.token ?? '';
    window.open(`/api/export/csv?${q}&token=${tok}`, '_blank');
  }

  const avgR   = sesiones.length
    ? (sesiones.reduce((a, r) => a + (r.R_post ?? 0), 0) / sesiones.length * 100).toFixed(0)
    : '—';
  const avgSST = sesiones.length
    ? (sesiones.reduce((a, r) => a + (r.SST ?? 0), 0) / sesiones.length * 100).toFixed(0)
    : '—';
  const avgTO  = sesiones.length
    ? (sesiones.reduce((a, r) => a + (r.TO_rate ?? 0), 0) / sesiones.length * 100).toFixed(0)
    : '—';
  const estUnicos = new Set(sesiones.map((r) => r.estudiante?.nombre_usuario)).size || '—';

  function claseR(val) {
    if (val == null) return 'valor-normal';
    return val >= 0.7 ? 'valor-exito' : val >= 0.4 ? 'valor-advertencia' : 'valor-peligro';
  }

  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Dashboard analítico</span>
        <button onClick={exportarCSV} className="btn-secundario" style={{ fontSize: '0.875rem' }}>
          Exportar CSV
        </button>
      </header>

      <main className="contenido-ancho" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* Filtros */}
        <div className="filtros-fila">
          <div className="filtro-campo">
            <label className="etiqueta">Materia</label>
            <select className="campo campo-angosto" value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              <option value="">Todas las materias</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div className="filtro-campo">
            <label className="etiqueta">Periodo</label>
            <select className="campo" style={{ width: '11rem' }} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {PERIODOS.map((p) => (
                <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="cuadricula-kpis-4">
          <KPI etiqueta="Retención R(t) promedio" valor={avgR !== '—' ? `${avgR}%` : '—'} />
          <KPI etiqueta="Similitud SST promedio"  valor={avgSST !== '—' ? `${avgSST}%` : '—'} />
          <KPI etiqueta="Tasa de olvido TO prom." valor={avgTO !== '—' ? `${avgTO}%` : '—'} />
          <KPI etiqueta="Estudiantes activos" valor={estUnicos} sub={`${sesiones.length} sesiones`} />
        </div>

        {/* Alertas tempranas */}
        {alertas.length > 0 && (
          <section>
            <p className="titulo-seccion" style={{ color: 'var(--peligro)' }}>
              Estudiantes en riesgo ({alertas.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alertas.map((a, i) => (
                <div key={i} className="tarjeta-alerta">
                  <p className="alerta-nombre">{a.nombre_usuario}</p>
                  <p className="alerta-detalle">
                    {a.nombre_unidad} — {a.olvidos_consecutivos} olvidos consecutivos (TO &gt; 0.7)
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Gráfico de retención */}
        <section className="tarjeta">
          <p className="titulo-seccion">Evolución temporal de R(t)</p>
          {cargando ? (
            <div className="grafico-vacio">Cargando datos...</div>
          ) : grafico.length === 0 ? (
            <div className="grafico-vacio">Sin datos para el periodo seleccionado</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={grafico} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  formatter={(v, name) => [`${(v * 100).toFixed(1)}%`, name]}
                  contentStyle={{ fontSize: 12, borderColor: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="avg_retrievability"
                  name="R(t) promedio"
                  stroke="#0284c7"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Tabla de variables */}
        <section>
          <div className="tabla-info-fila">
            <p className="titulo-seccion" style={{ marginBottom: 0 }}>
              Variables de investigación por sesión
              {sesiones.length > 50 && (
                <span className="tabla-nota"> (mostrando 50 de {sesiones.length})</span>
              )}
            </p>
          </div>

          <div className="tarjeta-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  {['Estudiante','Grado','TO','IRE','D_post','S_post','R_post','SST','ELC','CE','Bloom','Rating','Fecha'].map((col) => (
                    <th key={col} className="tabla-th">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sesiones.slice(0, 50).map((r) => (
                  <tr key={r.id_respuesta}>
                    <td className="tabla-td-nombre">{r.estudiante?.nombre_usuario ?? '—'}</td>
                    <td className="tabla-td-gris">{r.estudiante?.grado ?? '—'}</td>
                    <td className={`tabla-td ${(r.TO_rate ?? 0) > 0.7 ? 'valor-riesgo' : 'valor-normal'}`}>
                      {r.TO_rate != null ? r.TO_rate.toFixed(2) : '—'}
                    </td>
                    <td className="tabla-td">{r.IRE_dias ?? '—'}</td>
                    <td className="tabla-td">{r.D_post?.toFixed(2) ?? '—'}</td>
                    <td className="tabla-td">{r.S_post?.toFixed(2) ?? '—'}</td>
                    <td className={`tabla-td ${claseR(r.R_post)}`}>
                      {r.R_post != null ? `${(r.R_post * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="tabla-td">{r.SST?.toFixed(2) ?? '—'}</td>
                    <td className="tabla-td">{r.ELC?.toFixed(2) ?? '—'}</td>
                    <td className="tabla-td">{r.CE ?? '—'}</td>
                    <td className="tabla-td">{r.item?.nivel_bloom ?? '—'}</td>
                    <td className="tabla-td">{r.rating_frs ?? '—'}</td>
                    <td className="tabla-td-fecha">
                      {r.timestamp_resp
                        ? new Date(r.timestamp_resp).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                  </tr>
                ))}
                {sesiones.length === 0 && (
                  <tr className="tabla-vacia">
                    <td colSpan={13}>Sin sesiones registradas en este periodo</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function PaginaDashboard() {
  return (
    <Suspense fallback={
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando dashboard...</p>
      </div>
    }>
      <ContenidoAnalytics />
    </Suspense>
  );
}
