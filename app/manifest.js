// Manifest PWA. Next.js lo expone en /manifest.webmanifest automáticamente.
// El service worker (public/sw.js) añade push + soporte offline: la app se
// puede instalar y permite leer apuntes y ver el dashboard sin conexión.
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
