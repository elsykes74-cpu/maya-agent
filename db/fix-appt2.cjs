const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const envText = fs.readFileSync('.env', 'utf-8');
  const line = envText.split('\n').find(l => l.startsWith('DATABASE_URL='));
  const dbUrl = line ? line.split('=').slice(1).join('=').trim().replace(/"/g, '') : '';
  
  const conn = await mysql.createConnection(dbUrl);
  
  // Check current appointments column
  const [cols] = await conn.execute("SHOW COLUMNS FROM appointments WHERE Field = 'id'");
  console.log('appointments.id before:', cols[0]);
  
  // Fix: Make id a proper auto-increment primary key that drizzle-kit can understand
  // The issue is that drizzle-kit sees AUTO_INCREMENT but not PRIMARY KEY, 
  // or vice versa. We need to ensure both are present and detected.
  
  // Approach: Recreate the column properly
  // First, check if lead_id has a unique constraint that shouldn't be there
  const [indexes] = await conn.execute("SHOW INDEX FROM appointments");
  console.log('\nIndexes on appointments:');
  for (const idx of indexes) {
    console.log('  ' + idx.Key_name + ' on ' + idx.Column_name);
  }
  
  // If there's a duplicate unique on lead_id, drop it
  const leadIdUnique = indexes.find(i => i.Key_name === 'appointments_lead_id_unique');
  if (leadIdUnique) {
    console.log('\nDropping appointments_lead_id_unique...');
    await conn.execute('ALTER TABLE appointments DROP INDEX appointments_lead_id_unique');
    console.log('Dropped.');
  }
  
  // Ensure PRIMARY KEY exists properly on id
  const primaryIdx = indexes.find(i => i.Key_name === 'PRIMARY');
  if (primaryIdx) {
    console.log('\nPRIMARY key exists on:', primaryIdx.Column_name);
    if (primaryIdx.Column_name !== 'id') {
      console.log('PRIMARY key is on wrong column! Fixing...');
      await conn.execute('ALTER TABLE appointments DROP PRIMARY KEY, ADD PRIMARY KEY (id)');
    }
  } else {
    console.log('\nNo PRIMARY key found! Adding...');
    await conn.execute('ALTER TABLE appointments ADD PRIMARY KEY (id)');
  }
  
  // Also ensure id is auto_increment
  const idCol = cols[0];
  if (!idCol.Extra.includes('auto_increment')) {
    console.log('\nid is not auto_increment! Fixing...');
    await conn.execute('ALTER TABLE appointments MODIFY COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT');
  }
  
  // Verify
  const [colsAfter] = await conn.execute("SHOW COLUMNS FROM appointments WHERE Field = 'id'");
  console.log('\nappointments.id after:', colsAfter[0]);
  
  const [indexesAfter] = await conn.execute("SHOW INDEX FROM appointments");
  console.log('\nIndexes after fix:');
  for (const idx of indexesAfter) {
    console.log('  ' + idx.Key_name + ' on ' + idx.Column_name);
  }
  
  await conn.end();
  console.log('\nDone. Run npm run db:push now.');
}

main().catch(console.error);
