'use client'

import type { ReactNode } from 'react'

/**
 * Helpers de apresentação partilhados entre a página inicial (home-page) e o centro de
 * controlo (portfólio/finanças/contratos/manutenção). Formatação pt-BR / BRL.
 */

export type Row = Record<string, any>
export type Notice = { kind: 'success' | 'error'; text: string } | null

/** Resposta paginada dos endpoints de listagem. */
export type Paged<T> = { items: T[]; nextCursor: string | null; total: number }

export const EXPENSE_CATEGORIES = ['Manutenção', 'Condomínio', 'IPTU', 'Seguro', 'Água', 'Energia', 'Gás', 'Limpeza', 'Outros'] as const

export function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  )
}

export function date(value?: string | Date | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}

export function dateTime(value?: string | Date | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(parsed)
}

export function periodLabel(period?: string) {
  if (!period) return '—'
  const parsed = new Date(`${period}-01T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return period
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parsed)
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function apiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: unknown }).error
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function payload(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>
}

/** Iniciais do inquilino para o avatar (ex.: "Carla Mendes" -> "CM"). */
export function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

/** Cor determinística (forte, não pastel) para o avatar do inquilino. */
const AVATAR_COLORS = ['#0f766e', '#4f46e5', '#b45309', '#be185d', '#0369a1', '#7c3aed']
export function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export type IconName =
  | 'building' | 'income' | 'check' | 'tools' | 'arrow'
  | 'wallet' | 'clock' | 'calendar' | 'user' | 'phone' | 'plus' | 'euro' | 'alert' | 'key' | 'pencil'

export function UiIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    building: <><path d="M4 21V5l8-3v19M12 8h8v13M8 7v2M8 12v2M8 17v2M16 12v2M16 17v2M2 21h20" /></>,
    income: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /><path d="M2 21h22" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    tools: <><path d="m14 7 3-3 3 3-3 3M5 19l9-9M4 14l6 6" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    wallet: <><path d="M4 7h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z" /><path d="M4 7V6a2 2 0 0 1 2-2h9v3" /><path d="M16 12.5h4v4h-4a2 2 0 0 1 0-4Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
    user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
    phone: <><path d="M4 4.5h4l2 5-2.5 1.6a12.5 12.5 0 0 0 5.4 5.4L18 14l5 2v4a2 2 0 0 1-2.2 2A18.5 18.5 0 0 1 2 6.7 2 2 0 0 1 4 4.5Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    euro: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5h.01M18 14.5h.01" /></>,
    alert: <><path d="M12 3.2 2.2 20.5h19.6z" /><path d="M12 10v4.5M12 18h.01" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2M17 6l2 2" /></>,
    pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  }

  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}
