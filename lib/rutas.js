// Ruta principal (home) de cada rol. Se usa tras iniciar sesión, tras cambiar
// la contraseña y al redirigir cuando un rol accede a una página que no le
// corresponde.
export function rutaPorRol(role) {
  if (role === 'administrador') return '/admin';
  if (role === 'docente')       return '/teacher';
  return '/student';
}
