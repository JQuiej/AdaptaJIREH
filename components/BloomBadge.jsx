'use client';
import { bloomInfo } from '@/lib/bloom';

export default function BloomBadge({ nivel }) {
  const def = bloomInfo(nivel);
  const nombre = def?.corto ?? `Nivel ${nivel}`;
  const clase  = def?.clase ?? 'bloom-2';
  return (
    <span className={`insignia-bloom ${clase}`}>
      Bloom {nivel} — {nombre}
    </span>
  );
}
