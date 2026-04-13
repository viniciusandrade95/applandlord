# WhatsApp Setup

1. Get token from Meta
2. Add to .env:

WHATSAPP_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_id
WHATSAPP_WEBHOOK_SECRET=your_webhook_secret
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token
WHATSAPP_ADMIN_NUMBERS=351900000000

3. Test endpoint:
POST /api/whatsapp/send-invoice

Body:
{
  "tenantId": "...",
  "invoiceId": "..."
}

Note:
- in the current applandlord schema, `tenantId` maps to the renter id

4. Configure webhook:
GET /api/whatsapp/webhook
POST /api/whatsapp/webhook

5. Menu examples:
- send "menu" to open the main menu
- send "1" for renters
- send "2" inside the renters menu to create a renter
