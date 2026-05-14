const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const envText = fs.readFileSync('.env', 'utf-8');
  const line = envText.split('\n').find(l => l.startsWith('DATABASE_URL='));
  const dbUrl = line ? line.split('=').slice(1).join('=').trim().replace(/"/g, '') : '';
  
  const conn = await mysql.createConnection(dbUrl);
  const [keys] = await conn.execute('SHOW KEYS FROM appointments');
  console.log('Keys on appointments:');
  for (const k of keys) {
    console.log('  ' + k.Key_name + ' -> ' + k.Column_name + ' (seq=' + k.Seq_in_index + ')');
  }
  
  // Also check CREATE TABLE
  const [cols] = await conn.execute('SHOW COLUMNS FROM appointments');
  console.log('\nColumns:');
  for (const c of cols) {
    console.log('  ' + c.Field + ': Key=' + c.Key + ', Extra=' + c.Extra);
  }
  
  await conn.end();
}

main().catch(console.error);
