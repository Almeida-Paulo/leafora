import { formatUnits } from "./money.js";
import { escapeHtml } from "./catalog.js";
import { language, locale } from "./i18n.js";

const copy = (pt, en) => language === "en" ? en : pt;
let requestVersion = 0, controller;

export async function renderWalletRewards(wallet) {
  const root = document.getElementById("leafRewards");
  const version = ++requestVersion;
  controller?.abort();
  if (!root) return;
  root.replaceChildren();
  root.hidden = !wallet;
  if (!wallet) return;
  const heading = document.createElement("div");
  heading.className = "leaf-rewards-heading";
  heading.innerHTML = `<h2>${copy("Recompensas LEAF", "LEAF rewards")}</h2><button type="button" class="leaf-rewards-refresh" title="${copy("Atualizar recompensas", "Refresh rewards")}" aria-label="${copy("Atualizar recompensas", "Refresh rewards")}"><svg aria-hidden="true"><use href="/assets/icons/interface.svg#refresh"></use></svg></button>`;
  const content = document.createElement("div");
  content.setAttribute("role", "status");
  content.textContent = copy("Consultando recompensas...", "Loading rewards...");
  root.append(heading, content);
  const button = heading.querySelector("button");
  button.disabled = true;
  button.addEventListener("click", () => renderWalletRewards(wallet));
  controller = new AbortController();
  const currentController = controller;
  const timeout = setTimeout(() => currentController.abort(), 15000);
  try {
    const response = await fetch(`/api/rewards/wallets/${encodeURIComponent(wallet)}`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Rewards unavailable");
    const data = await response.json();
    if (version !== requestVersion) return;
    if (data.wallet !== wallet || data.asset !== "LEAF" || data.phase !== "prelaunch"
      || data.accounting !== "offchain" || data.transferable !== false || data.distribution_enabled !== false
      || data.decimals !== 7 || data.conversion?.reward_units !== "1" || data.conversion?.token_units !== "1"
      || typeof data.accumulated_units !== "string" || !/^(0|[1-9][0-9]{0,16})$/.test(data.accumulated_units)
      || data.locked_units !== data.accumulated_units || data.available_units !== "0"
      || data.mainnet_delivered_units !== "0" || !Array.isArray(data.awards)
      || data.awards.some(a => !["locked", "cancelled"].includes(a.status))) throw new Error("Unexpected rewards data");
    const amount = value => formatUnits(value, locale);
    const date = value => new Date(value).toLocaleString(locale);
    content.removeAttribute("role");
    content.innerHTML = `<p class="leaf-rewards-lock"><svg aria-hidden="true"><use href="/assets/icons/interface.svg#lock"></use></svg>${copy("Bloqueadas até o lançamento oficial", "Locked until the official launch")}</p>
      <dl class="leaf-rewards-totals">
      <div><dt>${copy("Total acumulado", "Total earned")}</dt><dd>${amount(data.accumulated_units)} <span>LEAF</span></dd></div>
      <div><dt>${copy("Disponível para transferir", "Available to transfer")}</dt><dd>${amount(data.available_units)} <span>LEAF</span></dd></div>
      <div><dt>${copy("Conversão no lançamento", "Conversion at launch")}</dt><dd>1:1 <span>LEAF</span></dd></div>
      </dl>
      <p class="leaf-rewards-note">${copy("Suas recompensas permanecem acumuladas após resets da rede de testes. Os tokens serão entregues na mainnet no lançamento.", "Your rewards remain accumulated after test network resets. Tokens will be delivered on mainnet at launch.")}</p>
      ${data.awards.length ? `<div class="leaf-rewards-table-wrap"><table class="leaf-rewards-table"><caption class="visually-hidden">${copy("Histórico de recompensas", "Reward history")}</caption><thead><tr><th>${copy("Campanha", "Campaign")}</th><th>LEAF</th><th>${copy("Situação", "Status")}</th><th>${copy("Aprovação", "Approved")}</th></tr></thead><tbody>${data.awards.slice().reverse().map(award => `<tr><th scope="row">${escapeHtml(award.title)}</th><td>${amount(award.amount_units)}</td><td>${award.status === "cancelled" ? copy("Cancelada", "Cancelled") : copy("Bloqueada", "Locked")}${award.cancelled_at ? `<small>${escapeHtml(date(award.cancelled_at))}</small>` : ""}</td><td>${escapeHtml(date(award.created_at))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="leaf-rewards-empty">${copy("Nenhuma recompensa aprovada para esta carteira.", "No rewards approved for this wallet.")}</p>`}`;
  } catch (error) {
    if (version !== requestVersion) return;
    content.textContent = copy("Não foi possível consultar as recompensas. Tente atualizar.", "Unable to load rewards. Please refresh.");
  } finally {
    clearTimeout(timeout);
    if (version === requestVersion) button.disabled = false;
  }
}
