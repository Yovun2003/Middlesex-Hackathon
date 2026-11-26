import { useState, type FormEvent } from 'react'
import { LockKeyhole } from 'lucide-react'
import type { Account } from '../server/db'

export function SignIn({ audience, registerFirst, offline, signIn, onSuccess }: {
  audience: 'resident' | 'coordinator' | 'worker' | null
  registerFirst: boolean
  offline: boolean
  signIn: (email: string, password: string, register: boolean) => Promise<Account | null>
  onSuccess: (account: Account) => void
}) {
  const [register, setRegister] = useState(registerFirst && audience !== 'coordinator' && audience !== 'worker')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const staff = audience === 'coordinator' || audience === 'worker'
  const label = audience === 'coordinator' ? 'Coordinator' : audience === 'worker' ? 'Workers' : 'NouDilo'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      const account = await signIn(String(form.get('email')), String(form.get('password')), register)
      if (account) onSuccess(account)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="account-page" id="main-content" tabIndex={-1}>
      <div className="container account-grid">
        <div className="account-copy">
          <LockKeyhole size={24} aria-hidden="true" />
          <h1>{register ? 'Create a resident account' : `Sign in to ${label}`}</h1>
          <p>{staff
            ? 'Use the staff account provisioned for you. Workers see the jobs assigned to their vehicle or repair crew.'
            : 'Use a resident account to submit reports and follow your own cases. Anyone can open the public incident map.'}</p>
          <a className="text-button" href="#water-map">View the public map</a>
        </div>
        <form className="account-form" onSubmit={submit} aria-label={register ? 'Create resident account' : 'Sign in'}>
          {offline && <p className="account-error" role="alert">The account service is unavailable. Open NouDilo through the Vite server.</p>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <label>Email<input name="email" type="email" autoComplete="username" required maxLength={160} /></label>
          <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : undefined} maxLength={128} /></label>
          {register && <p className="account-hint">Use at least 12 characters.</p>}
          <button className="button primary" type="submit" disabled={busy || offline}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
          {!staff && <button type="button" className="text-button" onClick={() => { setError(''); setRegister(!register) }}>{register ? 'I already have an account' : 'Create a resident account'}</button>}
        </form>
      </div>
    </main>
  )
}
