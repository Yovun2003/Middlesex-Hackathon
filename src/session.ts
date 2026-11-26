import { useCallback, useEffect, useRef, useState } from 'react'
import type { Account } from '../server/db'
import type { Action, Notice, State } from './model'

type Session = { account: Account | null; state: State; publicState?: State; resources?: string[]; notice?: Notice }
const empty: Session = {
  account: null,
  state: { schema: 1, reports: [], shortages: [], leaks: [], tankers: [], repairs: [], audit: [], notices: [] },
}

async function request(path: string, body?: unknown): Promise<Session> {
  let result: Response
  try {
    result = await fetch('/api/' + path, {
      credentials: 'same-origin',
      ...(body !== undefined ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
  const inProgress = useRef(false)
  const revision = useRef(0)

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
    const timer = window.setInterval(refresh, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const change = useCallback(async (path: string, data: unknown) => {
    if (inProgress.current) throw new Error('Wait for the current request to finish.')
    inProgress.current = true
    revision.current++
    try {
      const next = await request(path, data)
      setSession(next)
      setNotice(next.notice ?? null)
      setOffline(false)
      setReady(true)
      return next
    } finally {
      inProgress.current = false
    }
  }, [])

  const dispatch = useCallback((action: Action) => {
    if (action.type === 'dismissNotice') { setNotice(null); return }
    void change('actions', action).catch(error => setNotice({ message: error.message, error: true }))
  }, [change])

  return {
    ...session, ready, offline, notice, dispatch, clearNotice: () => setNotice(null),
    signIn: async (email: string, password: string, register: boolean) =>
      (await change(register ? 'register' : 'login', { email, password })).account,
    signOut: async () => {
      try { await change('logout', {}) }
      catch (error) { setNotice({ message: (error as Error).message, error: true }) }
    },
  }
}
