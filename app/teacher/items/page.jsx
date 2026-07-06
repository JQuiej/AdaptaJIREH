'use client';
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import BloomBadge from '@/components/BloomBadge';
import api from '@/services/api';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const nivelLogro = (v) => (v == null ? 'nulo' : v >= 0.7 ? 'alto' : v >= 0.4 ? 'medio' : 'bajo');

function KPI({ etiqueta, valor, sub }) {
  return (
    <div className="bloque-kpi">
      <p className="kpi-valor">{valor}</p>
      <p className="kpi-etiqueta">{etiqueta}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
}

// Tarjeta tipo flashcard: se voltea al tocarla (frente = pregunta, reverso =
// respuesta de referencia + pista + estadísticas detalladas).
function TarjetaItem({ item }) {
  const [volteada, setVolteada] = useState(false);
  const logro = nivelLogro(item.precision);
  const sinDatos = item.totalRespuestas === 0;

  return (
    <div
      className={`flip-card ${volteada ? 'volteada' : ''}`}
      onClick={() => setVolteada((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVolteada((v) => !v); } }}
    >
      <div className="flip-card-inner">
        {/* Frente: pregunta */}
        <div className="flip-card-cara flip-card-front">
          <div className="flip-top">
            <BloomBadge nivel={item.nivel_bloom} />
            {!item.activo && <span className="flip-inactivo">inactivo</span>}
          </div>
          <p className="flip-tema">{item.unidad}</p>
          <p className="flip-pregunta">{item.pregunta}</p>
          <div className="flip-stats">
            {sinDatos ? (
              <span className="stat-pill nulo">Sin respuestas aún</span>
            ) : (
              <>
                <span className={`stat-pill ${logro}`}>{pct(item.precision)} aciertos</span>
                <span className="stat-mini">{item.totalRespuestas} resp · {item.estudiantes} alumnos</span>
              </>
            )}
          </div>
          <span className="flip-hint">Toca para ver la respuesta →</span>
        </div>

        {/* Reverso: respuesta + estadísticas */}
        <div className="flip-card-cara flip-card-back">
          <p className="flip-label">Respuesta de referencia</p>
          <p className="flip-respuesta">{item.respuesta_ref}</p>
          {item.pista && (
            <>
              <p className="flip-label">Pista</p>
              <p className="flip-pista">{item.pista}</p>
            </>
          )}
          <div className="flip-stats-detalle">
            <div><strong className={`logro-${logro}`}>{pct(item.precision)}</strong><span>aciertos</span></div>
            <div><strong>{item.sst != null ? item.sst.toFixed(2) : '—'}</strong><span>SST</span></div>
            <div><strong>{item.rating != null ? item.rating.toFixed(1) : '—'}</strong><span>rating /4</span></div>
            <div><strong>{item.tiempoMs != null ? `${Math.round(item.tiempoMs / 1000)}s` : '—'}</strong><span>tiempo</span></div>
          </div>
          <span className="flip-hint">← Toca para volver</span>
        </div>
      </div>
    </div>
  );
}

function ContenidoItems() {
  useAuthGuard('docente');
  const router = useRouter();
  const params = useSearchParams();

  const [materias,  setMaterias]  = useState([]);
  const [materiaId, setMateriaId] = useState(params.get('subjectId') ?? '');
  const [items,     setItems]     = useState([]);
  const [busqueda,  setBusqueda]  = useState('');
  const [bloomFilt, setBloomFilt] = useState(''); // '' | '1'..'4'
  const [cargando,  setCargando]  = useState(true);

  useEffect(() => {
    api.get('/material/subjects').then((r) => setMaterias(r.data)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = materiaId ? `?subjectId=${materiaId}` : '';
      const { data } = await api.get(`/teacher/items${q}`);
      setItems(data);
    } catch { setItems([]); }
    finally { setCargando(false); }
  }, [materiaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return items.filter((it) => {
      if (bloomFilt && String(it.nivel_bloom) !== bloomFilt) return false;
      if (texto && !(`${it.pregunta} ${it.respuesta_ref} ${it.unidad}`.toLowerCase().includes(texto))) return false;
      return true;
    });
  }, [items, busqueda, bloomFilt]);

  // Resumen: aciertos global ponderado por número de respuestas.
  const resumen = useMemo(() => {
    let respuestas = 0, aciertosPond = 0, conDatos = 0;
    for (const it of items) {
      if (it.totalRespuestas > 0 && it.precision != null) {
        respuestas += it.totalRespuestas;
        aciertosPond += it.precision * it.totalRespuestas;
        conDatos += 1;
      }
    }
    return {
      totalItems: items.length,
      conDatos,
      respuestas,
      aciertos: respuestas > 0 ? aciertosPond / respuestas : null,
    };
  }, [items]);

  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Mis ítems</span>
      </header>

      <main className="contenido-ancho" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <label className="etiqueta">Nivel Bloom</label>
            <select className="campo" style={{ width: '11rem' }} value={bloomFilt} onChange={(e) => setBloomFilt(e.target.value)}>
              <option value="">Todos</option>
              <option value="1">Bloom 1 — Recordar / Comprender</option>
              <option value="2">Bloom 2 — Aplicar / Analizar</option>
              <option value="3">Bloom 3 — Evaluar</option>
              <option value="4">Bloom 4 — Crear</option>
            </select>
          </div>
          <div className="filtro-campo" style={{ flex: 1, minWidth: '12rem' }}>
            <label className="etiqueta">Buscar</label>
            <input
              className="campo"
              placeholder="Buscar en preguntas, respuestas o temas..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* Resumen */}
        <div className="cuadricula-kpis-4">
          <KPI etiqueta="Ítems creados" valor={resumen.totalItems} />
          <KPI etiqueta="Con respuestas" valor={resumen.conDatos} sub={`${resumen.totalItems - resumen.conDatos} sin actividad`} />
          <KPI etiqueta="Aciertos global" valor={pct(resumen.aciertos)} sub="ponderado por respuestas" />
          <KPI etiqueta="Respuestas totales" valor={resumen.respuestas} />
        </div>

        {/* Flashcards */}
        {cargando ? (
          <div className="tarjeta-vacia">Cargando ítems...</div>
        ) : filtrados.length === 0 ? (
          <div className="tarjeta-vacia">
            {items.length === 0
              ? 'Aún no has creado ítems. Sube material desde «Subir material».'
              : 'Ningún ítem coincide con los filtros.'}
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.8125rem', color: 'var(--gris-400)', margin: 0 }}>
              Mostrando {filtrados.length} de {items.length} ítems · toca una tarjeta para voltearla
            </p>
            <div className="grid-flashcards">
              {filtrados.map((it) => <TarjetaItem key={it.id} item={it} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function PaginaItems() {
  return (
    <Suspense fallback={
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando...</p>
      </div>
    }>
      <ContenidoItems />
    </Suspense>
  );
}
