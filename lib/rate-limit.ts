type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

const buckets = new Map<string, RateLimitBucket>()

function getIpKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return 'unknown'
  return forwarded.split(',')[0]?.trim() || 'unknown'
}

export function enforceRateLimit(
  request: Request,
  keyPrefix: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const key = `${keyPrefix}:${getIpKey(request)}`
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    })

    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  current.count += 1

  if (current.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    }
  }

  return {
    allowed: true,
    remaining: Math.max(limit - current.count, 0),
    retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
  }
}

export function clearRateLimitBuckets() {
  buckets.clear()
}
