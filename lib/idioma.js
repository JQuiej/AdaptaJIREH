// Determina si una materia es de inglés (única materia donde se ofrece la
// traducción al español de los ítems, según el nivel de los alumnos).
// Compara el nombre normalizado (sin acentos ni mayúsculas).
export function esMateriaIngles(nombre) {
  const n = (nombre ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return n.includes('ingl') || n.includes('english');
}
