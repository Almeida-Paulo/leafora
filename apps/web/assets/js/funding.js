import { locale, t } from "./i18n.js";

// USD budgets are independent of test-chain token balances. There is no implicit exchange rate.
export function usdAmount(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
}

export function formatUsd(value) {
  const amount = usdAmount(value);
  if (amount === null) return t("US$ não informado");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "symbol", maximumFractionDigits: 2 }).format(amount);
}

export function fundingNote(project) {
  return project.fromApi
    ? t("Metas em US$ ainda não cadastradas. Apoios de teste não têm valor financeiro real.")
    : t("Valores ilustrativos em US$; não são conversão de SUI nem captação real.");
}

export function totalUsd(projects) {
  if (!projects.length) return 0;
  const amounts = projects.map((project) => usdAmount(project.fundingUsd?.raised));
  return amounts.some((amount) => amount === null) ? null : amounts.reduce((sum, amount) => sum + amount, 0);
}
