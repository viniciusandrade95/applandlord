# Payloads WhatsApp Sprint 10

## 1) Provider outbound request (Graph API)
Endpoint provider: `POST https://graph.facebook.com/v19.0/{phone_number_id}/messages`

```json
{
  "messaging_product": "whatsapp",
  "to": "351912345678",
  "type": "text",
  "text": {
    "body": "Olá Joana, lembrete da cobrança ..."
  }
}
```

## 2) Provider outbound response (sucesso)
```json
{
  "messaging_product": "whatsapp",
  "contacts": [
    { "input": "351912345678", "wa_id": "351912345678" }
  ],
  "messages": [
    { "id": "wamid.HBgL..." }
  ]
}
```

## 3) Provider outbound response (erro)
```json
{
  "error": {
    "message": "Invalid OAuth access token.",
    "type": "OAuthException",
    "code": 190
  }
}
```

## 4) Payload persistido em `Reminder.payload`
```json
{
  "templateName": "rent_overdue_notice",
  "trigger": "daily_job"
}
```

## 5) Payload persistido em `WhatsAppMessage.providerPayload`

## 5.1 Sucesso
```json
{
  "request": {
    "channel": "WHATSAPP",
    "to": "351912345678",
    "templateName": "rent_manual_collect_now",
    "body": "Olá Joana, segue lembrete manual ..."
  },
  "response": {
    "messaging_product": "whatsapp",
    "messages": [{ "id": "wamid.HBgL..." }]
  }
}
```

## 5.2 Falha
```json
{
  "error": "Invalid OAuth access token.",
  "attemptNumber": 2
}
```

## 6) API interna `POST /api/whatsapp/send-invoice`

### Input
```json
{
  "tenantId": "cma123tenant",
  "invoiceId": "cma456invoice"
}
```

### Output 200
```json
{
  "success": true,
  "detail": "Mensagem enviada.",
  "reminderId": "cma789reminder",
  "providerMessageId": "wamid.HBgL..."
}
```

## 7) API interna `POST /api/jobs/reminders/daily`

### Headers
- `x-reminder-job-secret: <REMINDER_JOB_SECRET>`

### Input opcional
```json
{
  "referenceDate": "2026-04-18T09:00:00.000Z"
}
```

### Output 200
```json
{
  "success": true,
  "summary": {
    "referenceDate": "2026-04-18T09:00:00.000Z",
    "dueInvoices": 12,
    "remindersCreated": 8,
    "remindersProcessed": 9,
    "sent": 7,
    "failed": 2
  }
}
```
