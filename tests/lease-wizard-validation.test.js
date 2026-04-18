const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseLeaseWizardPayload,
  validateLeaseRelations,
  validateLeaseSchedule,
} = require('./helpers/lease-wizard-testable.js')

test('parseLeaseWizardPayload aceita inquilino novo com dados mínimos', () => {
  const payload = parseLeaseWizardPayload({
    propertyId: 'p1',
    unitId: 'u1',
    renterMode: 'new',
    newRenterFullName: 'Maria Teste',
    startDate: '2026-04-01',
    monthlyRent: '850',
    dueDay: 8,
  })

  assert.equal(payload.renterMode, 'new')
  assert.equal(payload.newRenter.fullName, 'Maria Teste')
  assert.equal(payload.monthlyRent, 850)
})

test('parseLeaseWizardPayload falha quando renter existente não é informado', () => {
  assert.throws(
    () =>
      parseLeaseWizardPayload({
        propertyId: 'p1',
        unitId: 'u1',
        renterMode: 'existing',
        monthlyRent: 900,
      }),
    /Selecione um inquilino existente/
  )
})

test('validateLeaseSchedule rejeita dueDay fora do intervalo 1..28', () => {
  assert.throws(() => validateLeaseSchedule(new Date('2026-04-01'), null, 30), /dia de vencimento/)
})

test('validateLeaseRelations rejeita unidade de imóvel diferente', () => {
  assert.throws(
    () =>
      validateLeaseRelations({
        unitPropertyId: 'prop-B',
        selectedPropertyId: 'prop-A',
        unitStatus: 'Vacant',
        activeLeaseCountForUnit: 0,
      }),
    /não pertence/
  )
})

test('validateLeaseRelations rejeita unidade já ocupada/ativa', () => {
  assert.throws(
    () =>
      validateLeaseRelations({
        unitPropertyId: 'prop-A',
        selectedPropertyId: 'prop-A',
        unitStatus: 'Occupied',
        activeLeaseCountForUnit: 1,
      }),
    /já possui contrato ativo/
  )
})
