import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import oracle from 'oracledb'
import { getPlace } from '../src/geo.ts'
import { TOWNS } from '../src/model.ts'

const directory = new URL('./migrations/', import.meta.url)
const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
const migrations = await Promise.all(files.map(async name => ({ name, statements: (await readFile(new URL(name, directory), 'utf8')).replace(/^--.*$/gm, '').split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean) })))
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ directory: fileURLToPath(directory), migrations: migrations.map(m => ({ name: m.name, statements: m.statements.length })), executed: false }, null, 2))
} else {
  for (const name of ['NOU_ORACLE_USER', 'NOU_ORACLE_PASSWORD', 'NOU_ORACLE_CONNECT_STRING']) if (!process.env[name]) throw new Error(`Set ${name} in the server environment.`)
  const connection = await oracle.getConnection({ user: process.env.NOU_ORACLE_USER, password: process.env.NOU_ORACLE_PASSWORD, connectString: process.env.NOU_ORACLE_CONNECT_STRING, walletLocation: process.env.NOU_ORACLE_WALLET_DIR || undefined, walletPassword: process.env.NOU_ORACLE_WALLET_PASSWORD || undefined, configDir: process.env.NOU_ORACLE_WALLET_DIR || undefined })
  try {
    try { await connection.execute('CREATE TABLE ND_SCHEMA_MIGRATIONS (name VARCHAR2(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)') } catch (error) { if ((error as { errorNum?: number }).errorNum !== 955) throw error }
    for (const migration of migrations) {
      const previous = await connection.execute('SELECT name FROM ND_SCHEMA_MIGRATIONS WHERE name = :name', { name: migration.name })
      if (previous.rows?.length) continue
      for (const statement of migration.statements) {
        try { await connection.execute(statement) } catch (error) { if ((error as { errorNum?: number }).errorNum !== 955) throw error }
      }
      for (const name of TOWNS) {
        const coordinate = getPlace(name)!
        await connection.execute('MERGE INTO ND_LOCATION l USING (SELECT :name name FROM dual) s ON (l.name = s.name) WHEN NOT MATCHED THEN INSERT (name,longitude,latitude) VALUES (:name,:longitude,:latitude)', { name, longitude: coordinate[0], latitude: coordinate[1] })
      }
      await connection.execute('INSERT INTO ND_SCHEMA_MIGRATIONS (name) VALUES (:name)', { name: migration.name })
      await connection.commit()
      console.log(`Applied ${migration.name}`)
    }
  } finally { await connection.close() }
}
