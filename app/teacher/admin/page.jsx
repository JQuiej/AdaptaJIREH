'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import api from '@/services/api';

export default function PaginaAdmin() {
  const { user } = useAuthGuard('docente');
  const router   = useRouter();

  const [estudiantes, setEstudiantes] = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [error,       setError]       = useState('');

  // Formulario de alta.
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [nuevoGrado,   setNuevoGrado]   = useState('5to Bachillerato');
  const [nuevaClave,   setNuevaClave]   = useState('');
  const [creando,      setCreando]      = useState(false);

  // Aviso con la contraseña asignada tras crear o restablecer.
  const [aviso, setAviso] = useState(null); // { usuario, password }

  // Edición inline por fila.
  const [editId,     setEditId]     = useState(null);
  const [editUser,   setEditUser]   = useState('');
  const [editGrado,  setEditGrado]  = useState('');
  const [guardando,  setGuardando]  = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get('/admin/students');
      setEstudiantes(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudieron cargar los estudiantes.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function crear(e) {
    e.preventDefault();
    const username = nuevoUsuario.trim();
    if (!username) return;
    setCreando(true);
    setError('');
    setAviso(null);
    try {
      const { data } = await api.post('/admin/students', {
        username,
        grado:    nuevoGrado.trim() || null,
        password: nuevaClave.trim() || undefined,
      });
      setAviso({ usuario: data.student.username, password: data.password, titulo: 'Estudiante creado' });
      setNuevoUsuario('');
      setNuevaClave('');
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo crear el estudiante.');
    } finally {
      setCreando(false);
    }
  }

  async function restablecer(est) {
    if (!confirm(`¿Restablecer la contraseña de «${est.username}» a la contraseña por defecto?`)) return;
    setError('');
    setAviso(null);
    try {
      const { data } = await api.post(`/admin/students/${est.id}/reset-password`, {});
      setAviso({ usuario: est.username, password: data.password, titulo: 'Contraseña restablecida' });
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo restablecer la contraseña.');
    }
  }

  async function eliminar(est) {
    if (!confirm(
      `¿Eliminar a «${est.username}»?\n\nSe borrará su cuenta y todo su avance ` +
      `(respuestas, programaciones de repaso, inscripciones). Esta acción no se puede deshacer.`
    )) return;
    setError('');
    try {
      await api.delete(`/admin/students/${est.id}`);
      setEstudiantes((prev) => prev.filter((e) => e.id !== est.id));
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar el estudiante.');
    }
  }

  function abrirEdicion(est) {
    setEditId(est.id);
    setEditUser(est.username);
    setEditGrado(est.grado ?? '');
    setAviso(null);
  }

  async function guardarEdicion(est) {
    setGuardando(true);
    setError('');
    try {
      const { data } = await api.patch(`/admin/students/${est.id}`, {
        username: editUser.trim(),
        grado:    editGrado.trim() || null,
      });
      setEstudiantes((prev) => prev.map((e) => (e.id === est.id ? { ...e, ...data } : e)));
      setEditId(null);
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  }

  if (!user) return null;

  return (
    <div className="pagina">
      <header className="encabezado">
        <button onClick={() => router.push('/teacher')} className="enlace-volver">
          Volver al panel
        </button>
        <span className="titulo-pagina">Administrar usuarios</span>
      </header>

      <main style={{ maxWidth: '44rem', margin: '0 auto', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <p className="alerta-error">{error}</p>}

        {/* Aviso de contraseña asignada */}
        {aviso && (
          <div className="tarjeta admin-aviso">
            <p style={{ fontWeight: 600, color: 'var(--gris-800)' }}>{aviso.titulo}</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--gris-600)', margin: '0.5rem 0' }}>
              Comparte estas credenciales con el estudiante. Se le pedirá cambiar la contraseña al iniciar sesión.
            </p>
            <div className="admin-credenciales">
              <span>Usuario: <strong>{aviso.usuario}</strong></span>
              <span>Contraseña: <strong>{aviso.password}</strong></span>
            </div>
            <button className="btn-secundario" style={{ marginTop: '0.75rem' }} onClick={() => setAviso(null)}>
              Entendido
            </button>
          </div>
        )}

        {/* Alta de estudiante */}
        <section className="tarjeta">
          <p className="titulo-seccion" style={{ marginTop: 0 }}>Crear estudiante</p>
          <form onSubmit={crear} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label className="etiqueta">Nombre de usuario</label>
              <input
                className="campo"
                placeholder="ej. est043"
                value={nuevoUsuario}
                onChange={(e) => setNuevoUsuario(e.target.value)}
                required
              />
            </div>
            <div className="cuadricula-form-2">
              <div>
                <label className="etiqueta">Grado</label>
                <input
                  className="campo"
                  placeholder="ej. 5to Bachillerato"
                  value={nuevoGrado}
                  onChange={(e) => setNuevoGrado(e.target.value)}
                />
              </div>
              <div>
                <label className="etiqueta">Contraseña (opcional)</label>
                <input
                  className="campo"
                  placeholder="Por defecto: jireh2024"
                  value={nuevaClave}
                  onChange={(e) => setNuevaClave(e.target.value)}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', margin: 0 }}>
              Si dejas la contraseña vacía se asigna la contraseña por defecto y se
              inscribe automáticamente al alumno en las materias activas.
            </p>
            <button type="submit" className="btn-primario" disabled={creando || !nuevoUsuario.trim()}>
              {creando ? 'Creando...' : 'Crear estudiante'}
            </button>
          </form>
        </section>

        {/* Lista de estudiantes */}
        <section>
          <p className="titulo-seccion">
            Estudiantes {!cargando && `(${estudiantes.length})`}
          </p>

          {cargando ? (
            <div className="tarjeta-vacia">Cargando...</div>
          ) : estudiantes.length === 0 ? (
            <div className="tarjeta-vacia">Aún no hay estudiantes.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {estudiantes.map((est) => (
                <div key={est.id} className="tarjeta admin-fila">
                  {editId === est.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                      <input
                        className="campo"
                        value={editUser}
                        onChange={(e) => setEditUser(e.target.value)}
                        placeholder="Nombre de usuario"
                      />
                      <input
                        className="campo"
                        value={editGrado}
                        onChange={(e) => setEditGrado(e.target.value)}
                        placeholder="Grado"
                      />
                      <div className="admin-acciones">
                        <button className="btn-primario" onClick={() => guardarEdicion(est)} disabled={guardando || !editUser.trim()}>
                          {guardando ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button className="btn-secundario" onClick={() => setEditId(null)} disabled={guardando}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="admin-info">
                        <p className="admin-nombre">
                          {est.username}
                          {est.mustChangePassword && (
                            <span className="admin-badge" title="Aún tiene la contraseña por defecto">
                              clave por defecto
                            </span>
                          )}
                        </p>
                        <p className="admin-detalle">
                          {est.codigo}{est.grado ? ` · ${est.grado}` : ''}
                        </p>
                      </div>
                      <div className="admin-acciones">
                        <button className="btn-secundario" onClick={() => restablecer(est)}>Restablecer clave</button>
                        <button className="btn-secundario" onClick={() => abrirEdicion(est)}>Editar</button>
                        <button
                          className="btn-secundario"
                          style={{ color: 'var(--peligro)', borderColor: 'var(--peligro)' }}
                          onClick={() => eliminar(est)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
