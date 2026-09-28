export const UNIT = 10_000_000n;
export function parseAmount(value) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,7})?$/.test(normalized)) throw new Error("Invalid amount");
  const [whole, fraction = ""] = normalized.split(".");
  const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(7, "0"));
  if (amount <= 0n || amount > 10n ** 18n) throw new Error("Invalid amount");
  return amount;
}
export function decimal(units) {
  const value = BigInt(units);
  if (value < 0n) throw new Error("Negative balance");
  const fraction = (value % UNIT).toString().padStart(7, "0").replace(/0+$/, "");
  return (value / UNIT).toString() + (fraction ? "." + fraction : "");
}
export function formatUnits(units, locale = "pt-BR", minDigits = 0) {
  if (units === null || units === undefined || !/^\d+$/.test(String(units))) throw new Error("Missing balance");
  const value = BigInt(units);
  const fraction = (value % UNIT).toString().padStart(7, "0").replace(/0+$/, "").padEnd(minDigits, "0");
  return new Intl.NumberFormat(locale).format(value / UNIT) + (fraction ? (locale === "pt-BR" ? "," : ".") + fraction : "");
}
export function sharePercent(points, total) {
  const denominator = BigInt(total);
  return denominator > 0n ? Number(BigInt(points) * 10_000n / denominator) / 100 : 0;
}
