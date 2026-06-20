import { projects } from "./projects.js";
import { connectSuiWallet, explorerAddress, getDevnetReadiness, listSuiWallets, supportOnDevnet } from "./sui-devnet.js";

const state = {
  wallet: null,
  filter: "All",
  activeProject: projects[0],
  supports: loadSupports(),
  evidence: projects.flatMap((project) => project.evidence.map(toEvidence(project.id)))
};

const els = {
  walletButton: document.querySelector("#walletButton"),
  filters: document.querySelector("#filters"),
  grid: document.querySelector("#projectGrid"),
  detail: document.querySelector("#projectDetail"),
  evidenceList: document.querySelector("#evidenceList"),
  dashboard: document.querySelector("#dashboardGrid"),
  supportList: document.querySelector("#supportList"),
  captureProject: document.querySelector("#captureProject"),
  captureForm: document.querySelector("#captureForm"),
  captureFile: document.querySelector("#captureFile"),
  captureStatus: document.querySelector("#captureStatus"),
  search: document.querySelector("#projectSearch"),
  dialog: document.querySelector("#supportDialog"),
  walletDialog: document.querySelector("#walletDialog"),
  walletList: document.querySelector("#walletList"),
  walletStatus: document.querySelector("#walletStatus"),
  walletRiskAccepted: document.querySelector("#walletRiskAccepted"),
  supportTitle: document.querySelector("#supportTitle"),
  supportMessage: document.querySelector("#supportMessage"),
  supportStatus: document.querySelector("#supportStatus"),
  tierOptions: document.querySelector("#tierOptions"),
  confirmSupport: document.querySelector("#confirmSupport"),
  riskAccepted: document.querySelector("#riskAccepted")
};

let pendingSupport = null;

init();

function init() {
  els.walletButton.addEventListener("click", openWalletDialog);
  els.walletRiskAccepted.addEventListener("change", renderWalletOptions);
  els.search.addEventListener("input", renderProjects);
  els.captureForm.addEventListener("submit", onCaptureEvidence);
  els.confirmSupport.addEventListener("click", onConfirmSupport);
  renderFilters();
  renderProjects();
  renderDetail(projects[0]);
  renderRegistry();
  renderDashboard();
  renderCaptureOptions();
  renderMetrics();
  renderWalletButton();
}

async function openWalletDialog() {
  els.walletStatus.textContent = "Procurando wallets Sui instaladas...";
  els.walletRiskAccepted.checked = false;
  els.walletDialog.showModal();
  await renderWalletOptions();
}

async function renderWalletOptions() {
  const accepted = els.walletRiskAccepted.checked;
  let providers = [];
  try {
    providers = await listSuiWallets();
  } catch (error) {
    els.walletStatus.textContent = error.message;
  }

  if (!providers.length) {
    els.walletList.innerHTML = `<p class="empty">Nenhuma wallet Sui detectada neste navegador.</p>`;
    els.walletStatus.textContent = "Instale uma wallet Sui, desbloqueie a conta e selecione devnet.";
    return;
  }

  els.walletList.innerHTML = providers.map((provider, index) => `
    <button class="wallet-option" type="button" data-wallet-index="${index}" ${accepted ? "" : "disabled"}>
      <span class="wallet-icon">${provider.icon ? `<img src="${escapeHtml(provider.icon)}" alt="">` : "SUI"}</span>
      <span>
        <strong>${escapeHtml(provider.name)}</strong>
        <small>${provider.supportsDevnet ? "Sui devnet detectada" : "Verifique a rede na wallet"}</small>
      </span>
      <em>${provider.canSign ? "Assinatura" : "Somente leitura"}</em>
    </button>
  `).join("");

  els.walletStatus.textContent = accepted
    ? "Escolha a wallet para continuar."
    : "Aceite o aviso de teste para habilitar a conexao.";

  els.walletList.querySelectorAll("[data-wallet-index]").forEach((button) => {
    button.addEventListener("click", () => onConnectWallet(providers[Number(button.dataset.walletIndex)]));
  });
}

async function onConnectWallet(provider) {
  try {
    if (!els.walletRiskAccepted.checked && els.walletDialog.open) {
      els.walletRiskAccepted.focus();
      return;
    }
    els.walletStatus.textContent = "Aguardando confirmacao na wallet...";
    state.wallet = await connectSuiWallet(provider);
    els.walletButton.title = explorerAddress(state.wallet.address);
    els.walletDialog.close();
    renderWalletButton();
    renderDashboard();
  } catch (error) {
    if (els.walletDialog.open) {
      els.walletStatus.textContent = error.message;
    } else {
      alert(error.message);
    }
  }
}

function renderFilters() {
  const filters = ["All", ...new Set(projects.map((project) => project.biome))];
  els.filters.innerHTML = filters.map((filter) => `<button type="button" class="${filter === state.filter ? "active" : ""}" data-filter="${escapeHtml(filter)}">${escapeHtml(filter)}</button>`).join("");
  els.filters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      renderFilters();
      renderProjects();
    });
  });
}

function renderProjects() {
  const q = els.search.value.trim().toLowerCase();
  const visible = projects.filter((project) => {
    const byFilter = state.filter === "All" || project.biome === state.filter;
    const text = [project.name, project.category, project.biome, project.location, project.impact].join(" ").toLowerCase();
    return byFilter && text.includes(q);
  });

  els.grid.innerHTML = visible.map((project) => {
    const progress = Math.min(100, Math.round((project.raisedSui / project.goalSui) * 100));
    return `
      <article class="project-card">
        <div class="project-media">
          <img src="${project.image}" alt="${escapeHtml(project.name)}">
          <span class="status">${escapeHtml(project.status)}</span>
        </div>
        <div class="project-body">
          <div class="title-row"><h3>${escapeHtml(project.name)}</h3><span>${escapeHtml(project.biome)}</span></div>
          <p class="location">${escapeHtml(project.location)}</p>
          <p>${escapeHtml(project.objective)}</p>
          <strong class="impact">${escapeHtml(project.impact)}</strong>
          <div class="progress-label"><span>${formatSui(project.raisedSui)}</span><span>${progress}% de ${formatSui(project.goalSui)}</span></div>
          <div class="progress"><span style="width:${progress}%"></span></div>
          <div class="card-actions">
            <button class="primary-action compact" data-support="${project.id}" type="button">Apoiar</button>
            <button class="secondary-action compact" data-detail="${project.id}" type="button">Detalhes</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  els.grid.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => renderDetail(getProject(button.dataset.detail)));
  });
  els.grid.querySelectorAll("[data-support]").forEach((button) => {
    button.addEventListener("click", () => openSupport(getProject(button.dataset.support)));
  });
}

function renderDetail(project) {
  state.activeProject = project;
  els.detail.innerHTML = `
    <div class="detail-hero">
      <img src="${project.image}" alt="${escapeHtml(project.name)}">
      <div>
        <p class="eyebrow">${escapeHtml(project.category)}</p>
        <h2>${escapeHtml(project.name)}</h2>
        <p class="location">${escapeHtml(project.location)}</p>
        <p>${escapeHtml(project.story)}</p>
        <p class="risk">${escapeHtml(project.risks)}</p>
      </div>
    </div>
    <div class="detail-grid">
      <div class="panel">
        <h3>Milestones</h3>
        ${project.milestones.map(([title, amount, status]) => `<div class="milestone"><span class="${status}"></span><div><strong>${escapeHtml(title)}</strong><p>${formatSui(amount)} - ${status}</p></div></div>`).join("")}
      </div>
      <div class="panel">
        <h3>NFT tiers</h3>
        <div class="tier-grid">
          ${project.tiers.map(([id, name, amount, points]) => `<button type="button" data-tier="${id}"><strong>${escapeHtml(name)}</strong><span>${formatSui(amount)}</span><small>${points} allocation points</small></button>`).join("")}
        </div>
      </div>
    </div>
  `;
  els.detail.querySelectorAll("[data-tier]").forEach((button) => {
    button.addEventListener("click", () => openSupport(project, button.dataset.tier));
  });
  location.hash = "projectDetail";
}

function openSupport(project, tierId = project.tiers[0][0]) {
  const tier = project.tiers.find((item) => item[0] === tierId) || project.tiers[0];
  pendingSupport = { project, tier };
  els.supportTitle.textContent = project.name;
  els.supportMessage.textContent = "Apoio em Sui devnet. Sem promessa de retorno, credito de carbono ou lucro.";
  els.supportStatus.textContent = getDevnetReadiness(pendingSupport?.project || project).message;
  els.tierOptions.innerHTML = project.tiers.map(([id, name, amount, points, chainTier, metadataUri, description]) => `
    <label class="tier-option ${id === tier[0] ? "selected" : ""}">
      <input type="radio" name="tier" value="${id}" ${id === tier[0] ? "checked" : ""}>
      <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span>
      <em>${formatSui(amount)} / ${points} pts</em>
    </label>
  `).join("");
  els.tierOptions.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      pendingSupport.tier = project.tiers.find((item) => item[0] === input.value);
      els.tierOptions.querySelectorAll(".tier-option").forEach((node) => node.classList.remove("selected"));
      input.closest(".tier-option").classList.add("selected");
    });
  });
  els.riskAccepted.checked = false;
  els.dialog.showModal();
}

async function onConfirmSupport() {
  if (!els.riskAccepted.checked) {
    els.riskAccepted.focus();
    return;
  }
  if (!state.wallet) {
    await openWalletDialog();
    els.supportStatus.textContent = "Conecte uma wallet Sui devnet e confirme o apoio novamente.";
    return;
  }
  const [id, name, amount, points, chainTier, metadataUri] = pendingSupport.tier;
  setSupportBusy(true, "Preparando transacao na Sui devnet...");
  try {
    const result = await supportOnDevnet({ walletSession: state.wallet, project: pendingSupport.project, tier: { id, name, amount, points, chainTier, metadataUri } });
    state.supports.unshift({
      projectName: pendingSupport.project.name,
      tierName: name,
      amount,
      points,
      digest: result.digest,
      explorerUrl: result.explorerUrl,
      createdAt: new Date().toISOString()
    });
    saveSupports();
    els.supportStatus.textContent = `Transacao assinada: ${shortAddress(result.digest)}.`;
    setTimeout(() => {
      if (els.dialog.open) els.dialog.close();
    }, 900);
    renderDashboard();
    renderMetrics();
  } catch (error) {
    els.supportStatus.textContent = error.message;
  } finally {
    setSupportBusy(false);
  }
}

function renderRegistry() {
  els.evidenceList.innerHTML = state.evidence.map((record) => `
    <article class="evidence-row">
      <div>
        <span class="status ${record.status.toLowerCase()}">${escapeHtml(record.status)}</span>
        <h3>${escapeHtml(record.title)}</h3>
        <p>${escapeHtml(getProject(record.projectId).name)} - geohash ${escapeHtml(record.geohash)} - ${formatDate(record.timestamp)}</p>
        <code>${record.hash.slice(0, 24)}...${record.hash.slice(-10)}</code>
      </div>
      <span>#</span>
    </article>
  `).join("");
}

function renderDashboard() {
  const amount = state.supports.reduce((sum, item) => sum + item.amount, 0);
  const points = state.supports.reduce((sum, item) => sum + item.points, 0);
  els.dashboard.innerHTML = `
    <article class="stat-card"><h3>${state.wallet ? shortAddress(state.wallet.address) : "Wallet nao conectada"}</h3><p>Sui devnet. Use uma wallet configurada para devnet.</p></article>
    <article class="stat-card"><h3>${formatSui(amount)}</h3><p>Apoio assinado neste browser.</p></article>
    <article class="stat-card"><h3>${points.toLocaleString("en-US")}</h3><p>Allocation points condicionais.</p></article>
  `;
  els.supportList.innerHTML = state.supports.length
    ? state.supports.map((item) => `
      <article class="support-row">
        <strong>${escapeHtml(item.tierName)} - ${escapeHtml(item.projectName)}</strong>
        <p>${formatSui(item.amount)} / ${item.points} pts / ${escapeHtml(shortAddress(item.digest))}</p>
        ${item.explorerUrl ? `<a class="text-link" href="${escapeHtml(item.explorerUrl)}" target="_blank" rel="noreferrer">Ver no explorer</a>` : ""}
      </article>
    `).join("")
    : `<p class="empty">Nenhum apoio assinado nesta wallet/browser.</p>`;
}

function renderWalletButton() {
  if (!state.wallet) {
    els.walletButton.textContent = "Conectar Sui wallet";
    els.walletButton.classList.remove("wrong-network");
    return;
  }

  const label = state.wallet.walletName ? `${state.wallet.walletName} ${shortAddress(state.wallet.address)}` : shortAddress(state.wallet.address);
  els.walletButton.textContent = label;
  els.walletButton.classList.toggle("wrong-network", !state.wallet.supportsDevnet);
}

function renderCaptureOptions() {
  els.captureProject.innerHTML = projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("");
}

async function onCaptureEvidence(event) {
  event.preventDefault();
  const file = els.captureFile.files[0];
  if (!file) return;
  els.captureStatus.textContent = "Calculando hash SHA-256...";
  const hash = await sha256(file);
  const projectId = els.captureProject.value;
  state.evidence.unshift({
    id: `EV-${Date.now()}`,
    projectId,
    title: file.name,
    status: "Pending",
    hash: `0x${hash}`,
    geohash: await approximateGeohash(getProject(projectId).location),
    timestamp: new Date().toISOString(),
    source: "Leafora Capture browser package"
  });
  els.captureStatus.textContent = "Evidencia preparada. O upload descentralizado e a ancoragem on-chain entram apos vendorarmos o SDK Sui.";
  els.captureForm.reset();
  renderRegistry();
  renderMetrics();
}

function renderMetrics() {
  document.querySelector("#metricProjects").textContent = String(projects.length);
  document.querySelector("#metricRaised").textContent = formatSui(projects.reduce((sum, p) => sum + p.raisedSui, 0) + state.supports.reduce((sum, s) => sum + s.amount, 0));
  document.querySelector("#metricEvidence").textContent = String(state.evidence.length);
}

function toEvidence(projectId) {
  return ([id, title, status, hash, geohash, timestamp, source]) => ({ id, projectId, title, status, hash, geohash, timestamp, source });
}

function setSupportBusy(isBusy, message = "") {
  els.confirmSupport.disabled = isBusy;
  els.confirmSupport.textContent = isBusy ? "Aguardando wallet..." : "Assinar na devnet";
  if (message) els.supportStatus.textContent = message;
}

function loadSupports() {
  try {
    return JSON.parse(localStorage.getItem("leafora.supports") || "[]");
  } catch (_error) {
    return [];
  }
}

function saveSupports() {
  try {
    localStorage.setItem("leafora.supports", JSON.stringify(state.supports.slice(0, 25)));
  } catch (_error) {
    // Dashboard persistence is helpful, but signing must not depend on storage.
  }
}

function getProject(id) {
  return projects.find((project) => project.id === id) || projects[0];
}

async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function approximateGeohash(fallback) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(fallback.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude < 0 ? "s" : "n"}${pos.coords.longitude < 0 ? "w" : "e"}${Math.abs(pos.coords.latitude).toFixed(3).replace(".", "")}${Math.abs(pos.coords.longitude).toFixed(3).replace(".", "")}`.slice(0, 10)),
      () => resolve(fallback.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

function formatSui(value) {
  return `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} SUI`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function shortAddress(value) {
  if (!value) return "";
  return value.length > 16 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
