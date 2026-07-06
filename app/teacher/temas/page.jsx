'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import api from '@/services/api';

function ContenidoTemas() {
  useAuthGuard('docente');
  const router = useRouter();
  const params = useSearchParams();

  const [materias,  setMaterias]  = useState([]);
  const [materiaId, setMateriaId] = useState(params.get('subjectId') ?? '');
  const [temas,     setTemas]     = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [error,     setError]     = useState('');
  const [guardando, setGuardando] = useState(null); // id del tema que se está cambiando

  useEffect(() => {
    api.get('/material/subjects').then((r) => {
      setMaterias(r.data);
      if (!materiaId && r.data[0]) setMateriaId(r.data[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    if (!materiaId) { setTemas([]); return; }
    setCargando(true);
    try {
      const { data } = await api.get(`/material/units?subjectId=${materiaId}`);
      setTemas(data);
      setError('');
    } catch {
      setError('No se pudieron cargar los temas.');
    } finally {
      setCargando(false);
    }
  }, [materiaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function alternar(tema) {
    setGuardando(tema.id);
    setError('');
    try {
      const { data } = await api.patch('/material/units', {
        unitId:  tema.id,
        visible: !tema.visible,
      });
      setTemas((prev) => prev.map((t) => (t.id === tema.id ? { ...t, visible: data.visible } : t)));
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar el tema.');
    } finally {
      setGuardando(null);
    }
  }

  const visibles = temas.filter((t) => t.visible).length;

  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Temas</span>
      </header>

      <main style={{ maxWidth: '42rem', margin: '0 auto', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--gris-500)', margin: 0 }}>
          Activa un tema cuando quieras que los alumnos lo vean. Los temas
          <strong> ocultos</strong> no aparecen en «Aprender» ni entregan ítems en las
          sesiones de repaso. Los temas nuevos nacen ocultos.
        </p>

        <div className="filtro-campo" style={{ maxWidth: '18rem' }}>
          <label className="etiqueta">Materia</label>
          <select className="campo" value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>

        {error && <p className="alerta-error">{error}</p>}

        {cargando ? (
          <div className="tarjeta-vacia">Cargando temas...</div>
        ) : temas.length === 0 ? (
          <div className="tarjeta-vacia">Esta materia aún no tiene temas.</div>
        ) : (
          <>
            <p style={{ fontSize: '0.8125rem', color: 'var(--gris-400)', margin: 0 }}>
              {visibles} de {temas.length} temas visibles para los alumnos
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {temas.map((t) => (
                <div key={t.id} className="tarjeta tema-visibilidad-fila">
                  <div style={{ minWidth: 0 }}>
                    <p className="tema-vis-nombre">{t.nombre}</p>
                    <p className="tema-vis-meta">
                      {t.items} ítem{t.items !== 1 ? 's' : ''}
                      {t.items === 0 && ' · aún sin ítems'}
                      {' · '}
                      <span className={t.visible ? 'tema-vis-estado visible' : 'tema-vis-estado oculto'}>
                        {t.visible ? 'Visible' : 'Oculto'}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={t.visible}
                    aria-label={t.visible ? `Ocultar ${t.nombre}` : `Activar ${t.nombre}`}
                    className={`switch ${t.visible ? 'on' : ''}`}
                    onClick={() => alternar(t)}
                    disabled={guardando === t.id}
                  >
                    <span className="switch-perilla" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function PaginaTemas() {
  return (
    <Suspense fallback={
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando...</p>
      </div>
    }>
      <ContenidoTemas />
    </Suspense>
  );
}
