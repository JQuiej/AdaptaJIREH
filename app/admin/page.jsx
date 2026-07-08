'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useAuthStore } from '@/store/authStore';
import api, { limpiarCacheOffline } from '@/services/api';

export default function PaginaAdministrador() {
  const { user, hasHydrated } = useAuthGuard('administrador');
  const { clearAuth }         = useAuthStore();
  const router                = useRouter();

  const [usuarios, setUsuarios] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState('');
  const [aviso,    setAviso]    = useState(null); // { titulo, usuario, password, extra }

  // Alta de usuario.
  const [rol,        setRol]        = useState('estudiante');
  const [nUsuario,   setNUsuario]   = useState('');
  const [nGrado,     setNGrado]     = useState('5to Bachillerato');
  const [nClave,     setNClave]     = useState('');
  const [nMaterias,  setNMaterias]  = useState([]); // ids seleccionados
  const [creando,    setCreando]    = useState(false);

  // Gestión de materias por estudiante.
  const [gestMateriasDe, setGestMateriasDe] = useState(null); // usuario o null
  const [inscritas,      setInscritas]      = useState([]);   // ids
  const [procesandoMat,  setProcesandoMat]  = useState(null); // materiaId en curso

  // Edición inline.
  const [editId,    setEditId]    = useState(null);
  const [editUser,  setEditUser]  = useState('');
  const [editGrado, setEditGrado] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [u, m] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/subjects'),
      ]);
      setUsuarios(u.data);
      setMaterias(m.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudieron cargar los datos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { if (hasHydrated && user) cargar(); }, [hasHydrated, user, cargar]);

  async function cerrarSesion() {
    await api.post('/auth/logout').catch(() => {});
    limpiarCacheOffline();
    clearAuth();
    router.push('/login');
  }

  function toggleNMateria(id) {
    setNMaterias((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function crear(e) {
    e.preventDefault();
    const username = nUsuario.trim();
    if (!username) return;
    setCreando(true);
    setError('');
    setAviso(null);
    try {
      const { data } = await api.post('/admin/users', {
        role:      rol,
        username,
        grado:     rol === 'estudiante' ? (nGrado.trim() || null) : undefined,
        password:  nClave.trim() || undefined,
        materiaIds: rol === 'estudiante' && nMaterias.length ? nMaterias : undefined,
      });
      setAviso({
        titulo:   rol === 'docente' ? 'Docente creado' : 'Estudiante creado',
        usuario:  data.user.username,
        password: data.password,
        extra: rol === 'estudiante'
          ? `Inscrito en ${data.user.materias} materia(s) · ${data.itemsAsignados} ítems asignados para repaso`
          : null,
      });
      setNUsuario('');
      setNClave('');
      setNMaterias([]);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo crear el usuario.');
    } finally {
      setCreando(false);
    }
  }

  async function restablecer(u) {
    if (!confirm(`¿Restablecer la contraseña de «${u.username}» a la contraseña por defecto?`)) return;
    setError(''); setAviso(null);
    try {
      const { data } = await api.post(`/admin/users/${u.id}/reset-password`, {});
      setAviso({ titulo: 'Contraseña restablecida', usuario: u.username, password: data.password });
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo restablecer la contraseña.');
    }
  }

  async function eliminar(u) {
    const advertencia = u.role === 'docente'
      ? `¿Eliminar al docente «${u.username}»?\n\nSus materias quedarán sin docente asignado.`
      : `¿Eliminar a «${u.username}»?\n\nSe borrará su cuenta y todo su avance (respuestas, repasos, inscripciones).`;
    if (!confirm(`${advertencia}\n\nEsta acción no se puede deshacer.`)) return;
    setError('');
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsuarios((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar el usuario.');
    }
  }

  function abrirEdicion(u) {
    setEditId(u.id); setEditUser(u.username); setEditGrado(u.grado ?? ''); setAviso(null);
  }

  async function guardarEdicion(u) {
    setGuardando(true); setError('');
    try {
      const { data } = await api.patch(`/admin/users/${u.id}`, {
        username: editUser.trim(),
        grado:    u.role === 'estudiante' ? (editGrado.trim() || null) : undefined,
      });
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...data } : x)));
      setEditId(null);
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  }

  async function abrirMaterias(u) {
    setGestMateriasDe(u); setInscritas([]); setError('');
    try {
      const { data } = await api.get(`/admin/users/${u.id}/enrollments`);
      setInscritas(data);
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudieron cargar las materias del estudiante.');
    }
  }

  async function toggleMateria(materiaId) {
    if (!gestMateriasDe) return;
    const yaInscrito = inscritas.includes(materiaId);
    setProcesandoMat(materiaId); setError('');
    try {
      if (yaInscrito) {
        await api.delete(`/admin/users/${gestMateriasDe.id}/enrollments?materiaId=${materiaId}`);
        setInscritas((prev) => prev.filter((x) => x !== materiaId));
      } else {
        const { data } = await api.post(`/admin/users/${gestMateriasDe.id}/enrollments`, { materiaId });
        setInscritas((prev) => [...prev, materiaId]);
        setAviso({ titulo: 'Materia asignada', usuario: gestMateriasDe.username, extra: data.message });
      }
      // Actualizar el conteo de materias en la lista.
      setUsuarios((prev) => prev.map((x) =>
        x.id === gestMateriasDe.id
          ? { ...x, materias: (x.materias ?? 0) + (yaInscrito ? -1 : 1) }
          : x
      ));
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar la materia.');
    } finally {
      setProcesandoMat(null);
    }
  }

  if (!user) return null;

  const docentes    = usuarios.filter((u) => u.role === 'docente');
  const estudiantes = usuarios.filter((u) => u.role === 'estudiante');

  return (
    <div className="pagina">
      <header className="encabezado">
        <span className="titulo-pagina">Administración</span>
        <button onClick={cerrarSesion} className="btn-secundario" style={{ fontSize: '0.8125rem' }}>
          Cerrar sesión
        </button>
      </header>

      <main style={{ maxWidth: '46rem', margin: '0 auto', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <p className="alerta-error">{error}</p>}

        {aviso && (
          <div className="tarjeta admin-aviso">
            <p style={{ fontWeight: 600, color: 'var(--gris-800)' }}>{aviso.titulo}</p>
            {aviso.password && (
              <>
                <p style={{ fontSize: '0.875rem', color: 'var(--gris-600)', margin: '0.5rem 0' }}>
                  Comparte estas credenciales. Se le pedirá cambiar la contraseña al iniciar sesión.
                </p>
                <div className="admin-credenciales">
                  <span>Usuario: <strong>{aviso.usuario}</strong></span>
                  <span>Contraseña: <strong>{aviso.password}</strong></span>
                </div>
              </>
            )}
            {aviso.extra && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--gris-600)', margin: '0.5rem 0 0' }}>{aviso.extra}</p>
            )}
            <button className="btn-secundario" style={{ marginTop: '0.75rem' }} onClick={() => setAviso(null)}>
              Entendido
            </button>
          </div>
        )}

        {/* ── Alta de usuario ── */}
        <section className="tarjeta">
          <p className="titulo-seccion" style={{ marginTop: 0 }}>Crear usuario</p>

          <div className="admin-tabs" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={rol === 'estudiante' ? 'btn-primario' : 'btn-secundario'}
              onClick={() => setRol('estudiante')}
            >Estudiante</button>
            <button
              type="button"
              className={rol === 'docente' ? 'btn-primario' : 'btn-secundario'}
              onClick={() => setRol('docente')}
            >Docente</button>
          </div>

          <form onSubmit={crear} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label className="etiqueta">Nombre de usuario</label>
              <input className="campo" placeholder={rol === 'docente' ? 'ej. profe.mate' : 'ej. est043'}
                value={nUsuario} onChange={(e) => setNUsuario(e.target.value)} required />
            </div>

            <div className="cuadricula-form-2">
              {rol === 'estudiante' && (
                <div>
                  <label className="etiqueta">Grado</label>
                  <input className="campo" placeholder="ej. 5to Bachillerato"
                    value={nGrado} onChange={(e) => setNGrado(e.target.value)} />
                </div>
              )}
              <div>
                <label className="etiqueta">Contraseña (opcional)</label>
                <input className="campo" placeholder="Por defecto: jireh2024"
                  value={nClave} onChange={(e) => setNClave(e.target.value)} />
              </div>
            </div>

            {rol === 'estudiante' && (
              <div>
                <label className="etiqueta">Materias a asignar</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--gris-400)', margin: '0 0 0.5rem' }}>
                  Al asignar una materia se le dan todos sus ítems para repaso. Si no marcas
                  ninguna, se le inscribe en todas las materias activas.
                </p>
                <div className="admin-materias-grid">
                  {materias.map((m) => (
                    <label key={m.id} className={`admin-materia-chip ${nMaterias.includes(m.id) ? 'activa' : ''}`}>
                      <input type="checkbox" checked={nMaterias.includes(m.id)}
                        onChange={() => toggleNMateria(m.id)} />
                      <span>{m.nombre}{!m.activa && ' (inactiva)'}</span>
                    </label>
                  ))}
                  {materias.length === 0 && <span style={{ fontSize: '0.8125rem', color: 'var(--gris-400)' }}>No hay materias.</span>}
                </div>
              </div>
            )}

            <button type="submit" className="btn-primario" disabled={creando || !nUsuario.trim()}>
              {creando ? 'Creando...' : `Crear ${rol}`}
            </button>
          </form>
        </section>

        {/* ── Docentes ── */}
        <ListaUsuarios
          titulo="Docentes" cargando={cargando} lista={docentes}
          {...{ editId, editUser, setEditUser, editGrado, setEditGrado, guardando,
                abrirEdicion, guardarEdicion, setEditId, restablecer, eliminar }}
        />

        {/* ── Estudiantes ── */}
        <ListaUsuarios
          titulo="Estudiantes" cargando={cargando} lista={estudiantes} conMaterias
          onMaterias={abrirMaterias}
          {...{ editId, editUser, setEditUser, editGrado, setEditGrado, guardando,
                abrirEdicion, guardarEdicion, setEditId, restablecer, eliminar }}
        />
      </main>

      {/* ── Modal: materias de un estudiante ── */}
      {gestMateriasDe && (
        <div className="modal-fondo" onClick={() => setGestMateriasDe(null)}>
          <div className="modal-caja" onClick={(e) => e.stopPropagation()}>
            <p className="titulo-seccion" style={{ marginTop: 0 }}>
              Materias de «{gestMateriasDe.username}»
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--gris-600)', margin: '0 0 1rem' }}>
              Marca para inscribir (se asignan sus ítems) o desmarca para quitar
              (se borra el avance del alumno en esa materia).
            </p>
            <div className="admin-materias-grid">
              {materias.map((m) => {
                const puesto = inscritas.includes(m.id);
                return (
                  <label key={m.id} className={`admin-materia-chip ${puesto ? 'activa' : ''}`}>
                    <input type="checkbox" checked={puesto}
                      disabled={procesandoMat === m.id}
                      onChange={() => toggleMateria(m.id)} />
                    <span>{m.nombre}{procesandoMat === m.id ? '…' : ''}</span>
                  </label>
                );
              })}
            </div>
            <button className="btn-primario btn-ancho" style={{ marginTop: '1rem' }}
              onClick={() => setGestMateriasDe(null)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Lista reutilizable de usuarios (docentes o estudiantes).
function ListaUsuarios({
  titulo, cargando, lista, conMaterias = false, onMaterias,
  editId, editUser, setEditUser, editGrado, setEditGrado, guardando,
  abrirEdicion, guardarEdicion, setEditId, restablecer, eliminar,
}) {
  return (
    <section>
      <p className="titulo-seccion">{titulo} {!cargando && `(${lista.length})`}</p>
      {cargando ? (
        <div className="tarjeta-vacia">Cargando...</div>
      ) : lista.length === 0 ? (
        <div className="tarjeta-vacia">Aún no hay {titulo.toLowerCase()}.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {lista.map((u) => (
            <div key={u.id} className="tarjeta admin-fila">
              {editId === u.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                  <input className="campo" value={editUser}
                    onChange={(e) => setEditUser(e.target.value)} placeholder="Nombre de usuario" />
                  {u.role === 'estudiante' && (
                    <input className="campo" value={editGrado}
                      onChange={(e) => setEditGrado(e.target.value)} placeholder="Grado" />
                  )}
                  <div className="admin-acciones">
                    <button className="btn-primario" onClick={() => guardarEdicion(u)} disabled={guardando || !editUser.trim()}>
                      {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button className="btn-secundario" onClick={() => setEditId(null)} disabled={guardando}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="admin-info">
                    <p className="admin-nombre">
                      {u.username}
                      {u.mustChangePassword && (
                        <span className="admin-badge" title="Aún tiene la contraseña por defecto">clave por defecto</span>
                      )}
                    </p>
                    <p className="admin-detalle">
                      {u.codigo}
                      {u.grado ? ` · ${u.grado}` : ''}
                      {conMaterias ? ` · ${u.materias ?? 0} materia${(u.materias ?? 0) !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  <div className="admin-acciones">
                    {conMaterias && (
                      <button className="btn-secundario" onClick={() => onMaterias(u)}>Materias</button>
                    )}
                    <button className="btn-secundario" onClick={() => restablecer(u)}>Restablecer clave</button>
                    <button className="btn-secundario" onClick={() => abrirEdicion(u)}>Editar</button>
                    <button className="btn-secundario" style={{ color: 'var(--peligro)', borderColor: 'var(--peligro)' }}
                      onClick={() => eliminar(u)}>Eliminar</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
