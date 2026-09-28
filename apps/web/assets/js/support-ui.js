import { api, walletOptions, connectWallet, disconnectWallet, signIntent, explorer, walletLaunchUrl } from "./stellar-wallet.js";
import { parseAmount, decimal, formatUnits, sharePercent } from "./money.js";
import { escapeHtml, safeMediaUrl, shortAddress, projectPath } from "./catalog.js";
import { formatUsd } from "./funding.js";
import { language, locale, routePath } from "./i18n.js";

const copy = (pt, en) => language === "en" ? en : pt;
let state, refresh, busy = false, dashboardVersion = 0;
const $ = id => document.getElementById(id);
const pendingKey = address => `leafora:stellar:pending:${state.wallet.config.network}:${state.wallet.config.contract}:${address}`;

export function setupSupport(appState, onRefresh) {
  state = appState; refresh = onRefresh;
  $("walletRiskAccepted").addEventListener("change", () => {
    $("walletList").querySelectorAll("button").forEach(button => { button.disabled = !$("walletRiskAccepted").checked; });
  });
  $("confirmSupport").addEventListener("click", confirmSupport);
  $("supportDialog").addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  $("walletDialog").addEventListener("close", () => { if (!state.wallet) state.supportIntent = null; });
  window.addEventListener("leafora:wallet-disconnected", () => { state.wallet = null; renderWalletState(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.wallet) renderDashboard(); });
}

export async function openWalletDialog() {
  if (state.wallet) { await disconnectWallet(); return; }
  $("walletRiskAccepted").checked = false;
  $("walletStatus").textContent = copy("Consultando carteiras compatíveis...", "Looking for compatible wallets...");
  $("walletList").replaceChildren();
  $("walletDialog").showModal();
  try {
    const providers = await walletOptions();
    if (!$("walletDialog").open) return;
    for (const provider of providers) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "wallet-provider"; button.disabled = !$("walletRiskAccepted").checked;
      button.innerHTML = `<span><strong>${escapeHtml(provider.name)}</strong><small>${provider.kind === "extension" ? copy("Extensão do navegador", "Browser extension") : copy("Carteira no celular ou código QR", "Mobile wallet or QR code")}</small></span><span aria-hidden="true">↗</span>`;
      button.addEventListener("click", async () => {
        $("walletList").querySelectorAll("button").forEach(item => { item.disabled = true; });
        $("walletStatus").textContent = copy("Autorize a conexão na carteira.", "Approve the connection in your wallet.");
        try {
          // Close the native dialog so the WalletConnect modal is not trapped underneath it.
          const intent = state.supportIntent;
          if (provider.kind === "mobile") $("walletDialog").close();
          state.wallet = await connectWallet(provider);
          $("walletDialog").close();
          renderWalletState();
          if (intent) openSupportDialog(intent.projectId);
        } catch (error) {
          if (!$("walletDialog").open) $("walletDialog").showModal();
          $("walletStatus").textContent = error.message;
          $("walletList").querySelectorAll("button").forEach(item => { item.disabled = false; });
        }
      });
      $("walletList").append(button);
    }
    $("walletStatus").textContent = providers.length
      ? copy("Confirme o aviso e escolha sua carteira.", "Accept the notice and select your wallet.")
      : copy("Não encontramos uma conexão disponível. Instale a extensão Freighter ou use uma conexão móvel habilitada pela plataforma.", "No connection is available. Install the Freighter extension or use a mobile connection enabled by the platform.");
  } catch (error) { $("walletStatus").textContent = error.message; }
}

export function renderWalletState() {
  document.querySelectorAll("[data-wallet-only]").forEach(item => { item.hidden = !state.wallet; });
  document.querySelectorAll("[data-wallet-connect]").forEach(button => {
    button.textContent = state.wallet ? shortAddress(state.wallet.address) : copy("Conectar carteira", "Connect wallet");
    button.title = state.wallet ? copy("Desconectar carteira", "Disconnect wallet") : "";
    button.classList.toggle("connected", Boolean(state.wallet));
  });
  renderDashboard();
}

export function openSupportDialog(projectId) {
  if (busy) return;
  const project = state.projects.find(item => item.id === projectId);
  if (!project) return;
  if (!state.wallet) { state.supportIntent = { projectId }; openWalletDialog(); return; }
  state.pendingSupport = project;
  $("supportTitle").textContent = project.name;
  $("supportMessage").textContent = copy("Seu apoio será registrado neste projeto. Cada USDC corresponde a um ponto de participação (AP).", "Your support is recorded for this project. Each USDC corresponds to one allocation point (AP).");
  $("riskAccepted").checked = false;
  $("supportStatus").textContent = "";
  $("tierOptions").innerHTML = `<label class="amount-label" for="supportAmount">${copy("Valor do apoio", "Support amount")} (USDC)</label>
    <div class="amount-field"><span aria-hidden="true">$</span><input id="supportAmount" type="text" inputmode="decimal" autocomplete="off" maxlength="24" placeholder="10,00" aria-describedby="pointsPreview"></div>
    <p class="points-preview" id="pointsPreview"><span class="ap-icon" aria-hidden="true">✦</span> 0 AP</p>
    <p class="currency-note">${copy("USDC na Stellar. As taxas da rede são pagas em XLM e aparecem na carteira antes da assinatura.", "USDC on Stellar. Network fees are paid in XLM and shown in your wallet before signing.")}</p>`;
  $("supportAmount").addEventListener("input", () => {
    try { $("pointsPreview").textContent = `${formatUnits(parseAmount($("supportAmount").value), locale)} AP`; }
    catch { $("pointsPreview").textContent = "— AP"; }
  });
  $("supportAmount").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); confirmSupport(); }
  });
  $("confirmSupport").disabled = false;
  $("confirmSupport").textContent = copy("Confirmar apoio", "Confirm support");
  $("supportDialog").showModal();
  $("supportAmount").focus();
}

async function confirmSupport() {
  if (busy || !state.wallet || !state.pendingSupport) return;
  const session = state.wallet, project = state.pendingSupport;
  let amount;
  try { amount = parseAmount($("supportAmount").value); }
  catch { $("supportStatus").textContent = copy("Digite um valor maior que zero, com até sete casas decimais.", "Enter an amount greater than zero, with up to seven decimal places."); return; }
  if (!$("riskAccepted").checked) { $("supportStatus").textContent = copy("Leia e confirme as condições do apoio.", "Read and accept the support terms."); return; }
  const key = pendingKey(session.address);
  busy = true;
  $("supportDialog").querySelectorAll("button,input").forEach(item => { item.disabled = true; });
  try {
    let previous = JSON.parse(localStorage.getItem(key) || "null");
    if (previous) {
      const check = await api(`/transactions/${previous.hash}`);
      if (["SUCCESS", "FAILED", "EXPIRED"].includes(check.status)) localStorage.removeItem(key);
      else throw new Error(copy("Há um apoio aguardando confirmação. Consulte o dashboard antes de enviar outro.", "A support transaction is awaiting confirmation. Check your dashboard before sending another."));
    }
    $("supportStatus").textContent = copy("Conferindo saldo, prazo e autorização...", "Checking balance, deadline and authorization...");
    const intent = await api(`/projects/${encodeURIComponent(project.id)}/prepare`, {
      method: "POST", body: JSON.stringify({ wallet: session.address, amount: decimal(amount) }) });
    $("supportStatus").textContent = copy("Confira o valor e confirme na carteira.", "Review the amount and confirm in your wallet.");
    const launchUrl = walletLaunchUrl(session);
    if (launchUrl) {
      const link = document.createElement("a"); link.href = launchUrl;
      link.textContent = copy(" Abrir carteira ↗", " Open wallet ↗");
      link.rel = "noopener noreferrer"; link.className = "text-action";
      $("supportStatus").append(link);
    }
    const signed = await signIntent(session, intent);
    // Persist before submission: a timeout or tab close must not become a second payment.
    localStorage.setItem(key, JSON.stringify({ id: intent.id, hash: intent.hash, xdr: signed, expires: intent.expires }));
    const result = await api(`/intents/${intent.id}/submit`, { method: "POST", body: JSON.stringify({ xdr: signed }) });
    if (result.status === "FAILED") { localStorage.removeItem(key); throw new Error(copy("A transação falhou. Nenhum AP foi emitido.", "The transaction failed. No AP were issued.")); }
    for (let attempt = 0; attempt < 20; attempt++) {
      $("supportStatus").textContent = copy("Aguardando confirmação da rede...", "Waiting for network confirmation...");
      const confirmed = await api(`/transactions/${intent.hash}`);
      if (confirmed.status === "FAILED") { localStorage.removeItem(key); throw new Error(copy("A transação não foi confirmada.", "The transaction failed.")); }
      if (confirmed.status === "SUCCESS") {
        localStorage.removeItem(key);
        state.pendingSupport = null;
        $("confirmSupport").textContent = copy("Apoio confirmado", "Support confirmed");
        $("supportStatus").textContent = copy("Apoio confirmado. Seus AP estão registrados no projeto.", "Support confirmed. Your AP are recorded for this project.");
        await refresh(); await renderDashboard(); return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    $("supportStatus").textContent = copy("A confirmação está demorando. Acompanhe a transação no dashboard; não é necessário pagar novamente.", "Confirmation is taking longer. Track the transaction in your dashboard; do not pay again.");
    renderDashboard();
  } catch (error) { $("supportStatus").textContent = error.message; }
  finally {
    busy = false;
    $("supportDialog").querySelectorAll("button,input").forEach(item => { item.disabled = false; });
    $("confirmSupport").disabled = !state.pendingSupport;
  }
}

export async function renderDashboard() {
  const session = state.wallet, version = ++dashboardVersion;
  $("walletGate").hidden = Boolean(session); $("connectedDashboard").hidden = !session;
  if (!session || document.querySelector('[data-view="dashboard"]').hidden) return;
  $("dashboardGrid").textContent = copy("Consultando participações na blockchain...", "Reading on-chain positions...");
  $("supportList").replaceChildren();
  try {
    const data = await api(`/wallets/${session.address}`);
    if (version !== dashboardVersion || state.wallet !== session) return;
    const key = pendingKey(session.address);
    const pending = JSON.parse(localStorage.getItem(key) || "null");
    $("dashboardGrid").innerHTML = `<article class="stat-card"><span>${copy("Total de AP", "Total AP")}</span><strong><span class="ap-icon" aria-hidden="true">✦</span> ${formatUnits(data.points_units, locale)}</strong></article>
      <article class="stat-card"><span>${copy("Total apoiado", "Total supported")}</span><strong>${formatUsd(data.points_units)}</strong></article>
      <article class="stat-card"><span>${copy("Projetos apoiados", "Supported projects")}</span><strong>${data.positions.length}</strong></article>
      <article class="stat-card"><span>${copy("Carteira", "Wallet")}</span><a href="${explorer(session.config, "account", session.address)}" target="_blank" rel="noopener noreferrer">${shortAddress(session.address)} ↗</a><button class="text-action" id="refreshPortfolio" type="button">${copy("Atualizar", "Refresh")}</button></article>`;
    $("refreshPortfolio").addEventListener("click", renderDashboard);
    $("supportList").innerHTML = `${pending ? `<div class="pending-support"><a href="${explorer(session.config, "tx", pending.hash)}" target="_blank" rel="noopener noreferrer">${copy("Consultar apoio pendente", "Check pending support")} ↗</a><button id="resumeSupport" class="secondary-action" type="button">${copy("Verificar confirmação", "Check confirmation")}</button><p id="pendingStatus" role="status"></p></div>` : ""}
      <div class="allocation-table-wrap"><table class="allocation-table"><caption class="visually-hidden">${copy("Sua participação em cada projeto", "Your position in each project")}</caption>
      <thead><tr><th>${copy("Projeto", "Project")}</th><th>${copy("Apoio", "Support")}</th><th>AP</th><th>${copy("% dos AP", "% of AP")}</th></tr></thead>
      <tbody>${data.positions.map(row => `<tr><th scope="row"><a href="${projectPath(row.slug)}" data-route><img src="${safeMediaUrl(row.image)}" alt=""><span>${escapeHtml(row.name)}</span></a></th><td>${formatUsd(row.points_units)}</td><td><span class="ap-icon" aria-hidden="true">✦</span> ${formatUnits(row.points_units, locale)}</td><td>${sharePercent(row.points_units, row.project_points_units).toLocaleString(locale)}%</td></tr>`).join("")}</tbody></table></div>
      ${data.positions.length ? "" : `<p>${copy("Você ainda não apoiou um projeto.", "You have not supported a project yet.")} <a href="${routePath('/projects')}" data-route>${copy("Conheça os projetos", "Explore projects")}</a></p>`}
      <p class="allocation-note">${copy("O total reúne seus AP para acompanhamento. A participação de cada projeto é calculada separadamente e não representa uma promessa de rendimento.", "The total combines your AP for tracking. Each project has its own allocation; points do not promise a financial return.")}</p>`;
    $("resumeSupport")?.addEventListener("click", async event => {
      event.target.disabled = true;
      try {
        const result = await api(`/transactions/${pending.hash}`);
        if (["SUCCESS", "FAILED", "EXPIRED"].includes(result.status)) { localStorage.removeItem(key); await refresh(); await renderDashboard(); }
        else if (Date.now() / 1000 < pending.expires) {
          await api(`/intents/${pending.id}/submit`, { method: "POST", body: JSON.stringify({ xdr: pending.xdr }) });
          $("pendingStatus").textContent = copy("A mesma transação foi reenviada. Aguarde a confirmação.", "The same transaction was resubmitted. Wait for confirmation.");
        } else $("pendingStatus").textContent = copy("A solicitação expirou. Consulte o hash no explorador antes de iniciar outro apoio; o status não foi presumido como falha.", "The request expired. Check its hash in the explorer before another support; failure was not assumed.");
      } catch (error) { $("pendingStatus").textContent = error.message; }
      finally { event.target.disabled = false; }
    });
  } catch (error) {
    if (version !== dashboardVersion) return;
    $("dashboardGrid").textContent = copy("Não foi possível atualizar os saldos. Tente novamente.", "Balances could not be refreshed. Try again.");
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-action";
    retry.textContent = copy("Tentar novamente", "Try again"); retry.addEventListener("click", renderDashboard); $("dashboardGrid").append(retry);
  }
}
