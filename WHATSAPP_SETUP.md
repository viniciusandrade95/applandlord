# WhatsApp Setup

1. Get token from Meta.
2. Add to `.env`:

```env
WHATSAPP_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_id
WHATSAPP_WEBHOOK_SECRET=your_webhook_secret
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token
WHATSAPP_ADMIN_NUMBERS=351900000000
REMINDER_JOB_SECRET=your_reminder_job_secret
```

3. Test manual collection endpoint:
- `POST /api/whatsapp/send-invoice`

Body:
```json
{
  "tenantId": "...",
  "invoiceId": "..."
}
```

Note:
- In the current applandlord schema, `tenantId` maps to the renter id.

4. Configure webhook:
- `GET /api/whatsapp/webhook`
- `POST /api/whatsapp/webhook`

5. Daily reminder job trigger:
- `POST /api/jobs/reminders/daily`
- Required header: `x-reminder-job-secret: <REMINDER_JOB_SECRET>`

Optional body:
```json
{
  "referenceDate": "2026-04-18T09:00:00.000Z"
}
```

6. Menu examples:
- send `menu` to open the main menu
- send `1` for renters
- send `2` inside the renters menu to create a renter
