export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  const withoutLeadingZero = digits.replace(/^0+/, "");
  if (withoutLeadingZero.startsWith("55") && (withoutLeadingZero.length === 12 || withoutLeadingZero.length === 13)) {
    return withoutLeadingZero;
  }

  if (withoutLeadingZero.length === 10 || withoutLeadingZero.length === 11) {
    return `55${withoutLeadingZero}`;
  }

  return withoutLeadingZero;
}

function lastPhoneDigits(value: string, size: number) {
  return value.length >= size ? value.slice(-size) : value;
}

export function phonesMatch(left: string, right: string) {
  const normalizedLeft = normalizePhone(left);
  const normalizedRight = normalizePhone(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const left11 = lastPhoneDigits(normalizedLeft, 11);
  const right11 = lastPhoneDigits(normalizedRight, 11);
  if (left11 && right11 && left11 === right11) return true;

  const left10 = lastPhoneDigits(normalizedLeft, 10);
  const right10 = lastPhoneDigits(normalizedRight, 10);
  return Boolean(left10 && right10 && left10 === right10);
}

export function isValidBrazilianWhatsApp(value: string) {
  const normalized = normalizePhone(value);
  return /^55\d{10,11}$/.test(normalized);
}
