export const WHATSAPP_PHONE = '559985127056';

export function makeWhatsAppLink(source, text) {
  const message = text || `Ola, vim do site (${source}) e quero uma proposta de energia solar.`;
  const encoded = encodeURIComponent(message);
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encoded}`;
}
