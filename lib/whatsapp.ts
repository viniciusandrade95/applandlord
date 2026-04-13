export async function sendTextMessage(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('Missing WhatsApp configuration')
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          body,
        },
      }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to send WhatsApp message')
  }

  return data
}
