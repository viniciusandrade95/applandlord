export function asNumber(value: FormDataEntryValue | string | number | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback

  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback

  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

export function asString(value: FormDataEntryValue | string | number | null | undefined, fallback = '') {
  if (value === null || value === undefined) return fallback
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : fallback
}

export function asDate(value: FormDataEntryValue | string | null | undefined, fallback?: Date) {
  if (!value) return fallback ?? new Date()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? fallback ?? new Date() : parsed
}

export function monthKey(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function dueDateForPeriod(period: string, dueDay = 1) {
  const [yearPart, monthPart] = period.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date()
  }

  const safeDueDay = Math.max(1, Math.min(28, Number.isFinite(dueDay) ? dueDay : 1))
  return new Date(Date.UTC(year, month - 1, safeDueDay, 12, 0, 0))
}

export function isActiveLease(lease: { status: string; startDate: Date; endDate: Date | null }, referenceDate = new Date()) {
  if (lease.status !== 'Active') return false
  const started = lease.startDate.getTime() <= referenceDate.getTime()
  const notEnded = !lease.endDate || lease.endDate.getTime() >= referenceDate.getTime()
  return started && notEnded
}

export function formatAddress(address: {
  addressLine1: string
  addressLine2: string | null
  city: string
  region: string
  postalCode: string
  country: string
}) {
  return [
    address.addressLine1,
    address.addressLine2,
    `${address.postalCode} ${address.city}`,
    address.region,
    address.country,
  ]
    .filter(Boolean)
    .join(' | ')
}
