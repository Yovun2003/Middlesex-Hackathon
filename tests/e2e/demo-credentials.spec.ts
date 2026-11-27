import {test,expect} from '@playwright/test'

test('fixed demo credentials open the correct role workspaces',async({page})=>{
 for(const [name,heading,role,resource] of [
  ['Admin','Operations centre','coordinator',null],
  ['Resident','Tell us what','resident',null],
  ['Worker','Repair work','worker','Central maintenance crew'],
  ['Driver','Tanker deliveries','worker','WT-04'],
 ] as const){
  await page.goto('/#/signin')
  await page.getByLabel('Email',{exact:true}).fill(`${name}@demo.noudilo.test`)
  await page.getByLabel('Password',{exact:true}).fill('Randnousdilo')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  if(name==='Admin') await expect(page).toHaveURL(/#\/coordinator/)
  else await expect(page.getByRole('heading',{name:new RegExp(heading),level:1})).toBeVisible()
  const {account}=await(await page.request.get('/api/state')).json()
  expect(account).toMatchObject({email:`${name.toLowerCase()}@demo.noudilo.test`,role,resource})
  await page.getByRole('button',{name:'Sign out',exact:true}).click()
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
 }
})
