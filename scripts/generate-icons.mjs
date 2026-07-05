/**
 * Genera los iconos PWA y de notificación a partir de public/logo-jireh.png.
 *
 * Corrige dos problemas en móvil:
 *   1) El icono instalado se veía mal porque el logo (fondo transparente)
 *      pegaba a los bordes y al recortarse como «maskable» perdía contenido.
 *      → Ahora va sobre fondo blanco sólido y con margen de seguridad.
 *   2) La notificación mostraba el icono en blanco. En iOS usa el icono de
 *      la app (ahora con fondo sólido) y en Android el «badge» monocromático
 *      (silueta blanca) que aquí se genera aparte.
 *
 * Ejecutar:  node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const LOGO   = path.join(PUBLIC, 'logo-jireh.png');
const BLANCO = { r: 255, g: 255, b: 255, alpha: 1 };

// Compone el logo centrado sobre un fondo blanco cuadrado, dejando `padPct`
// de margen en cada lado (para que respire y no lo recorte el sistema).
async function iconoConFondo(size, padPct, salida) {
  const inner = Math.round(size * (1 - padPct * 2));
  const logo = await sharp(LOGO)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const offset = Math.round((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: BLANCO } })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(path.join(PUBLIC, salida));

  console.log('✓', salida, `(${size}x${size}, margen ${Math.round(padPct * 100)}%)`);
}

// Badge monocromático para Android: silueta blanca de un libro abierto sobre
// fondo transparente. Android usa el canal alfa como máscara para teñirlo.
async function badgeMonocromatico(size, salida) {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
  <g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M48 26C41 20 32 18 22 18v46c10 0 19 2 26 8 7-6 16-8 26-8V18c-10 0-19 2-26 8Z"/>
    <path d="M48 26v46"/>
  </g>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(PUBLIC, salida));
  console.log('✓', salida, `(${size}x${size}, badge monocromático)`);
}

async function main() {
  // Iconos «any» / apple-touch: margen chico, se ven completos.
  await iconoConFondo(192, 0.08, 'icon-192.png');
  await iconoConFondo(512, 0.08, 'icon-512.png');
  await iconoConFondo(180, 0.08, 'apple-touch-icon.png');

  // Icono «maskable»: margen amplio para respetar la zona segura del recorte.
  await iconoConFondo(512, 0.20, 'icon-maskable-512.png');

  // Badge de notificación (Android).
  await badgeMonocromatico(96, 'badge-96.png');

  console.log('\nListo. Iconos regenerados en /public.');
}

main().catch((e) => { console.error(e); process.exit(1); });
