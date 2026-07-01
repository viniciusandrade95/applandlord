'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { appVersion } from '@/lib/version'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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
      <div style={{ width: 'min(420px, 100%)' }}>
        <div className="login-brand">
          <h1>Applandlord</h1>
          <p>Gestão de arrendamentos simples e eficaz.</p>
        </div>
        <section className="card">
          <div className="card-header">
            <h2>Entrar na sua conta</h2>
          </div>
          <div className="card-body">
            <form onSubmit={onSubmit} className="stack">
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
              </div>
              <div className="field">
                <label htmlFor="password">Palavra-passe</label>
                <div className="password-field">
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={6} />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
                      {showPassword
                        ? <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6 0 10 8 10 8a18 18 0 0 1-3 3.9M6.6 6.6A18 18 0 0 0 2 12s4 8 10 8a10.8 10.8 0 0 0 4-.8" /></>
                        : <><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></>}
                    </svg>
                  </button>
                </div>
              </div>
              {error ? <p className="notice notice-error" role="alert" aria-live="assertive">{error}</p> : null}
              <button className="button button-primary" type="submit" disabled={submitting}>
                {submitting ? 'A entrar...' : 'Entrar'}
              </button>
            </form>
          </div>
        </section>
        <p className="footer-note" style={{ textAlign: 'center' }}>Versão {appVersion.version} · {appVersion.sha}</p>
      </div>
    </main>
  )
}
