import { parseAmount, decimal, formatUnits } from "./money.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const amount = value => formatUnits(value, "pt-BR");
const short = value => value.slice(0, 6) + "..." + value.slice(-4);
const icon = name => `<svg aria-hidden="true"><use href="/assets/reward-icons.svg#${name}"></use></svg>`;

export function setupRewards({ request }) {
  const root = document.getElementById("rewards");
  const status = document.getElementById("rewardsStatus");
  let data = null, version = 0, busy = false;
  const notify = (message, error = false) => { status.textContent = message; status.classList.toggle("error", error); };
  const messages = {
    "Invalid admin token.": "Configure a sessão administrativa.",
    "Campaign has insufficient uncommitted tokens.": "A campanha não tem saldo disponível para esta recompensa.",
    "Campaign budgets exceed this reserve.": "O orçamento ultrapassa a reserva disponível.",
    "This operation key already exists with different data.": "Esta atividade já foi registrada com outros dados. Confira o histórico.",
    "Activity already rewarded or campaign is closed.": "Atividade já recompensada ou campanha encerrada.",
    "Invalid Stellar wallet checksum.": "Confira o endereço completo da carteira Stellar.",
  };
  function clear() {
    version++; data = null;
    for (const id of ["rewardReserves", "rewardCampaigns", "rewardAwards"]) document.getElementById(id).replaceChildren();
    root.querySelectorAll('#rewardAwardForm select').forEach(select => select.replaceChildren());
    notify("Sessão não carregada.");
  }
  async function refresh() {
    const current = ++version;
    notify("Consultando o histórico...");
    try {
      const result = await request("/rewards/admin");
      if (current !== version) return;
      if (result.phase !== "prelaunch" || result.accounting !== "offchain" || result.transferable !== false || result.distribution_enabled !== false) throw new Error("Atualize o painel e a API para consultar as recompensas bloqueadas.");
      data = result; render();
      notify(`Histórico conferido. ${data.revision} registros.`);
    } catch (error) { if (current === version) { clear(); notify(messages[error.message] || error.message, true); } }
  }
  function render() {
    document.getElementById("rewardReserves").innerHTML = data.reserves.map(row => `<tr><th scope="row">${escape(row.title)}</th><td>${amount(row.allocation_units)}</td><td>${amount(row.unassigned_units)}</td><td>${amount(row.locked_units)}</td><td>${amount(row.unawarded_units)}</td></tr>`).join("");
    document.getElementById("rewardCampaigns").innerHTML = data.campaigns.map(row => `<tr><th scope="row">${escape(row.title)}<small>${escape(row.id)}</small></th><td>${amount(row.budget_units)}</td><td>${amount(row.awarded_units)}</td><td>${row.open ? "Aberta" : "Encerrada"}</td><td><button type="button" class="ghost" data-campaign="${escape(row.id)}" data-open="${!row.open}">${row.open ? "Encerrar" : "Reabrir"}</button></td></tr>`).join("") || '<tr><td colspan="5">Nenhuma campanha cadastrada.</td></tr>';
    const campaign = document.querySelector('#rewardAwardForm [name="campaign"]');
    const selected = campaign.value;
    campaign.replaceChildren(...data.campaigns.filter(c => c.open).map(c => new Option(c.title, c.id)));
    if ([...campaign.options].some(o => o.value === selected)) campaign.value = selected;
    document.getElementById("rewardAwards").innerHTML = data.awards.map(row => `<tr><th scope="row"><span title="${escape(row.wallet)}">${escape(short(row.wallet))}</span><small>${escape(row.activity)}</small></th><td>${escape(row.campaign)}</td><td>${amount(row.amount_units)}</td><td>${row.cancelled ? "Cancelada" : "Bloqueada até o lançamento"}</td><td>${!row.cancelled && !row.receipt ? `<button type="button" class="reward-icon-button" data-cancel="${row.id}" title="Cancelar aprovação incorreta" aria-label="Cancelar aprovação incorreta">${icon("x")}</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="5">Nenhuma recompensa aprovada.</td></tr>';
  }
  async function action(callback) {
    if (busy) return;
    busy = true; root.setAttribute("aria-busy", "true");
    root.querySelectorAll("button").forEach(b => { b.disabled = true; });
    try { await callback(); } catch (error) { notify(messages[error.message] || error.message, true); }
    finally { busy = false; root.removeAttribute("aria-busy"); root.querySelectorAll("button").forEach(b => { b.disabled = false; }); }
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Exportação concluída. SHA-256: ${value.sha256}`);
  }
  function form(id, endpoint, transform = value => value) {
    document.getElementById(id).addEventListener("submit", event => {
      event.preventDefault();
      action(async () => {
        const body = transform(Object.fromEntries(new FormData(event.target)));
        notify("Conferindo e registrando...");
        await request("/rewards/admin/" + endpoint, { method: "POST", body: JSON.stringify(body) });
        event.target.reset();
        await refresh();
      });
    });
  }
  const withAmount = values => ({ ...values, amount: decimal(parseAmount(values.amount)) });
  form("rewardCampaignForm", "campaigns", withAmount);
  form("rewardAwardForm", "awards", withAmount);
  document.getElementById("refreshRewards").addEventListener("click", () => action(refresh));
  document.getElementById("exportRewards").addEventListener("click", () => action(async () => download(await request("/rewards/admin/export"), `${Date.now()}.leafora-rewards.json`)));
  document.getElementById("exportAllocations").addEventListener("click", () => action(async () => download(await request("/rewards/admin/allocations"), `${Date.now()}-allocations.leafora-rewards.json`)));
  root.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || busy) return;
    const { campaign, open, cancel } = button.dataset;
    if (campaign) action(async () => { await request("/rewards/admin/campaign-status", { method: "POST", body: JSON.stringify({ campaign, open: open === "true" }) }); await refresh(); });
    if (cancel) {
      const reason = window.prompt("Qual erro está sendo corrigido? O cancelamento ficará registrado no histórico.");
      if (reason?.trim()) action(async () => { await request("/rewards/admin/cancel", { method: "POST", body: JSON.stringify({ award: cancel, reason: reason.trim() }) }); await refresh(); });
    }
  });
  return { refresh, clear };
}
