'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuthStore } from '@/store/authStore';
import { rutaPorRol } from '@/lib/rutas';
import api from '@/services/api';

export default function PaginaCambiarClave() {
  const { user }        = useAuthGuard();
  const { updateUser }  = useAuthStore();
  const router          = useRouter();

  const [nueva,     setNueva]     = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [ver,       setVer]       = useState(false);
  const [error,     setError]     = useState('');
  const [cargando,  setCargando]  = useState(false);

  // Si llegó aquí por tener la contraseña por defecto, mostramos el aviso y la
  // opción de mantenerla. Si entró voluntariamente, es solo cambio de clave.
  const porDefecto = user?.mustChangePassword;

  const destino = () => rutaPorRol(user?.role);

  async function cambiar(e) {
    e.preventDefault();
    setError('');
    if (nueva.length < 4) { setError('La contraseña debe tener al menos 4 caracteres.'); return; }
    if (nueva !== confirmar) { setError('Las contraseñas no coinciden.'); return; }
    setCargando(true);
    try {
      await api.post('/auth/change-password', { newPassword: nueva });
      updateUser({ mustChangePassword: false });
      router.push(destino());
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo cambiar la contraseña.');
      setCargando(false);
    }
  }

  async function mantener() {
    setCargando(true);
    try {
      await api.post('/auth/change-password', { keep: true });
    } catch { /* aunque falle, dejamos continuar */ }
    updateUser({ mustChangePassword: false });
    router.push(destino());
  }

  if (!user) return null;

  return (
    <main className="pagina-login">
      <div className="login-contenedor">
        <div className="login-cabecera">
          <img src="/logo-jireh.png" alt="Logo Liceo JIREH" className="login-logo" />
          <h1 className="login-titulo">
            {porDefecto ? 'Cambia tu contraseña' : 'Cambiar contraseña'}
          </h1>
          <p className="login-subtitulo">
            {porDefecto
              ? 'Estás usando la contraseña por defecto. Puedes cambiarla por una tuya o mantener la actual.'
              : 'Escribe una nueva contraseña para tu cuenta.'}
          </p>
        </div>

        <div className="tarjeta">
          <form onSubmit={cambiar} className="login-formulario">
            <div>
              <label className="etiqueta" htmlFor="nueva">Nueva contraseña</label>
              <div className="campo-clave">
                <input
                  id="nueva"
                  type={ver ? 'text' : 'password'}
                  className="campo"
                  autoComplete="new-password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-ver-clave"
                  onClick={() => setVer((v) => !v)}
                  aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {ver ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div>
              <label className="etiqueta" htmlFor="confirmar">Confirmar contraseña</label>
              <input
                id="confirmar"
                type={ver ? 'text' : 'password'}
                className="campo"
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
              />
            </div>

            {error && <p className="alerta-error">{error}</p>}

            <button type="submit" className="btn-primario btn-ancho" disabled={cargando}>
              {cargando ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>

            {porDefecto && (
              <button
                type="button"
                className="btn-secundario btn-ancho"
                onClick={mantener}
                disabled={cargando}
              >
                Mantener la contraseña actual
              </button>
            )}
            {!porDefecto && (
              <button
                type="button"
                className="btn-secundario btn-ancho"
                onClick={() => router.push(destino())}
                disabled={cargando}
              >
                Cancelar
              </button>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
