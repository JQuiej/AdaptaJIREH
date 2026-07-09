'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useSessionStore } from '@/store/sessionStore';
import Flashcard from '@/components/Flashcard';
import OfflineBanner from '@/components/OfflineBanner';
import api from '@/services/api';

function ContenidoRepaso() {
  const { user }                                 = useAuthGuard('estudiante');
  const { sessionId, addReviewed, clearSession } = useSessionStore();
  const router                                   = useRouter();
  const params                                   = useSearchParams();
  const materiaId                                = params.get('subjectId');

  const [cola,      setCola]      = useState([]);
  const [actual,    setActual]    = useState(0);
  const [cargando,  setCargando]  = useState(true);
  const [evaluando, setEvaluando] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [nombreMateria, setNombreMateria] = useState('');

  // Carga cognitiva recomendada por alumno (guía, no límite).
  const [recomendado,       setRecomendado]       = useState(0);
  const [mostrarCheckpoint, setMostrarCheckpoint] = useState(false);
  const [checkpointVisto,   setCheckpointVisto]   = useState(false);

  const cargar = useCallback(async () => {
    if (!materiaId) { router.replace('/student'); return; }
    try {
      const { data } = await api.get(`/fsrs/pending?subjectId=${materiaId}`);
      const items = data.items ?? [];
      setCola(items);
      setRecomendado(data.recommended ?? 0);
      if (items.length > 0) {
        setNombreMateria(items[0]?.item?.unidad?.materia?.nombre ?? '');
      }
    } catch { router.replace('/student'); }
    finally { setCargando(false); }
  }, [materiaId, router]);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleEnviar(itemId, respuesta, responseTimeMs, usedHint = false) {
    setEvaluando(true);
    try {
      const { data } = await api.post('/fsrs/evaluate', {
        itemId,
        studentResponse: respuesta,
        responseTimeMs,
        totalItemsInSession: cola.length, // carga cognitiva (CE)
        sessionId,
        usedHint,                         // PA no cuenta como intento sin ayuda
      });
      addReviewed(itemId);
      return data;
    } catch { return null; }
    finally { setEvaluando(false); }
  }

  function handleSiguiente() {
    const siguiente = actual + 1;
    if (siguiente >= cola.length) {
      finalizar();
      return;
    }
    // Al alcanzar el repaso recomendado, ofrecer terminar o seguir (sin obligar).
    if (!checkpointVisto && recomendado > 0 && siguiente === recomendado && cola.length > recomendado) {
      setMostrarCheckpoint(true);
      return;
    }
    setActual(siguiente);
  }

  function continuarTrasCheckpoint() {
    setCheckpointVisto(true);
    setMostrarCheckpoint(false);
    setActual((a) => a + 1);
  }

  async function finalizar() {
    if (sessionId) {
      await api.post('/fsrs/session/end', { sessionId }).catch(() => {});
    }
    clearSession();
    setTerminado(true);
  }

  if (!user) return null;

  if (cargando) {
    return (
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando preguntas...</p>
      </div>
    );
  }

  if (terminado || cola.length === 0) {
    return (
      <div className="pantalla-completada">
        <div className="tarjeta-completada">
          <div className="icono-completado">
            <span className="icono-completado-signo">+</span>
          </div>
          <h2 className="titulo-completado">Sesión completada</h2>
          <p className="subtitulo-completado">
            {cola.length > 0
              ? `Respondiste ${cola.length} pregunta${cola.length !== 1 ? 's' : ''} en esta sesión.`
              : 'No hay preguntas pendientes para esta materia hoy.'}
          </p>
          <button className="btn-primario btn-ancho" onClick={() => router.push('/student')}>
            Volver al panel
          </button>
        </div>
      </div>
    );
  }

  // Checkpoint de carga cognitiva: alcanzó el repaso recomendado para hoy.
  if (mostrarCheckpoint) {
    const restantes = cola.length - recomendado;
    return (
      <div className="pantalla-completada">
        <div className="tarjeta-completada">
          <div className="icono-completado">
            <span className="icono-completado-signo">✓</span>
          </div>
          <h2 className="titulo-completado">¡Buen trabajo!</h2>
          <p className="subtitulo-completado">
            Completaste tu repaso recomendado de hoy ({recomendado}). Según tu
            desempeño, este es el número sugerido para no saturarte. Puedes
            terminar aquí o seguir con los {restantes} restantes.
          </p>
          <button className="btn-primario btn-ancho" onClick={continuarTrasCheckpoint}>
            Seguir repasando
          </button>
          <button
            className="btn-secundario btn-ancho"
            style={{ marginTop: '0.75rem' }}
            onClick={finalizar}
          >
            Terminar por hoy
          </button>
        </div>
      </div>
    );
  }

  const fila        = cola[actual];
  const item        = fila.item;
  const pctProgreso = Math.round((actual / cola.length) * 100);

  return (
    <>
      <OfflineBanner />
      <div className="pagina">
        <header className="encabezado">
          <button onClick={() => router.push('/student')} className="enlace-volver">
            Volver al panel
          </button>
          <div className="encabezado-repaso-info">
            <span className="nombre-materia-header">{nombreMateria}</span>
            <span className="contador-posicion">{actual + 1} / {cola.length}</span>
          </div>
        </header>

        <div className="barra-sesion-fondo">
          <div className="barra-sesion-relleno" style={{ width: `${pctProgreso}%` }} />
        </div>

        {recomendado > 0 && cola.length > recomendado && (
          <p className="nota-recomendado">
            Repaso recomendado hoy: <strong>{recomendado}</strong> de {cola.length}
          </p>
        )}

        <div className="contenido-repaso">
          <Flashcard
            key={fila.id}
            item={item}
            cargando={evaluando}
            onSubmit={handleEnviar}
            onSiguiente={handleSiguiente}
          />
        </div>
      </div>
    </>
  );
}

export default function PaginaRepaso() {
  return (
    <Suspense fallback={
      <div className="centrado-pantalla">
        <p className="texto-carga">Cargando...</p>
      </div>
    }>
      <ContenidoRepaso />
    </Suspense>
  );
}
