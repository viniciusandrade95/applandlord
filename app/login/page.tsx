'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const form = event.currentTarget
    const payload = Object.fromEntries(new FormData(form).entries())

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(body?.error || 'Falha no login')
      }

      router.push('/')
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha no login')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <section className="card" style={{ width: 'min(420px, 100%)' }}>
        <div className="card-header">
          <h1>Entrar</h1>
          <span>Use o seu email e palavra-passe (mínimo 6 caracteres)</span>
        </div>
        <div className="card-body">
          <form onSubmit={onSubmit} className="stack">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Palavra-passe</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} />
            </div>
            {error ? <p className="notice notice-error" role="alert" aria-live="assertive">{error}</p> : null}
            <button className="button button-primary" type="submit" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
