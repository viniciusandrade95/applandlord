export class ValidationError extends Error {
  status: number
  details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>, status = 400) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
    this.status = status
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string) {
  const normalized = email.trim().toLowerCase()

  if (!normalized) {
    throw new ValidationError('Email is required', { field: 'email' })
  }

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new ValidationError('Invalid email format', { field: 'email', value: normalized })
  }

  if (normalized.length > 254) {
    throw new ValidationError('Email exceeds max length', { field: 'email', maxLength: 254 })
  }

  return normalized
}

export function validatePassword(password: string) {
  if (password.length < 10) {
    throw new ValidationError('Password must have at least 10 characters', {
      field: 'password',
      minLength: 10,
    })
  }

  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)

  if (!hasLetter || !hasNumber) {
    throw new ValidationError('Password must include letters and numbers', {
      field: 'password',
      rule: 'letters_and_numbers',
    })
  }

  return password
}

export function validateIsoDate(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName} must be a non-empty ISO date string`, { field: fieldName })
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`, { field: fieldName, value })
  }

  return parsed
}

export function assertBearerSecret(request: Request, headerName: string, expectedSecret: string) {
  const provided = request.headers.get(headerName)

  if (!provided) {
    throw new ValidationError(`Missing ${headerName} header`, { headerName }, 401)
  }

  if (provided !== expectedSecret) {
    throw new ValidationError(`Invalid ${headerName} header`, { headerName }, 401)
  }
}

export function assertRequiredSecrets(keys: string[]) {
  const missing = keys.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`)
  }
}
