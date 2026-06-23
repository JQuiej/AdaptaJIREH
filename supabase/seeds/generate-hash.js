/**
 * Genera el hash bcryptjs de la contraseña inicial.
 * Ejecutar: node supabase/seeds/generate-hash.js
 * Luego copiar el hash en initial_data.sql
 */
const bcrypt = require('bcryptjs');

async function main() {
  const password = 'jireh2024';
  const hash = await bcrypt.hash(password, 10);
  console.log('Contraseña:', password);
  console.log('Hash bcryptjs:', hash);
  console.log('\nCopia este hash en supabase/seeds/initial_data.sql');
  console.log('Reemplaza: $2a$10$YourHashHere');
}

main();
