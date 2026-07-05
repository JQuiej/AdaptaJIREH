// Manifest PWA. Next.js lo expone en /manifest.webmanifest automáticamente.
// Prep para instalar la app más adelante (falta el service worker para que sea
// 100% PWA offline; eso se añade cuando se decida activarla).
export default function manifest() {
  return {
    name: 'AdaptaJIREH',
    short_name: 'AdaptaJIREH',
    description: 'Sistema de aprendizaje adaptativo con repetición espaciada — Liceo JIREH',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0284c7',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
