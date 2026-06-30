'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

// Convierte la clave VAPID (base64url) al formato que espera pushManager.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PanelRacha() {
  const [racha,  setRacha]  = useState(null);
  const [config, setConfig] = useState({ activo: true, hora: 19 });
  const [cargando, setCargando] = useState(true);

  // Estado del push en ESTE dispositivo
  const [soportado,  setSoportado]  = useState(true);
  const [suscrito,   setSuscrito]   = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [aviso,      setAviso]      = useState('');

  const cargar = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api.get('/student/streak'),
        api.get('/student/notifications'),
      ]);
      setRacha(r.data);
      setConfig(c.data);
    } catch { /* interceptor maneja 401 */ }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Detectar soporte y si ya está suscrito en este dispositivo
  useEffect(() => {
    const ok = typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
    setSoportado(ok);
    if (!ok) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.pushManager.getSubscription().then((sub) => setSuscrito(!!sub));
    });
  }, []);

  async function guardarConfig(cambios) {
    const nuevo = { ...config, ...cambios };
    setConfig(nuevo);
    try { await api.put('/student/notifications', cambios); } catch { /* no-op */ }
  }

  async function activarEnEsteDispositivo() {
    setProcesando(true);
    setAviso('');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setAviso('Permiso de notificaciones denegado. Actívalo en los ajustes del navegador.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const { data } = await api.get('/push/public-key');
      if (!data.key) {
        setAviso('Las notificaciones aún no están configuradas en el servidor (falta VAPID).');
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
      await api.post('/push/subscribe', { subscription: sub.toJSON() });
      setSuscrito(true);
      setAviso('¡Listo! Recibirás recordatorios en este dispositivo.');
    } catch (e) {
      setAviso('No se pudo activar las notificaciones en este dispositivo.');
    } finally {
      setProcesando(false);
    }
  }

  async function desactivarEnEsteDispositivo() {
    setProcesando(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setSuscrito(false);
      setAviso('Notificaciones desactivadas en este dispositivo.');
    } catch { /* no-op */ }
    finally { setProcesando(false); }
  }

  if (cargando || !racha) {
    return <div className="esqueleto-tarjeta" />;
  }

  const pct = racha.goal > 0 ? Math.min(100, Math.round((racha.todayCount / racha.goal) * 100)) : 0;

  return (
    <section className="tarjeta tarjeta-racha">
      <div className="racha-cabecera">
        <div className="racha-fuego">
          <span className={`racha-icono ${racha.current > 0 ? 'racha-activa' : ''}`}>🔥</span>
          <div>
            <p className="racha-numero">{racha.current}</p>
            <p className="racha-etiqueta">día{racha.current !== 1 ? 's' : ''} de racha</p>
          </div>
        </div>
        <span className="racha-mejor">Mejor: {racha.best}</span>
      </div>

      {/* Progreso de hoy */}
      <div className="racha-progreso">
        <div className="racha-progreso-texto">
          {racha.todayMet
            ? '✓ ¡Sesión de hoy completada! Tu racha está a salvo.'
            : `Hoy llevas ${racha.todayCount} de ${racha.goal} ítems para mantener tu racha.`}
        </div>
        <div className="barra-sesion-fondo" style={{ borderRadius: 'var(--radio-full)' }}>
          <div
            className="barra-sesion-relleno"
            style={{ width: `${pct}%`, borderRadius: 'var(--radio-full)',
                     background: racha.todayMet ? 'var(--exito-relleno)' : 'var(--primario)' }}
          />
        </div>
      </div>

      {/* Recordatorios */}
      <div className="racha-recordatorios">
        <label className="racha-toggle">
          <input
            type="checkbox"
            checked={config.activo}
            onChange={(e) => guardarConfig({ activo: e.target.checked })}
          />
          <span>Recordatorio diario (1:00 pm)</span>
        </label>

        {!soportado ? (
          <p className="racha-aviso">Este navegador no soporta notificaciones push.</p>
        ) : suscrito ? (
          <button className="btn-secundario btn-ancho" onClick={desactivarEnEsteDispositivo} disabled={procesando}>
            {procesando ? 'Procesando…' : 'Desactivar en este dispositivo'}
          </button>
        ) : (
          <button className="btn-primario btn-ancho" onClick={activarEnEsteDispositivo} disabled={procesando}>
            {procesando ? 'Procesando…' : 'Activar notificaciones en este dispositivo'}
          </button>
        )}

        {aviso && <p className="racha-aviso">{aviso}</p>}
      </div>
    </section>
  );
}
