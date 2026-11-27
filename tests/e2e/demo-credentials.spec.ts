import {test,expect} from '@playwright/test'

test('demo chooser opens each workspace without email or password and retains report details',async({page})=>{
 await page.goto('/#/user')
 await page.getByRole('combobox',{name:'What are you seeing?',exact:true}).selectOption('Low pressure')
 await page.getByRole('button',{name:'Continue shortage report',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Choose a demo account',exact:true})).toBeVisible()
 await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Resident',exact:true}).click()
 await expect(page.locator('dialog[open]')).toBeVisible()
 await expect(page.locator('dialog').getByRole('combobox',{name:'What are you experiencing?',exact:true})).toHaveValue('Low pressure')
 await page.getByRole('button',{name:'Close dialog',exact:true}).click()
 for(const [label,role,resource] of [['Coordinator','coordinator',null],['Maintenance crew','worker','Central maintenance crew'],['Tanker driver','worker','WT-04'],['Resident','resident',null]] as const){
  await page.locator('.demo-roles summary').click()
  await page.locator('.demo-roles').getByRole('button',{name:label,exact:true}).click()
  await expect(page.locator('.demo-roles')).not.toHaveAttribute('open')
  const {account}=await(await page.request.get('/api/state')).json()
  expect(account).toMatchObject({role,resource})
  if(label==='Maintenance crew')await expect(page.getByRole('heading',{name:'Repair work',exact:true})).toBeVisible()
  if(label==='Tanker driver')await expect(page.getByRole('heading',{name:'Tanker deliveries',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toHaveCount(0)
 }
})
