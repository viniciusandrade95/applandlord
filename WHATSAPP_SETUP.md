# WhatsApp Setup

1. Get token from Meta
2. Add to .env:

WHATSAPP_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_id

3. Test endpoint:
POST /api/whatsapp/send-reminder

Body:
{
  "tenantId": "..."
}
