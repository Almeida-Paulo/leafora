import { locale } from "./i18n.js";
import { formatUnits } from "./money.js";

// Integer USDC units from the contract; no market conversion or floating-point accounting.
export function formatUsd(units) {
  if (units === null || units === undefined) return "—";
  return "US$ " + formatUnits(units, locale, 2);
}
export function usdAmount(units) { return units == null ? null : BigInt(units); }
export function fundingNote() { return ""; }
export function totalUsd(projects) {
  return projects.reduce((sum, p) => sum + BigInt(p.fundingUsd.raised), 0n).toString();
}
