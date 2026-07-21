export const WHATSAPP_PHONE_DISPLAY = '+994 77 385 72 52'
export const WHATSAPP_PHONE_DIGITS = '994773857252'

export function getWhatsAppUrl(message = '') {
  const text = message ? `&text=${encodeURIComponent(message)}` : ''
  return `https://api.whatsapp.com/send/?phone=${WHATSAPP_PHONE_DIGITS}${text}`
}
