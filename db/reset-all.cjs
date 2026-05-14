const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const envText = fs.readFileSync('.env', 'utf-8');
  const line = envText.split('\n').find(l => l.startsWith('DATABASE_URL='));
  const dbUrl = line ? line.split('=').slice(1).join('=').trim().replace(/"/g, '') : '';

  const conn = await mysql.createConnection(dbUrl);
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

  const [tables] = await conn.execute('SHOW TABLES');
  console.log('Dropping ' + tables.length + ' tables...');
  for (const t of tables) {
    const tableName = Object.values(t)[0];
    await conn.execute('DROP TABLE IF EXISTS `' + tableName + '`');
    console.log('  Dropped ' + tableName);
  }

  await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  console.log('\nAll tables dropped. Run npm run db:push now.');
}

main().catch(console.error);
