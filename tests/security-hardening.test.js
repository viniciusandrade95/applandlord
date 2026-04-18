const test = require('node:test')
const assert = require('node:assert/strict')
const {
  validateEmail,
  validatePassword,
  enforceRateLimit,
  clearBuckets,
} = require('./helpers/security-hardening-testable.js')

test('validateEmail normaliza email válido', () => {
  assert.equal(validateEmail('  USER@Example.COM '), 'user@example.com')
})

test('validateEmail rejeita formato inválido', () => {
  assert.throws(() => validateEmail('not-an-email'), /Invalid email format/)
})

test('validatePassword exige tamanho mínimo e complexidade', () => {
  assert.throws(() => validatePassword('abc123'), /at least 10/)
  assert.throws(() => validatePassword('abcdefghijk'), /letters and numbers/)
  assert.equal(validatePassword('abcde12345'), 'abcde12345')
})

test('enforceRateLimit bloqueia requisições acima do limite na janela', () => {
  clearBuckets()
  const now = Date.now()
  assert.equal(enforceRateLimit('10.0.0.1', 2, 60_000, now).allowed, true)
  assert.equal(enforceRateLimit('10.0.0.1', 2, 60_000, now + 10).allowed, true)
  assert.equal(enforceRateLimit('10.0.0.1', 2, 60_000, now + 20).allowed, false)
})
