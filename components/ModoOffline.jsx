'use client';
import { useState, useEffect } from 'react';

/**
 * Soporte offline de la PWA:
 *  1. Registra el service worker al cargar la app (antes solo se registraba
 *     al activar notificaciones), para que el caché offline funcione desde
 *     la primera visita.
 *  2. Muestra un aviso fijo cuando el dispositivo pierde conexión, aclarando
 *     qué se puede hacer (leer apuntes) y qué no (responder repasos).
 */
export default function ModoOffline() {
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    // En DESARROLLO el service worker cachea los bundles de Next (cuyos nombres
    // no son estables como en producción) y termina sirviendo JS viejo → causa
    // errores de hidratación y de caché al editar el código. Por eso en dev NO
    // se registra: se desregistra el que hubiera y se limpian sus cachés para
    // trabajar siempre con el código fresco. En producción sí funciona la PWA.
    const esDesarrollo =
      process.env.NODE_ENV === 'development' ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname);

    if ('serviceWorker' in navigator) {
      if (esDesarrollo) {
        navigator.serviceWorker.getRegistrations()
          .then((regs) => regs.forEach((r) => r.unregister()))
          .catch(() => {});
        window.caches?.keys?.()
          .then((keys) => keys
            .filter((k) => k.startsWith('adaptajireh-'))
            .forEach((k) => caches.delete(k)))
          .catch(() => {});
      } else {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* no crítico */ });
      }
    }

    setSinConexion(!navigator.onLine);
    const on  = () => setSinConexion(false);
    const off = () => setSinConexion(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!sinConexion) return null;

  return (
    <div className="banner-offline" role="status">
      <span aria-hidden="true">📡</span>
      <span>
        Sin conexión — puedes <strong>leer tus apuntes</strong>; para responder
        repasos necesitas internet.
      </span>
    </div>
  );
}
