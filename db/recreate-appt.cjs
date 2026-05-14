const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const envText = fs.readFileSync('.env', 'utf-8');
  const line = envText.split('\n').find(l => l.startsWith('DATABASE_URL='));
  const dbUrl = line ? line.split('=').slice(1).join('=').trim().replace(/"/g, '') : '';
  
  const conn = await mysql.createConnection(dbUrl);
  
  // Save existing data
  const [existing] = await conn.execute('SELECT * FROM appointments');
  console.log('Existing appointments:', existing.length, 'rows');
  
  // Drop and recreate appointments table cleanly
  await conn.execute('DROP TABLE IF EXISTS appointments');
  console.log('Dropped appointments');
  
  // Recreate with exact same structure but using explicit syntax
  await conn.execute(`
    CREATE TABLE appointments (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      lead_id BIGINT UNSIGNED NOT NULL,
      scheduled_date TIMESTAMP NOT NULL,
      scheduled_time VARCHAR(20) NOT NULL,
      duration INT DEFAULT 30,
      appointment_type ENUM('walkthrough', 'phone_call', 'video_call') DEFAULT 'walkthrough',
      status ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
      notes TEXT,
      mao_presented DECIMAL(12,2),
      contract_signed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('Recreated appointments');
  
  await conn.end();
  console.log('Done. Now run npm run db:push.');
}

main().catch(console.error);
