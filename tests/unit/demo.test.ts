import {it,expect} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {seedDemo} from '../../server/demo'
import {passwordMatches,passwordRecord,sqlitePersistence,stateFrom} from '../../server/persistence'
it('updates existing seeded demo passwords without replacing accounts or saved records',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'noudilo-demo-password-'))
 const db=sqlitePersistence(directory)
 try{
  await seedDemo(db)
  const read=()=>db.read(tx=>tx.rows('SELECT id,salt,password_hash FROM accounts WHERE email = :email',{email:'resident@demo.noudilo.test'}))
  const [before]=await read()
  const saved=await db.read(stateFrom)
  await db.write(tx=>tx.run('UPDATE accounts SET salt = :salt,password_hash = :password_hash WHERE id = :id',{...passwordRecord('Old-demo-password-2026'),id:String(before.id)}))
  await seedDemo(db)
  const [after]=await read()
  expect(after.id).toBe(before.id);expect(passwordMatches('Randnousdilo',after)).toBe(true)
  expect(await db.read(stateFrom)).toEqual(saved)
 }finally{await db.close();await rm(directory,{recursive:true,force:true})}
})
