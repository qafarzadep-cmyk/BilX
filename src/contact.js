export const WHATSAPP_PHONE_DISPLAY = '+994 77 385 72 52'
export const WHATSAPP_PHONE_DIGITS = '994773857252'

export function getWhatsAppUrl(message = '') {
  const query = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${WHATSAPP_PHONE_DIGITS}${query}`
}
