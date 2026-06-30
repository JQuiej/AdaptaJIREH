import webpush from 'web-push';
import { supabase } from './supabase';

let configurado = false;

function configurar() {
  if (configurado) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:admin@adaptajireh.edu',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configurado = true;
  return true;
}

/**
 * Envía una notificación push a todas las suscripciones de un alumno.
 * Limpia automáticamente las suscripciones expiradas (404/410).
 * @returns {Promise<number>} cantidad de envíos exitosos
 */
export async function enviarPushAUsuario(studentId, payload) {
  if (!configurar()) {
    console.warn('[push] VAPID no configurado; no se envía.');
    return 0;
  }

  const { data: subs } = await supabase
    .from('push_subscription')
    .select('id_subscription, endpoint, p256dh, auth')
    .eq('id_usuario', studentId);

  if (!subs?.length) return 0;

  const cuerpo = JSON.stringify(payload);
  let enviados = 0;

  await Promise.all(
    subs.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(sub, cuerpo);
        enviados++;
      } catch (err) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          // Suscripción muerta: eliminarla.
          await supabase.from('push_subscription').delete().eq('id_subscription', s.id_subscription);
        } else {
          console.warn('[push] error al enviar:', code, err?.message);
        }
      }
    })
  );

  return enviados;
}
