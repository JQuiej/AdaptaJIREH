'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/services/api';

export default function PaginaInicioSesion() {
  const [usuario,  setUsuario]  = useState('');
  const [clave,    setClave]    = useState('');
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
      router.push(data.user.role === 'docente' ? '/teacher' : '/student');
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
                placeholder="ej. est001 o docente01"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="etiqueta" htmlFor="clave">Contraseña</label>
              <input
                id="clave"
                type="password"
                className="campo"
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required
              />
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
