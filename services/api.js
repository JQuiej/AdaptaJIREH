import axios from 'axios';

/**
 * Borra el caché offline con datos personales (APIs y páginas cacheadas por el
 * service worker). Se llama al cerrar sesión o al expirar el token, para que
 * otro usuario del mismo dispositivo no vea datos del anterior.
 */
export function limpiarCacheOffline() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ tipo: 'LIMPIAR_CACHE' });
  } catch { /* no crítico */ }
}

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(localStorage.getItem('adaptajireh-auth') ?? '{}');
      const token = stored?.state?.token;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch { /* no-op */ }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('adaptajireh-auth');
      limpiarCacheOffline();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
