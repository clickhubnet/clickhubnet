export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{0,3})/, (_, first: string, second: string) =>
    second ? `${first}-${second}` : first,
  );
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 13);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  }
  return digits.replace(/(\d{2})(\d{2})(\d{5})(\d{0,4})/, "+$1 ($2) $3-$4").trim();
}
