'use client';
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
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

// Agrega las respuestas por día para el gráfico de un estudiante individual
// (mismo formato que devuelve el RPC get_retention_chart: fecha, promedio_pa,
// promedio_ar), calculado en el cliente para no tocar el SQL.
function graficoDeSesiones(rows) {
  const porDia = new Map();
  for (const r of rows) {
    if (!r.timestamp_resp) continue;
    const fecha = new Date(r.timestamp_resp).toISOString().split('T')[0];
    if (!porDia.has(fecha)) porDia.set(fecha, { fecha, pa: [], ar: [] });
    const d = porDia.get(fecha);
    if (r.PA != null) d.pa.push(r.PA);
    if (r.AR != null) d.ar.push(r.AR);
  }
  const media = (arr) => (arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null);
  return [...porDia.values()]
    .map((d) => ({ fecha: d.fecha, promedio_pa: media(d.pa), promedio_ar: media(d.ar) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

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
  const [estudianteId, setEstudianteId] = useState('');
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

  // Al cambiar de materia o periodo, se limpia el estudiante seleccionado
  // (podría no tener datos en el nuevo contexto).
  useEffect(() => { setEstudianteId(''); }, [materiaId, periodo]);

  // Lista de estudiantes con actividad en el contexto actual (materia + periodo),
  // derivada de las respuestas cargadas — no requiere endpoint aparte.
  const estudiantes = useMemo(() => {
    const map = new Map();
    for (const r of sesiones) {
      const e = r.estudiante;
      if (e?.id_usuario && !map.has(e.id_usuario)) map.set(e.id_usuario, e);
    }
    return [...map.values()].sort((a, b) =>
      (a.nombre_usuario ?? '').localeCompare(b.nombre_usuario ?? ''));
  }, [sesiones]);

  // Respuestas mostradas: todas, o solo las del estudiante seleccionado.
  const sesionesFiltradas = estudianteId
    ? sesiones.filter((r) => r.estudiante?.id_usuario === estudianteId)
    : sesiones;

  // Gráfico: por estudiante se calcula en el cliente; en la vista general se usa
  // el del RPC (agrega todas las respuestas del servidor, sin el tope de 500).
  const datosGrafico = estudianteId ? graficoDeSesiones(sesionesFiltradas) : grafico;

  const estudianteSel = estudiantes.find((e) => e.id_usuario === estudianteId) ?? null;

  async function exportarCSV() {
    const q = new URLSearchParams({ period: periodo, ...(materiaId ? { subjectId: materiaId } : {}) }).toString();
    try {
      // Descarga con el header Authorization (vía interceptor de axios). No se
      // usa window.open porque esa navegación no envía el token y el endpoint
      // respondía "Token no proporcionado".
      const res = await api.get(`/export/csv?${q}`, { responseType: 'blob' });

      const cd = res.headers['content-disposition'] ?? '';
      const m  = /filename="?([^"]+)"?/.exec(cd);
      const nombre = m?.[1] ?? `adaptajireh_${Date.now()}.csv`;

      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.status === 404) {
        alert('No hay datos para exportar en el periodo seleccionado.');
      } else {
        alert('No se pudo exportar. Intenta de nuevo.');
      }
    }
  }

  // Promedio de una variable en [0,1] → porcentaje (ignora valores nulos,
  // p. ej. TR solo existe en ítems de transferencia).
  function promedioPct(campo) {
    const vals = sesionesFiltradas.map((r) => r[campo]).filter((v) => v != null);
    return vals.length
      ? (vals.reduce((a, v) => a + v, 0) / vals.length * 100).toFixed(0)
      : '—';
  }

  const avgSST = promedioPct('SST');
  const avgPA  = promedioPct('PA');
  const avgAR  = promedioPct('AR');
  const avgTR  = promedioPct('TR');
  const estUnicos = new Set(sesionesFiltradas.map((r) => r.estudiante?.nombre_usuario)).size || '—';

  // Colorea un valor [0,1] según umbrales de logro (alto / medio / bajo).
  function claseLogro(val) {
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
            <label className="etiqueta">Estudiante</label>
            <select
              className="campo campo-angosto"
              value={estudianteId}
              onChange={(e) => setEstudianteId(e.target.value)}
              disabled={estudiantes.length === 0}
            >
              <option value="">Todos los estudiantes</option>
              {estudiantes.map((e) => (
                <option key={e.id_usuario} value={e.id_usuario}>
                  {e.nombre_usuario}{e.grado ? ` — ${e.grado}` : ''}
                </option>
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

        {estudianteSel && (
          <p className="titulo-seccion" style={{ marginBottom: 0 }}>
            Progreso individual de <strong>{estudianteSel.nombre_usuario}</strong>
            {estudianteSel.grado ? ` (${estudianteSel.grado})` : ''}
          </p>
        )}

        {/* KPIs */}
        <div className="cuadricula-kpis-4">
          <KPI etiqueta="Precisión 1er intento (PA)" valor={avgPA !== '—' ? `${avgPA}%` : '—'} />
          <KPI etiqueta="Adherencia al repaso (AR)"  valor={avgAR !== '—' ? `${avgAR}%` : '—'} />
          <KPI etiqueta="Transferencia (TR)" valor={avgTR !== '—' ? `${avgTR}%` : '—'} sub="Bloom 3–4" />
          <KPI etiqueta="Similitud SST promedio" valor={avgSST !== '—' ? `${avgSST}%` : '—'} sub={`${estUnicos} activos · ${sesiones.length} sesiones`} />
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
                    {a.nombre_unidad} — precisión {Math.round((a.precision_prom ?? 0) * 100)}% en {a.items_evaluados} ítems (últimos 14 días)
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Gráfico temporal: precisión (PA) y adherencia (AR) */}
        <section className="tarjeta">
          <p className="titulo-seccion">Evolución de precisión (PA) y adherencia (AR)</p>
          {cargando ? (
            <div className="grafico-vacio">Cargando datos...</div>
          ) : datosGrafico.length === 0 ? (
            <div className="grafico-vacio">Sin datos para el periodo seleccionado</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={datosGrafico} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#94a3b8' }} />
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
                  dataKey="promedio_pa"
                  name="Precisión (PA)"
                  stroke="#0284c7"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="promedio_ar"
                  name="Adherencia (AR)"
                  stroke="#16a34a"
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
              Variables de investigación por ítem (cada fila es una respuesta)
              {sesionesFiltradas.length > 50 && (
                <span className="tabla-nota"> (mostrando 50 de {sesionesFiltradas.length})</span>
              )}
            </p>
          </div>

          <div className="tarjeta-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  {['Estudiante','Grado','D','S','IRE','SST','TR','PA','AR','CE','DD (Bloom)','LR (s)','Fecha'].map((col) => (
                    <th key={col} className="tabla-th">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sesionesFiltradas.slice(0, 50).map((r) => (
                  <tr key={r.id_respuesta}>
                    <td className="tabla-td-nombre">{r.estudiante?.nombre_usuario ?? '—'}</td>
                    <td className="tabla-td-gris">{r.estudiante?.grado ?? '—'}</td>
                    <td className="tabla-td">{r.D_post?.toFixed(2) ?? '—'}</td>
                    <td className="tabla-td">{r.S_post?.toFixed(2) ?? '—'}</td>
                    <td className="tabla-td">{r.IRE_dias ?? '—'}</td>
                    <td className="tabla-td">{r.SST?.toFixed(2) ?? '—'}</td>
                    <td className={`tabla-td ${claseLogro(r.TR)}`}>
                      {r.TR != null ? r.TR.toFixed(2) : '—'}
                    </td>
                    <td className={`tabla-td ${claseLogro(r.PA)}`}>
                      {r.PA != null ? r.PA.toFixed(2) : '—'}
                    </td>
                    <td className={`tabla-td ${claseLogro(r.AR)}`}>
                      {r.AR != null ? r.AR.toFixed(2) : '—'}
                    </td>
                    <td className="tabla-td">{r.CE ?? '—'}</td>
                    <td className="tabla-td">{r.DD ?? r.item?.nivel_bloom ?? '—'}</td>
                    {/* LR (Latencia de Respuesta): tiempo en responder, en segundos */}
                    <td className="tabla-td">
                      {r.tiempo_respuesta_ms != null ? (r.tiempo_respuesta_ms / 1000).toFixed(1) : '—'}
                    </td>
                    <td className="tabla-td-fecha">
                      {r.timestamp_resp
                        ? new Date(r.timestamp_resp).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                  </tr>
                ))}
                {sesionesFiltradas.length === 0 && (
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
