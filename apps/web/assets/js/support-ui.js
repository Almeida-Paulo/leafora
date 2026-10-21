import { api, walletOptions, connectWallet, disconnectWallet, signIntent, explorer, walletLaunchUrl } from "./stellar-wallet.js";
import { parseAmount, decimal, formatUnits, sharePercent } from "./money.js";
import { escapeHtml, safeMediaUrl, shortAddress, projectPath } from "./catalog.js";
import { formatUsd } from "./funding.js";
import { language, locale, routePath } from "./i18n.js";
import { renderWalletRewards } from "./rewards-ui.js";

const copy = (pt, en) => language === "en" ? en : pt;
let state, refresh, busy = false, walletBusy = false, walletLoadVersion = 0, dashboardVersion = 0;
const $ = id => document.getElementById(id);
const pendingKey = address => `leafora:stellar:pending:${state.wallet.config.network}:${state.wallet.config.contract}:${address}`;
const icon = name => `<svg class="dialog-icon" aria-hidden="true"><use href="/assets/icons/interface.svg#${name}"></use></svg>`;

function feedback(id, message = "", kind = "info") {
  const element = $(id);
  element.dataset.state = kind;
  const mark = kind === "loading" ? "loader" : kind === "error" ? "circle-alert" : kind === "success" ? "check" : "";
  element.innerHTML = message ? `${mark ? icon(mark) : ""}<span>${escapeHtml(message)}</span>` : "";
}

function walletError(error) {
  const message = error?.message || "";
  if (message.startsWith("Select Stellar ")) return copy("Selecione a rede Stellar Testnet na Freighter e tente novamente.", "Select Stellar Testnet in Freighter and try again.");
  if (/denied|declined|reject|cancel/i.test(message)) return copy("A conexão foi cancelada. Escolha a carteira para tentar novamente.", "Connection canceled. Select your wallet to try again.");
  if (/Invalid Stellar account|Wallet permission/i.test(message)) return copy("Não recebemos uma conta. Desbloqueie a carteira e autorize a conexão.", "No account was returned. Unlock your wallet and approve the connection.");
  return copy("Não foi possível conectar. Verifique se a carteira está desbloqueada e tente novamente.", "Unable to connect. Make sure your wallet is unlocked and try again.");
}

function supportError(error) {
  const message = error?.message || "";
  if (message.startsWith("Cannot authorize this transaction")) return copy("Não foi possível preparar o apoio. Confira o saldo de USDC, o XLM para taxas e a rede na carteira. A captação do projeto também precisa estar aberta.", "Unable to prepare your contribution. Check your USDC balance, XLM for fees and wallet network. The project's funding must also be open.");
  if (/Signature declined|denied|reject/i.test(message)) return copy("A assinatura foi recusada na carteira. Você pode revisar o valor e tentar novamente.", "Signing was declined in your wallet. You can review the amount and try again.");
  if (/Reconnect|Wallet account or network changed/i.test(message)) return copy("A conta ou a rede mudou. Reconecte sua carteira antes de apoiar.", "Your account or network changed. Reconnect your wallet before contributing.");
  if (/Request failed|Failed to fetch|timeout|timed out|networkerror/i.test(message)) return copy("Não foi possível consultar a rede. Se você já assinou, verifique o dashboard antes de tentar novamente.", "Unable to reach the network. If you already signed, check your dashboard before trying again.");
  return message || copy("Não foi possível concluir o apoio. Tente novamente.", "Unable to complete your contribution. Please try again.");
}

function confirmLabel(label, mark = "arrow-right") {
  $("confirmSupport").innerHTML = `<span>${escapeHtml(label)}</span>${icon(mark)}`;
}

export function setupSupport(appState, onRefresh) {
  state = appState; refresh = onRefresh;
  $("walletRiskAccepted").addEventListener("change", () => {
    $("walletList").querySelectorAll("button").forEach(button => { button.disabled = walletBusy || !$("walletRiskAccepted").checked; });
    if ($("walletList").querySelector("button")) feedback("walletStatus", $("walletRiskAccepted").checked
      ? copy("Selecione a carteira para continuar.", "Select your wallet to continue.")
      : copy("Confirme o aviso acima para continuar.", "Accept the notice above to continue."));
  });
  $("retryWallets").addEventListener("click", loadWalletProviders);
  $("confirmSupport").addEventListener("click", confirmSupport);
  $("supportDialog").addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  $("walletDialog").addEventListener("cancel", event => { if (walletBusy) event.preventDefault(); });
  $("walletDialog").addEventListener("close", () => { if (!state.wallet && !walletBusy) state.supportIntent = null; });
  window.addEventListener("leafora:wallet-disconnected", () => { state.wallet = null; renderWalletState(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.wallet) renderDashboard(); });
}

export async function openWalletDialog() {
  if (walletBusy || $("walletDialog").open) return;
  if (state.wallet) { await disconnectWallet(); return; }
  $("walletRiskAccepted").checked = false;
  $("walletDialog").showModal();
  await loadWalletProviders();
}

async function loadWalletProviders() {
  const version = ++walletLoadVersion;
  $("walletList").setAttribute("aria-busy", "true");
  $("walletList").innerHTML = `<div class="wallet-searching">${icon("loader")}<span>${copy("Buscando carteiras...", "Looking for wallets...")}</span></div>`;
  $("retryWallets").hidden = true;
  $("installWallet").hidden = true;
  feedback("walletStatus");
  try {
    const providers = await walletOptions();
    if (!$("walletDialog").open || version !== walletLoadVersion) return;
    $("walletList").replaceChildren();
    for (const provider of providers) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "wallet-provider"; button.disabled = !$("walletRiskAccepted").checked;
      button.innerHTML = `<span class="wallet-provider-logo" aria-hidden="true">${provider.kind === "extension" ? '<img src="/assets/icons/freighter.svg" width="30" height="30" alt="">' : icon("qr-code")}</span>
        <span class="wallet-provider-copy"><strong>${escapeHtml(provider.name)}</strong><small>${provider.kind === "extension" ? copy("Extensão do navegador", "Browser extension") : copy("Celular ou código QR", "Mobile or QR code")}</small></span>
        <span class="wallet-provider-action">${icon("arrow-right")}</span>`;
      button.addEventListener("click", async () => {
        if (walletBusy || !$("walletRiskAccepted").checked) return;
        walletBusy = true;
        button.classList.add("busy");
        button.setAttribute("aria-busy", "true");
        button.querySelector(".wallet-provider-action").innerHTML = icon("loader");
        $("walletList").querySelectorAll("button").forEach(item => { item.disabled = true; });
        $("walletRiskAccepted").disabled = true;
        $("walletDialog").querySelector(".close-dialog").disabled = true;
        feedback("walletStatus", copy("Autorize a conexão na sua carteira.", "Approve the connection in your wallet."), "loading");
        try {
          // Close the native dialog so the WalletConnect modal is not trapped underneath it.
          const intent = state.supportIntent;
          if (provider.kind === "mobile") $("walletDialog").close();
          state.wallet = await connectWallet(provider);
          $("walletDialog").close();
          renderWalletState();
          state.supportIntent = null;
          if (intent) openSupportDialog(intent.projectId);
        } catch (error) {
          if (!$("walletDialog").open) $("walletDialog").showModal();
          feedback("walletStatus", walletError(error), "error");
        } finally {
          walletBusy = false;
          button.classList.remove("busy");
          button.removeAttribute("aria-busy");
          button.querySelector(".wallet-provider-action").innerHTML = icon("arrow-right");
          $("walletRiskAccepted").disabled = false;
          $("walletDialog").querySelector(".close-dialog").disabled = false;
          $("walletList").querySelectorAll("button").forEach(item => { item.disabled = !$("walletRiskAccepted").checked; });
        }
      });
      $("walletList").append(button);
    }
    if (providers.length) feedback("walletStatus", $("walletRiskAccepted").checked
      ? copy("Selecione a carteira para continuar.", "Select your wallet to continue.")
      : copy("Confirme o aviso acima para continuar.", "Accept the notice above to continue."));
    else {
      $("walletList").innerHTML = `<div class="wallet-empty">${icon("wallet")}<div><strong>${copy("Nenhuma carteira encontrada", "No wallet found")}</strong><p>${copy("Abra a Freighter neste navegador e tente novamente.", "Open Freighter in this browser and try again.")}</p></div></div>`;
      $("retryWallets").hidden = false;
      $("installWallet").hidden = false;
    }
  } catch (error) {
    if (version !== walletLoadVersion) return;
    $("walletList").replaceChildren();
    feedback("walletStatus", copy("Não foi possível buscar as carteiras. Tente novamente.", "Unable to look for wallets. Please try again."), "error");
    $("retryWallets").hidden = false;
  } finally {
    if (version === walletLoadVersion) $("walletList").setAttribute("aria-busy", "false");
  }
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
  $("supportProjectImage").src = safeMediaUrl(project.image);
  $("supportProjectLocation").textContent = project.location;
  $("supportMessage").textContent = copy("Escolha o valor. Você revisa e autoriza o apoio na sua carteira.", "Choose an amount. You review and approve your contribution in your wallet.");
  $("supportWallet").textContent = `${state.wallet.walletName} · ${shortAddress(state.wallet.address)}`;
  $("supportNetwork").textContent = state.wallet.config.network === "testnet" ? "Stellar Testnet" : "Stellar";
  $("riskAccepted").checked = false;
  feedback("supportStatus");
  $("tierOptions").innerHTML = `<label class="amount-label" for="supportAmount">${copy("Valor do apoio", "Support amount")} <span>(USDC)</span></label>
    <div class="amount-field"><span aria-hidden="true">$</span><input id="supportAmount" type="text" inputmode="decimal" autocomplete="off" maxlength="24" placeholder="${copy("0,00", "0.00")}" aria-describedby="allocationExplanation supportStatus"></div>
    <div class="support-presets" aria-label="${copy("Valores sugeridos em USDC", "Suggested amounts in USDC")}">${[1, 10, 25, 50].map(amount => `<button type="button" data-amount="${amount}" aria-pressed="false">$${amount}</button>`).join("")}</div>
    <div class="support-allocation"><span class="allocation-mark" aria-hidden="true">${icon("leaf")}</span><div><span>${copy("Sua participação", "Your allocation")}</span><p id="allocationExplanation">${copy("Neste projeto · 1 USDC = 1 AP", "In this project · 1 USDC = 1 AP")}</p></div><strong id="pointsPreview" aria-live="polite">0 AP</strong></div>`;
  $("supportAmount").addEventListener("input", () => {
    $("supportAmount").removeAttribute("aria-invalid");
    $("supportAmount").classList.toggle("long-amount", $("supportAmount").value.length > 12);
    try { $("pointsPreview").textContent = `${formatUnits(parseAmount($("supportAmount").value), locale)} AP`; }
    catch { $("pointsPreview").textContent = $("supportAmount").value ? "— AP" : "0 AP"; }
    $("tierOptions").querySelectorAll("[data-amount]").forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.amount === $("supportAmount").value)); });
  });
  $("tierOptions").querySelectorAll("[data-amount]").forEach(button => button.addEventListener("click", () => {
    $("supportAmount").value = button.dataset.amount;
    $("supportAmount").dispatchEvent(new Event("input"));
    $("supportAmount").focus();
  }));
  $("supportAmount").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); confirmSupport(); }
  });
  $("confirmSupport").disabled = false;
  confirmLabel(copy("Confirmar apoio", "Confirm support"));
  $("supportDialog").showModal();
  // Avoid opening the virtual keyboard before a mobile user has reviewed the project.
  if (window.matchMedia("(pointer: fine)").matches) $("supportAmount").focus();
}

async function confirmSupport() {
  if (busy || !state.wallet || !state.pendingSupport) return;
  const session = state.wallet, project = state.pendingSupport;
  let amount;
  try { amount = parseAmount($("supportAmount").value); }
  catch {
    feedback("supportStatus", copy("Digite um valor maior que zero, com até sete casas decimais.", "Enter an amount greater than zero, with up to seven decimal places."), "error");
    $("supportAmount").setAttribute("aria-invalid", "true"); $("supportAmount").focus(); return;
  }
  if (!$("riskAccepted").checked) { feedback("supportStatus", copy("Leia e confirme as condições do apoio.", "Read and accept the support terms."), "error"); $("riskAccepted").focus(); return; }
  const key = pendingKey(session.address);
  busy = true;
  confirmLabel(copy("Aguardando carteira", "Waiting for wallet"), "loader");
  $("confirmSupport").setAttribute("aria-busy", "true");
  $("supportDialog").querySelectorAll("button,input").forEach(item => { item.disabled = true; });
  try {
    let previous = JSON.parse(localStorage.getItem(key) || "null");
    if (previous) {
      const check = await api(`/transactions/${previous.hash}`);
      if (["SUCCESS", "FAILED", "EXPIRED"].includes(check.status)) localStorage.removeItem(key);
      else throw new Error(copy("Há um apoio aguardando confirmação. Consulte o dashboard antes de enviar outro.", "A support transaction is awaiting confirmation. Check your dashboard before sending another."));
    }
    feedback("supportStatus", copy("Preparando seu apoio...", "Preparing your contribution..."), "loading");
    const intent = await api(`/projects/${encodeURIComponent(project.id)}/prepare`, {
      method: "POST", body: JSON.stringify({ wallet: session.address, amount: decimal(amount) }) });
    feedback("supportStatus", copy("Confira o valor e confirme na carteira.", "Review the amount and confirm in your wallet."), "loading");
    const launchUrl = walletLaunchUrl(session);
    if (launchUrl) {
      const link = document.createElement("a"); link.href = launchUrl;
      link.textContent = copy(" Abrir carteira ↗", " Open wallet ↗");
      link.rel = "noopener noreferrer"; link.className = "text-action";
      $("supportStatus").querySelector("span").append(link);
    }
    const signed = await signIntent(session, intent);
    // Persist before submission: a timeout or tab close must not become a second payment.
    localStorage.setItem(key, JSON.stringify({ id: intent.id, hash: intent.hash, xdr: signed, expires: intent.expires }));
    const result = await api(`/intents/${intent.id}/submit`, { method: "POST", body: JSON.stringify({ xdr: signed }) });
    if (result.status === "FAILED") { localStorage.removeItem(key); throw new Error(copy("A transação falhou. Nenhum AP foi emitido.", "The transaction failed. No AP were issued.")); }
    for (let attempt = 0; attempt < 20; attempt++) {
      confirmLabel(copy("Confirmando apoio", "Confirming support"), "loader");
      feedback("supportStatus", copy("Aguardando confirmação da rede...", "Waiting for network confirmation..."), "loading");
      const confirmed = await api(`/transactions/${intent.hash}`);
      if (confirmed.status === "FAILED") { localStorage.removeItem(key); throw new Error(copy("A transação não foi confirmada.", "The transaction failed.")); }
      if (confirmed.status === "SUCCESS") {
        localStorage.removeItem(key);
        state.pendingSupport = null;
        confirmLabel(copy("Apoio confirmado", "Support confirmed"), "check");
        feedback("supportStatus", copy("Apoio confirmado. Seus AP estão registrados no projeto.", "Support confirmed. Your AP are recorded for this project."), "success");
        window.setTimeout(() => {
          if ($("supportDialog").open && state.pendingSupport === null) $("supportDialog").close();
        }, 1500);
        await refresh(); await renderDashboard(); return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    feedback("supportStatus", copy("A confirmação está demorando. Acompanhe a transação no dashboard; não é necessário pagar novamente.", "Confirmation is taking longer. Track the transaction in your dashboard; do not pay again."));
    renderDashboard();
  } catch (error) { feedback("supportStatus", supportError(error), "error"); }
  finally {
    busy = false;
    $("confirmSupport").removeAttribute("aria-busy");
    $("supportDialog").querySelectorAll("button,input").forEach(item => { item.disabled = false; });
    $("confirmSupport").disabled = !state.pendingSupport;
    if (state.pendingSupport) confirmLabel(copy("Confirmar apoio", "Confirm support"));
  }
}

export async function renderDashboard() {
  const session = state.wallet, version = ++dashboardVersion;
  $("walletGate").hidden = Boolean(session); $("connectedDashboard").hidden = !session;
  renderWalletRewards(session && !document.querySelector('[data-view="dashboard"]').hidden ? session.address : null);
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
