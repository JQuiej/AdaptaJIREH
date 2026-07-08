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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* no crítico */ });
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
