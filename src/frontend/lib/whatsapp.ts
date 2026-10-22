const DEFAULT_WHATSAPP_NUMBER = '919118698641';

export function normalizeWhatsAppNumber(number?: string | null): string {
  let digits = number?.replace(/\D/g, '') ?? '';

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;

  return /^\d{8,15}$/.test(digits) ? digits : DEFAULT_WHATSAPP_NUMBER;
}

export function getWhatsAppHref(number: string | null | undefined, message: string): string {
  return `https://wa.me/${normalizeWhatsAppNumber(number)}?text=${encodeURIComponent(message)}`;
}
