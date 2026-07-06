'use client';
import { useState } from 'react';
import BloomBadge from './BloomBadge';
import SemanticBar from './SemanticBar';
import MathField from './MathField';

export default function Flashcard({ item, onSubmit, onSiguiente, cargando }) {
  const [respuesta, setRespuesta] = useState('');
  const [resultado, setResultado] = useState(null);
  const [inicio]                  = useState(() => Date.now());

  // Traducción al español pre-generada: solo existe (no es null) cuando la
  // pregunta está en inglés. Se muestra únicamente si el alumno la pide.
  const [verTrad, setVerTrad] = useState(false);
  const traduccion = item.pregunta_es;

  // Pista opcional: el alumno la revela solo si la necesita. 'pistaUsada' queda
  // en true si la abrió al menos una vez → PA no cuenta como intento sin ayuda.
  const [verPista, setVerPista]     = useState(false);
  const [pistaUsada, setPistaUsada] = useState(false);

  // En Matemáticas se muestra una paleta de símbolos para escribir ecuaciones.
  const esMatematicas = /matem[aá]tic/i.test(item.unidad?.materia?.nombre ?? '');

  async function handleEnviar(e) {
    e.preventDefault();
    if (!respuesta.trim()) return;
    const res = await onSubmit(item.id, respuesta.trim(), Date.now() - inicio, pistaUsada);
    if (res) setResultado(res);
  }

  function handleSiguiente() {
    setRespuesta('');
    setResultado(null);
    onSiguiente?.();
  }

  // Parsear como fecha LOCAL (no UTC) para evitar que reste un día en GT (UTC-6)
  const proximaFecha = resultado?.fsrs?.next_review
    ? new Date(`${resultado.fsrs.next_review}T00:00:00`).toLocaleDateString('es-GT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;

  const puntaje = resultado?.grade_score ?? resultado?.sst_score ?? 0;
  const estado  = puntaje >= 0.71
    ? { clave: 'alto',  icono: '✓', titulo: '¡Muy bien!',        sub: 'Dominaste esta pregunta.' }
    : puntaje >= 0.41
      ? { clave: 'medio', icono: '◐', titulo: 'Vas por buen camino', sub: 'Te faltó afinar algunos detalles.' }
      : { clave: 'bajo',  icono: '↻', titulo: 'A reforzar',          sub: 'Repasa este tema con calma.' };
  const partes = resultado?.feedback_parts;

  return (
    <div className="tarjeta tarjeta-flashcard">
      <div className="flashcard-cabecera">
        <BloomBadge nivel={item.nivel_bloom} />
        <p className="flashcard-pregunta">{item.pregunta}</p>

        {traduccion && (
          <>
            <button
              type="button"
              className="btn-traducir"
              onClick={() => setVerTrad((v) => !v)}
            >
              {verTrad ? 'Ocultar traducción' : 'Traducir al español'}
            </button>

            {verTrad && <p className="flashcard-traduccion">{traduccion}</p>}
          </>
        )}
      </div>

      {!resultado ? (
        <form onSubmit={handleEnviar} className="formulario-respuesta">
          {esMatematicas ? (
            <MathField
              className="campo campo-respuesta"
              placeholder="Escribe tu respuesta aquí..."
              value={respuesta}
              onChange={setRespuesta}
              disabled={cargando}
            />
          ) : (
            <textarea
              className="campo campo-respuesta"
              placeholder="Escribe tu respuesta aquí..."
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              disabled={cargando}
            />
          )}
          {item.pista && (
            <div className="flashcard-pista">
              <button
                type="button"
                className="btn-pista"
                onClick={() => { setPistaUsada(true); setVerPista((v) => !v); }}
                aria-expanded={verPista}
              >
                <span className={`pista-chevron ${verPista ? 'abierto' : ''}`} aria-hidden="true">▸</span>
                {verPista ? 'Ocultar pista' : '¿Necesitas una pista?'}
              </button>
              {verPista && <p className="pista-texto">{item.pista_es ?? item.pista}</p>}
            </div>
          )}

          {cargando ? (
            <div className="evaluando" aria-live="polite">
              <span>Analizando tu respuesta con IA</span>
              <span className="evaluando-puntos"><span /><span /><span /></span>
            </div>
          ) : (
            <button
              type="submit"
              className="btn-primario btn-ancho"
              disabled={!respuesta.trim()}
            >
              Evaluar respuesta
            </button>
          )}
        </form>
      ) : (
        <div className="resultado-espacio">
          {/* Estado amigable */}
          <div className={`resultado-estado estado-${estado.clave}`}>
            <span className="resultado-estado-icono">{estado.icono}</span>
            <div className="resultado-estado-texto">
              <p className="resultado-estado-titulo">{estado.titulo}</p>
              <p className="resultado-estado-sub">{estado.sub}</p>
            </div>
            <span className="resultado-estado-pct">{Math.round(puntaje * 100)}%</span>
          </div>

          <SemanticBar puntaje={puntaje} titulo="Precisión de tu respuesta" />

          {/* Retroalimentación estructurada y amigable */}
          {partes && (partes.diagnostico || partes.explicacion || partes.ejemplo) ? (
            <div className="bloque-retroalimentacion">
              {partes.diagnostico && (
                <div className="feedback-item">
                  <span className="feedback-item-titulo">Qué pasó</span>
                  <p className="feedback-item-texto">{partes.diagnostico}</p>
                </div>
              )}
              {partes.explicacion && (
                <div className="feedback-item">
                  <span className="feedback-item-titulo">Tu punto de mejora</span>
                  <p className="feedback-item-texto">{partes.explicacion}</p>
                </div>
              )}
              {partes.ejemplo && (
                <div className="feedback-item">
                  <span className="feedback-item-titulo">Ejemplo</span>
                  <p className="feedback-item-texto">{partes.ejemplo}</p>
                </div>
              )}
            </div>
          ) : resultado.feedback && (
            <div className="bloque-retroalimentacion">
              <p className="feedback-item-texto">{resultado.feedback}</p>
            </div>
          )}

          {/* Respuesta esperada */}
          <details className="bloque-referencia-desplegable">
            <summary>Ver respuesta esperada</summary>
            <p className="bloque-referencia">{resultado.reference_answer}</p>
          </details>

          {/* Próximo repaso (amigable, sin jerga) */}
          {proximaFecha && (
            <p className="proximo-repaso">
              Volverás a ver esta pregunta el <strong>{proximaFecha}</strong>
            </p>
          )}

          <button onClick={handleSiguiente} className="btn-primario btn-ancho">
            Siguiente pregunta
          </button>
        </div>
      )}
    </div>
  );
}
