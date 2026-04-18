# Contratos de entrada/saída — Rotas financeiras

Data: 2026-04-18
Escopo: Sprint 6

## 1) POST /api/payments

### Entrada (JSON)
```json
{
  "invoiceId": "string (obrigatório)",
  "amount": "number|string (opcional)",
  "method": "string (opcional)",
  "paidAt": "ISO-8601 (opcional)",
  "receiptUrl": "string http/https (opcional)",
  "reference": "string (opcional)",
  "notes": "string (opcional)"
}
```

### Saída
- `201` Payment com `confirmationStatus=AwaitingConfirmation`.
- `400` erro de validação.
- `401` não autenticado.
- `404` invoice inexistente para owner.
- `500` erro interno.

### Erros típicos
- `invoiceId is required`
- `amount must be greater than zero`
- `receiptUrl must start with http:// or https://`
- `Invoice not found`

---

## 2) POST /api/payments/:paymentId/confirm

### Entrada
- Path: `paymentId` obrigatório.
- Body opcional:
```json
{ "note": "string opcional" }
```

### Saída
- `200`
```json
{
  "paymentId": "string",
  "invoiceId": "string",
  "invoiceStatus": "Paid|Partial",
  "paymentStatus": "Confirmed",
  "confirmedAt": "ISO-8601",
  "note": "string|null"
}
```
- `400`, `401`, `404`, `500`.

### Erros típicos
- `paymentId is required`
- `Payment not found`
- `Payment already confirmed`

---

## 3) GET /api/expenses

### Entrada
- Query opcional: `propertyId`, `leaseId`.

### Saída
- `200` array de despesas com entidades relacionadas.
- `401`, `500`.

---

## 4) POST /api/expenses

### Entrada (JSON)
```json
{
  "category": "string obrigatório",
  "amount": "number obrigatório > 0",
  "propertyId": "string opcional (propertyId ou leaseId obrigatório)",
  "unitId": "string opcional",
  "leaseId": "string opcional",
  "invoiceId": "string opcional",
  "description": "string opcional",
  "incurredAt": "ISO-8601 opcional"
}
```

### Saída
- `201` despesa criada.
- `400`, `401`, `404`, `500`.

### Erros típicos
- `category is required`
- `amount must be greater than zero`
- `propertyId or leaseId is required`
- `Property not found` / `Lease not found`

---

## 5) PATCH /api/expenses/:expenseId

### Entrada
- Path: `expenseId` obrigatório.
- Body parcial permitido:
```json
{
  "category": "string opcional",
  "amount": "number opcional > 0",
  "description": "string opcional",
  "incurredAt": "ISO-8601 opcional"
}
```

### Saída
- `200` despesa atualizada.
- `400`, `401`, `404`, `500`.

---

## 6) DELETE /api/expenses/:expenseId

### Entrada
- Path: `expenseId` obrigatório.

### Saída
- `200 { "success": true }`
- `401`, `404`, `500`.

---

## Regras de autenticação/autorização (todas as rotas)
- Sessão autenticada obrigatória (`requireCurrentUserId`).
- Isolamento estrito por `ownerId`.
- Operações em IDs de outro owner retornam `404` (sem leak de existência).
