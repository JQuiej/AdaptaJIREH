'use client';

const NIVELES = {
  1: { nombre: 'Recordar',   clase: 'bloom-1' },
  2: { nombre: 'Comprender', clase: 'bloom-2' },
  3: { nombre: 'Aplicar',    clase: 'bloom-3' },
  4: { nombre: 'Analizar',   clase: 'bloom-4' },
};

export default function BloomBadge({ nivel }) {
  const def = NIVELES[nivel] ?? { nombre: 'Nivel ' + nivel, clase: 'bloom-2' };
  return (
    <span className={`insignia-bloom ${def.clase}`}>
      Bloom {nivel} — {def.nombre}
    </span>
  );
}
