'use client';

function fmt(fecha, opts) {
  // Parsear como fecha LOCAL para evitar el corrimiento de zona horaria
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-GT', opts);
}

export default function ForecastCalendar({ dias }) {
  if (!dias || dias.length === 0) return null;

  const manana = dias[1];
  const avisoManana = !manana || manana.count === 0
    ? 'Mañana no tienes repasos programados.'
    : `Mañana te tocan ${manana.count} ítem${manana.count !== 1 ? 's' : ''}.`;

  return (
    <section className="tarjeta">
      <p className="titulo-seccion">Tu plan de repasos</p>

      <p className="aviso-manana">{avisoManana}</p>

      <div className="calendario-mini">
        {dias.map((d, i) => {
          const nivel = d.count === 0 ? 'vacio' : d.count <= 5 ? 'bajo' : d.count <= 12 ? 'medio' : 'alto';
          return (
            <div key={d.fecha} className={`calendario-dia ${i === 0 ? 'es-hoy' : ''}`}>
              <span className="calendario-dow">
                {i === 0 ? 'Hoy' : fmt(d.fecha, { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="calendario-num">{fmt(d.fecha, { day: 'numeric' })}</span>
              <span className={`calendario-conteo conteo-${nivel}`}>
                {d.count > 0 ? d.count : '–'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
