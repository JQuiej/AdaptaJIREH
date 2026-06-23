'use client';

export default function SemanticBar({ puntaje, titulo = 'Evaluación de la respuesta' }) {
  const pct   = Math.round((puntaje ?? 0) * 100);
  const nivel = puntaje >= 0.71 ? 'alto' : puntaje >= 0.41 ? 'medio' : 'bajo';
  const etiqueta = nivel === 'alto' ? 'Correcto' : nivel === 'medio' ? 'Parcial' : 'Incorrecto';

  return (
    <div className="barra-sst">
      <div className="barra-sst-cabecera">
        <span className="barra-sst-etiqueta">{titulo}</span>
        <span className={`barra-sst-valor sst-valor-${nivel}`}>
          {pct}% — {etiqueta}
        </span>
      </div>
      <div className="barra-sst-fondo">
        <div
          className={`barra-sst-relleno sst-${nivel}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
