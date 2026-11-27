import { useCallback, useEffect, useRef, useState } from 'react'
import type { Account } from '../server/db'
import type { Action, Notice, State } from './model'
import { acknowledgeWorldAction } from './world/state'

type Session = { account: Account | null; state: State; publicState?: State; resources?: string[]; notice?: Notice; environment?: { database: 'sqlite' | 'oracle'; demo: boolean; telemetry: boolean }; notifications?: Array<{ id: string; message: string; created_at: string }> }
const empty: Session = {
  account: null,
  state: { schema: 1, reports: [], shortages: [], leaks: [], tankers: [], repairs: [], audit: [], notices: [] },
}

async function request(path: string, body?: unknown, requestKey?: string): Promise<Session> {
  let result: Response
  try {
    result = await fetch('/api/' + path, {
      credentials: 'same-origin',
      ...(body !== undefined ? {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey ?? crypto.randomUUID() }, body: JSON.stringify(body),
      } : {}),
    })
  } catch {
    throw new Error('NouDilo is offline. Try again when the server is running.')
  }
  if (!result.headers.get('Content-Type')?.includes('application/json'))
    throw new Error('The account service is unavailable. Open NouDilo through Vite.')
  const data = await result.json()
  if (!result.ok) throw new Error(data.message || 'The request could not be completed.')
  return data as Session
}

export function useSession() {
  const [session, setSession] = useState(empty)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(false)
  const inProgress = useRef(false)
  const revision = useRef(0)
  const requestKeys = useRef(new Map<string, string>())

  useEffect(() => {
    let active = true
    async function refresh() {
      if (inProgress.current || document.hidden) return
      const expected = revision.current
      try {
        const next = await request('state')
        if (active && revision.current === expected && !inProgress.current) {
          setOffline(false)
          setSession(next)
          setReady(true)
        }
      } catch {
        if (active && revision.current === expected) {
          setOffline(true)
          setReady(true)
        }
      }
    }
    void refresh()
    const events = new EventSource('/api/events')
    events.addEventListener('revision', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 5000)
    return () => { active = false; window.clearInterval(timer); events.close(); document.removeEventListener('visibilitychange', refresh) }
  }, [])

  const change = useCallback(async (path: string, data: unknown) => {
    if (inProgress.current) throw new Error('Wait for the current request to finish.')
    inProgress.current = true
    setPending(true)
    revision.current++
    const signature = path + JSON.stringify(data)
    const key = requestKeys.current.get(signature) ?? crypto.randomUUID()
    requestKeys.current.set(signature, key)
    try {
      const next = await request(path, data, key)
      requestKeys.current.delete(signature)
      setSession(next)
      setNotice(next.notice ?? null)
      setOffline(false)
      setReady(true)
      if (path === 'actions') acknowledgeWorldAction(data as Action, next.state)
      return next
    } finally {
      inProgress.current = false
      setPending(false)
    }
  }, [])

  const dispatch = useCallback(async (action: Action) => {
    if (action.type === 'dismissNotice') { setNotice(null); return true }
    try { await change('actions', action); return true }
    catch (error) { setNotice({ message: (error as Error).message, error: true }); return false }
  }, [change])

  return {
    ...session, ready, offline, pending, notice, dispatch, clearNotice: () => setNotice(null),
    signIn: async (email: string, password: string, register: boolean) =>
      (await change(register ? 'register' : 'login', { email, password })).account,
    signInDemo: async (role: string) => (await change('demo-login', { role })).account,
    signOut: async () => {
      try { await change('logout', {}); return true }
      catch (error) { setNotice({ message: (error as Error).message, error: true }); return false }
    },
  }
}
