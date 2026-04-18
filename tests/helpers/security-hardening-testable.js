function validateEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) throw new Error('Email is required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Invalid email format')
  if (normalized.length > 254) throw new Error('Email exceeds max length')
  return normalized
}

function validatePassword(password) {
  const value = String(password || '')
  if (value.length < 10) throw new Error('Password must have at least 10 characters')
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) throw new Error('Password must include letters and numbers')
  return value
}

const buckets = new Map()

function enforceRateLimit(ip, limit, windowMs, now) {
  const key = `x:${ip}`
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: Math.max(limit - 1, 0) }
  }

  current.count += 1
  if (current.count > limit) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: Math.max(limit - current.count, 0) }
}

function clearBuckets() {
  buckets.clear()
}

module.exports = {
  validateEmail,
  validatePassword,
  enforceRateLimit,
  clearBuckets,
}
