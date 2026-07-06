'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/services/api';

export default function PaginaInicioSesion() {
  const [usuario,  setUsuario]  = useState('');
  const [clave,    setClave]    = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error,    setError]    = useState('');
  const [cargando, setCargando] = useState(false);
  const { setAuth } = useAuthStore();
  const router      = useRouter();

  async function handleEnviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { data } = await api.post('/auth/login', { username: usuario, password: clave });
      setAuth(data.token, data.user);
      // Si todavía tiene la contraseña por defecto, se le ofrece cambiarla.
      if (data.user.mustChangePassword) {
        router.push('/cambiar-clave');
      } else {
        router.push(data.user.role === 'docente' ? '/teacher' : '/student');
      }
    } catch (err) {
      setError(err.response?.data?.error ?? 'Credenciales incorrectas. Verifica tus datos.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="pagina-login">
      <div className="login-contenedor">
        <div className="login-cabecera">
          <img src="/logo-jireh.png" alt="Logo Liceo JIREH" className="login-logo" />
          <p className="login-institucion">Liceo JIREH, La Unión, Zacapa</p>
          <h1 className="login-titulo">AdaptaJIREH</h1>
          <p className="login-subtitulo">Sistema de aprendizaje adaptativo con IA</p>
        </div>

        <div className="tarjeta">
          <form onSubmit={handleEnviar} className="login-formulario">
            <div>
              <label className="etiqueta" htmlFor="usuario">Usuario</label>
              <input
                id="usuario"
                type="text"
                className="campo"
                autoComplete="username"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="etiqueta" htmlFor="clave">Contraseña</label>
              <div className="campo-clave">
                <input
                  id="clave"
                  type={verClave ? 'text' : 'password'}
                  className="campo"
                  autoComplete="current-password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-ver-clave"
                  onClick={() => setVerClave((v) => !v)}
                  aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={verClave}
                  title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {verClave ? (
                    // Ojo tachado (ocultar)
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                         aria-hidden="true">
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    // Ojo abierto (mostrar)
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                         aria-hidden="true">
                      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p className="alerta-error">{error}</p>}

            <button type="submit" className="btn-primario btn-ancho" disabled={cargando}>
              {cargando ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="login-nota">
          El sistema identifica tu rol automáticamente al iniciar sesión.
        </p>
      </div>
    </main>
  );
}
