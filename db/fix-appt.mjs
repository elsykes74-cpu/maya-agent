
const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const envText = fs.readFileSync('.env', 'utf-8');
  const dbUrl = envText.split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=')[1].trim().replace(/"/g, '');

  const conn = await mysql.createConnection(dbUrl);

  // Check keys
  const [keys] = await conn.execute('SHOW KEYS FROM appointments');
  console.log('Keys on appointments:');
  for (const k of keys) {
    console.log('  ' + k.Key_name + ': ' + k.Column_name + ' (non_unique=' + k.Non_unique + ')');
  }

  // Check columns
  const [cols] = await conn.execute('SHOW COLUMNS FROM appointments');
  console.log('\nColumns:');
  for (const c of cols) {
    console.log('  ' + c.Field + ': key=' + c.Key + ' extra=' + c.Extra);
  }

  // Check if id column has a primary key issue
  const idCol = cols.find(c => c.Field === 'id');
  if (idCol && idCol.Key === 'PRI') {
    console.log('\n✓ id column already has PRIMARY KEY');
  } else {
    console.log('\n✗ id column does NOT have PRIMARY KEY - this is the problem');
    console.log('Attempting to fix...');
    try {
      await conn.execute('ALTER TABLE appointments DROP INDEX PRIMARY, ADD PRIMARY KEY (id)');
      console.log('Fixed!');
    } catch (e) {
      console.log('Fix failed:', e.message);
    }
  }

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
