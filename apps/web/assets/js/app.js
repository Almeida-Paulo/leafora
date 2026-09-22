import {
  escapeHtml,
  formatDate,
  formatHash,
  formatSui,
  loadProjectCatalog,
  loadProjectEvidence,
  milestoneLabel,
  projectPath,
  projectProgress,
  renderProjectCard,
  safeMediaUrl,
  shortAddress,
  statusLabel
} from "./catalog.js";
import {
  connectSuiWallet,
  explorerAddress,
  explorerTransaction,
  getDevnetReadiness,
  listSuiWallets,
  supportOnDevnet
} from "./sui-devnet.js";

const STORAGE_KEY = "leafora:signed-supports:v1";
const views = [...document.querySelectorAll("[data-view]")];
const navToggle = document.querySelector("#navToggle");
const primaryNav = document.querySelector("#primaryNav");
const walletDialog = document.querySelector("#walletDialog");
const walletList = document.querySelector("#walletList");
const walletStatus = document.querySelector("#walletStatus");
const walletRiskAccepted = document.querySelector("#walletRiskAccepted");
const supportDialog = document.querySelector("#supportDialog");
const supportTitle = document.querySelector("#supportTitle");
const supportMessage = document.querySelector("#supportMessage");
const supportStatus = document.querySelector("#supportStatus");
const tierOptions = document.querySelector("#tierOptions");
const riskAccepted = document.querySelector("#riskAccepted");
const confirmSupport = document.querySelector("#confirmSupport");

const state = {
  projects: [],
  filter: "Todos",
  sort: "featured",
  search: "",
  wallet: null,
  supports: loadSignedSupports(),
  pendingSupport: null,
  supportIntent: null,
  routeVersion: 0
};

bindEvents();
initialize();

async function initialize() {
  renderLoadingStates();
  state.projects = await loadProjectCatalog();
  renderHome();
  renderMarketplace();
  renderRoute({ scroll: false });
  renderWalletState();
}

function bindEvents() {
  navToggle?.addEventListener("click", () => {
    const open = navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", String(open));
    primaryNav?.classList.toggle("open", open);
  });

  window.addEventListener("popstate", () => renderRoute({ scroll: false }));

  document.addEventListener("click", (event) => {
    const routeLink = event.target.closest("a[data-route]");
    if (routeLink && shouldHandleRouteClick(event, routeLink)) {
      event.preventDefault();
      navigateTo(routeLink.href);
      return;
    }

    const supportButton = event.target.closest("[data-support]");
    if (supportButton && !supportButton.disabled) {
      openSupportDialog(supportButton.dataset.support, supportButton.dataset.tier || "");
      return;
    }

    const walletButton = event.target.closest("[data-wallet-connect]");
    if (walletButton) openWalletDialog();
  });

  document.querySelector("#projectSearch")?.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderMarketplaceGrid();
  });

  document.querySelector("#projectSort")?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderMarketplaceGrid();
  });

  document.querySelector("#filters")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter || "Todos";
    updateMarketplaceUrl();
    renderMarketplaceGrid();
  });

  walletRiskAccepted?.addEventListener("change", updateWalletProviderState);
  confirmSupport?.addEventListener("click", confirmPendingSupport);
  supportDialog?.addEventListener("close", resetSupportDialog);
  walletDialog?.addEventListener("close", () => {
    walletStatus.textContent = "";
    if (!state.wallet) state.supportIntent = null;
  });
}

function renderLoadingStates() {
  const loading = '<div class="loading-state"><span></span><p>Carregando projetos...</p></div>';
  const featured = document.querySelector("#featuredProjectGrid");
  const catalog = document.querySelector("#projectGrid");
  if (featured) featured.innerHTML = loading;
  if (catalog) catalog.innerHTML = loading;
}

function renderHome() {
  const featured = document.querySelector("#featuredProjectGrid");
  if (featured) {
    featured.innerHTML = state.projects.length
      ? state.projects.slice(0, 3).map(renderProjectCard).join("")
      : emptyState("Nenhum projeto publicado", "A curadoria ainda nao publicou projetos neste ambiente.");
  }

  const biomes = uniqueValues(state.projects.map((project) => project.biome));
  const impactIndex = document.querySelector("#impactIndex");
  if (impactIndex) {
    impactIndex.innerHTML = biomes.length
      ? biomes.map((biome, index) => `
          <a href="/projects?biome=${encodeURIComponent(biome)}" data-route>
            <span>${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(biome)}</strong>
            <i aria-hidden="true">&rarr;</i>
          </a>
        `).join("")
      : '<p class="muted-copy">Biomas em processo de catalogacao.</p>';
  }

  setText("#metricProjects", state.projects.length);
  setText("#metricRaised", formatSui(totalRaised()));
  setText("#metricEvidence", totalEvidence());
}

function renderMarketplace() {
  const biomes = uniqueValues(state.projects.map((project) => project.biome));
  const filters = document.querySelector("#filters");
  if (filters) {
    filters.innerHTML = ["Todos", ...biomes].map((biome) => `
      <button type="button" data-filter="${escapeHtml(biome)}" class="${state.filter === biome ? "active" : ""}" aria-pressed="${state.filter === biome}">
        ${escapeHtml(biome)}
      </button>
    `).join("");
  }

  setText("#marketProjectCount", state.projects.length);
  setText("#marketBiomeCount", biomes.length);
  setText("#marketEvidenceCount", totalEvidence());
  renderMarketplaceGrid();
}

function renderMarketplaceGrid() {
  const query = normalizeText(state.search);
  const matching = state.projects.filter((project) => {
    const matchesBiome = state.filter === "Todos" || project.biome === state.filter;
    const haystack = normalizeText([
      project.name,
      project.category,
      project.biome,
      project.location,
      project.impact,
      project.objective
    ].join(" "));
    return matchesBiome && (!query || haystack.includes(query));
  });

  const sorted = [...matching].sort(projectSorter(state.sort));
  const grid = document.querySelector("#projectGrid");
  if (grid) {
    grid.innerHTML = sorted.length
      ? sorted.map(renderProjectCard).join("")
      : emptyState("Nenhum projeto encontrado", "Altere a busca ou remova o filtro para consultar outras iniciativas.");
  }

  setText("#resultCount", `${sorted.length} ${sorted.length === 1 ? "projeto encontrado" : "projetos encontrados"}`);
  document.querySelectorAll("#filters [data-filter]").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderRoute({ scroll = true } = {}) {
  const route = parseRoute(window.location.pathname);
  state.routeVersion += 1;
  const version = state.routeVersion;

  if (route.view === "projects") applyMarketplaceQuery();

  views.forEach((view) => {
    view.hidden = view.dataset.view !== route.view;
  });

  document.querySelectorAll("[data-nav]").forEach((link) => {
    const current = link.dataset.nav === route.nav;
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  updateDocumentMetadata(route);
  closeNavigation();

  if (route.view === "project") renderProjectDetail(route.slug, version);
  if (route.view === "dashboard") renderDashboard();
  if (scroll) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

async function renderProjectDetail(slug, version) {
  const container = document.querySelector("#projectDetail");
  if (!container) return;
  const project = state.projects.find((item) => item.id === slug);

  if (!project) {
    container.innerHTML = `
      <section class="not-found">
        <p class="eyebrow">Projeto nao encontrado</p>
        <h1>Esta iniciativa nao esta disponivel.</h1>
        <p>Ela pode estar em curadoria, arquivada ou ter sido acessada por um endereco incorreto.</p>
        <a class="primary-action" href="/projects" data-route>Voltar ao marketplace</a>
      </section>
    `;
    return;
  }

  container.innerHTML = '<div class="loading-state page-loading"><span></span><p>Carregando o projeto...</p></div>';
  const evidence = await loadProjectEvidence(project);
  if (version !== state.routeVersion) return;

  const progress = projectProgress(project);
  const readiness = getDevnetReadiness(project);
  const tiers = project.tiers.map(normalizeTier).filter((tier) => tier.slug && tier.amount > 0);
  const supportDisabled = !tiers.length || !readiness.ready ? "disabled aria-disabled=\"true\"" : "";
  const supportLabel = !tiers.length
    ? "Apoio em preparacao"
    : readiness.ready
      ? "Apoiar este projeto"
      : "Assinatura em configuracao";

  container.innerHTML = `
    <nav class="breadcrumb" aria-label="Caminho">
      <a href="/projects" data-route>Projetos</a><span aria-hidden="true">/</span><span>${escapeHtml(project.name)}</span>
    </nav>

    <section class="project-hero-layout">
      <div class="project-detail-media">
        <img src="${safeMediaUrl(project.image)}" alt="${escapeHtml(project.name)}">
        <div class="media-badges"><span class="status-badge">${escapeHtml(statusLabel(project.status))}</span><span class="chain-badge">SUI DEVNET</span></div>
      </div>
      <div class="project-detail-copy">
        <div class="project-kicker"><span>${escapeHtml(project.category)}</span><span>${escapeHtml(project.biome)}</span></div>
        <h1>${escapeHtml(project.name)}</h1>
        <p class="detail-location">${escapeHtml(project.location)}</p>
        <p class="detail-objective">${escapeHtml(project.objective)}</p>
        <dl class="project-facts">
          <div><dt>Impacto esperado</dt><dd>${escapeHtml(project.impact)}</dd></div>
          <div><dt>Evidencias publicas</dt><dd>${evidence.length}</dd></div>
          <div><dt>Apoiadores registrados</dt><dd>${project.supporters || 0}</dd></div>
        </dl>
      </div>
      <aside class="funding-panel" aria-label="Captacao do projeto">
        <p class="funding-label">Captacao em Sui devnet</p>
        <strong class="funding-total">${formatSui(project.raisedSui)}</strong>
        <div class="funding-progress-line"><span>de ${formatSui(project.goalSui)}</span><b>${progress}%</b></div>
        <div class="progress large" aria-label="${progress}% da meta"><span style="width:${progress}%"></span></div>
        <button class="primary-action wide" data-support="${escapeHtml(project.id)}" ${supportDisabled} type="button">${supportLabel}</button>
        <p class="readiness-note ${readiness.ready ? "ready" : "pending"}">${readiness.ready ? "Projeto configurado para assinatura na devnet." : "Assinatura on-chain em configuracao para este projeto."}</p>
        <p class="risk-caption">Apoio experimental, sem promessa de lucro, retorno financeiro ou emissao de credito ambiental.</p>
      </aside>
    </section>

    <nav class="project-subnav" aria-label="Secoes do projeto">
      <a href="#visao-geral">Visao geral</a>
      <a href="#etapas">Etapas</a>
      <a href="#evidencias">Evidencias</a>
      <a href="#riscos">Riscos</a>
    </nav>

    <section class="project-content" id="visao-geral">
      <div class="project-story">
        <p class="eyebrow">Sobre o projeto</p>
        <h2>Uma iniciativa com escopo, territorio e execucao acompanhaveis.</h2>
        <p>${escapeHtml(project.story)}</p>
      </div>
      <aside class="project-support-tiers" aria-labelledby="tiersTitle">
        <p class="eyebrow">Faixas de apoio</p>
        <h2 id="tiersTitle">Escolha sua participacao</h2>
        ${tiers.length ? tiers.map((tier) => tierSummary(project, tier, readiness.ready)).join("") : '<p class="muted-copy">As faixas deste projeto ainda nao foram publicadas.</p>'}
      </aside>
    </section>

    <section class="project-section" id="etapas">
      <div class="section-heading project-section-heading"><div><p class="eyebrow">Execucao</p><h2>Milestones do projeto</h2></div><p>${project.milestones.length} etapas publicadas</p></div>
      <div class="milestone-timeline">
        ${project.milestones.length ? project.milestones.map(renderMilestone).join("") : emptyState("Etapas em definicao", "A curadoria ainda nao publicou o cronograma deste projeto.")}
      </div>
    </section>

    <section class="project-section evidence-section" id="evidencias">
      <div class="section-heading project-section-heading">
        <div><p class="eyebrow">Trilha de verificacao</p><h2>Evidencias vinculadas ao projeto</h2></div>
        <a class="text-action" href="/method" data-route>Entender a prova <span aria-hidden="true">&rarr;</span></a>
      </div>
      <div class="evidence-list">
        ${evidence.length ? evidence.map(renderEvidence).join("") : emptyState("Nenhuma evidencia publicada", "Os registros aparecerao aqui depois da captura, revisao e vinculacao ao projeto.")}
      </div>
    </section>

    <section class="risk-band" id="riscos">
      <div><p class="eyebrow">Riscos declarados</p><h2>Transparencia inclui explicar o que pode nao sair como previsto.</h2></div>
      <p>${escapeHtml(project.risks)}</p>
    </section>
  `;
}

function renderMilestone(item, index) {
  const title = Array.isArray(item) ? item[0] : item?.title;
  const target = Array.isArray(item) ? item[1] : item?.targetAmount;
  const status = Array.isArray(item) ? item[2] : item?.status;
  const description = Array.isArray(item) ? item[3] : item?.description;
  const normalizedStatus = String(status || "planned").toLowerCase();
  return `
    <article class="milestone-item ${escapeHtml(normalizedStatus)}">
      <div class="milestone-index"><span>${String(index + 1).padStart(2, "0")}</span></div>
      <div class="milestone-copy">
        <span class="milestone-status">${escapeHtml(milestoneLabel(status))}</span>
        <h3>${escapeHtml(title || "Etapa sem titulo")}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      <strong>${formatSui(target)}</strong>
    </article>
  `;
}

function renderEvidence(record) {
  const txUrl = record.txDigest ? explorerTransaction(encodeURIComponent(record.txDigest)) : "";
  return `
    <article class="evidence-row">
      <div class="evidence-primary">
        <span class="evidence-status">${escapeHtml(statusLabel(record.status))}</span>
        <h3>${escapeHtml(record.title)}</h3>
        <p>${escapeHtml(record.id)} · ${escapeHtml(formatDate(record.timestamp))}</p>
      </div>
      <dl>
        <div><dt>Geohash</dt><dd>${escapeHtml(record.geohash)}</dd></div>
        <div><dt>Hash do arquivo</dt><dd title="${escapeHtml(record.contentHash)}">${escapeHtml(formatHash(record.contentHash))}</dd></div>
        <div><dt>Origem</dt><dd>${escapeHtml(record.source)}</dd></div>
      </dl>
      ${txUrl ? `<a class="text-action" href="${escapeHtml(txUrl)}" target="_blank" rel="noopener noreferrer">Ver transacao <span aria-hidden="true">&nearr;</span></a>` : '<span class="anchoring-state">Ancoragem pendente</span>'}
    </article>
  `;
}

function tierSummary(project, tier, supportReady) {
  return `
    <button class="tier-summary" type="button" data-support="${escapeHtml(project.id)}" data-tier="${escapeHtml(tier.slug)}" ${supportReady ? "" : "disabled aria-disabled=\"true\""}>
      <span><strong>${escapeHtml(tier.name)}</strong><small>${escapeHtml(tier.description || "Participacao registrada no projeto.")}</small></span>
      <span><b>${formatSui(tier.amount)}</b><small>${tier.points.toLocaleString("pt-BR")} Allocation Points</small></span>
    </button>
  `;
}

function openSupportDialog(projectId, tierSlug = "") {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  const tiers = project.tiers.map(normalizeTier).filter((tier) => tier.slug && tier.amount > 0);
  if (!tiers.length) return;

  if (!state.wallet) {
    state.supportIntent = { projectId, tierSlug };
    openWalletDialog();
    return;
  }

  const selectedTier = tiers.find((tier) => tier.slug === tierSlug) || tiers[0];
  state.pendingSupport = { project, tiers };
  supportTitle.textContent = project.name;
  supportMessage.textContent = "Escolha uma faixa. A wallet mostrara os dados finais antes de qualquer assinatura.";
  supportStatus.textContent = publicReadinessMessage(project);
  supportStatus.className = `form-status ${getDevnetReadiness(project).ready ? "success" : "warning"}`;
  riskAccepted.checked = false;
  tierOptions.innerHTML = tiers.map((tier) => `
    <label class="tier-option">
      <input type="radio" name="supportTier" value="${escapeHtml(tier.slug)}" ${tier.slug === selectedTier.slug ? "checked" : ""}>
      <span><strong>${escapeHtml(tier.name)}</strong><small>${escapeHtml(tier.description || "Participacao registrada no projeto.")}</small></span>
      <span><b>${formatSui(tier.amount)}</b><small>${tier.points.toLocaleString("pt-BR")} pontos</small></span>
    </label>
  `).join("");
  supportDialog.showModal();
}

async function confirmPendingSupport() {
  const pending = state.pendingSupport;
  if (!pending) return;
  const selectedSlug = tierOptions.querySelector('input[name="supportTier"]:checked')?.value;
  const tier = pending.tiers.find((item) => item.slug === selectedSlug);

  if (!riskAccepted.checked) {
    setSupportStatus("Confirme que compreendeu os riscos antes de continuar.", "error");
    return;
  }
  if (!tier) {
    setSupportStatus("Selecione uma faixa de apoio valida.", "error");
    return;
  }
  if (!state.wallet) {
    setSupportStatus("Conecte uma Sui wallet antes de assinar.", "error");
    return;
  }
  if (!getDevnetReadiness(pending.project).ready) {
    setSupportStatus(publicReadinessMessage(pending.project), "warning");
    return;
  }

  setSupportBusy(true);
  setSupportStatus("Aguardando confirmacao na wallet...", "");
  try {
    const result = await supportOnDevnet({
      walletSession: state.wallet,
      project: pending.project,
      tier
    });
    const support = {
      digest: result.digest,
      explorerUrl: result.explorerUrl,
      address: state.wallet.address,
      projectId: pending.project.id,
      projectName: pending.project.name,
      tierName: tier.name,
      amount: tier.amount,
      points: tier.points,
      createdAt: new Date().toISOString()
    };
    saveSignedSupport(support);
    setSupportStatus(`Transacao confirmada: ${formatHash(result.digest)}`, "success");
    renderHome();
    renderDashboard();
  } catch (error) {
    setSupportStatus(error instanceof Error ? error.message : "Nao foi possivel concluir a assinatura.", "error");
  } finally {
    setSupportBusy(false);
  }
}

async function openWalletDialog() {
  walletRiskAccepted.checked = false;
  walletStatus.textContent = "Buscando wallets Sui autorizadas neste navegador...";
  walletStatus.className = "form-status";
  walletList.innerHTML = '<div class="wallet-loading"><span></span>Consultando providers...</div>';
  walletDialog.showModal();

  try {
    const providers = await listSuiWallets();
    if (!walletDialog.open) return;
    if (!providers.length) {
      walletList.innerHTML = `
        <div class="wallet-empty">
          <strong>Nenhuma Sui wallet detectada.</strong>
          <p>Instale ou habilite uma wallet compativel, desbloqueie a conta e selecione a rede devnet.</p>
        </div>
      `;
      walletStatus.textContent = "A extensao deve ter permissao para funcionar neste site.";
      return;
    }

    walletList.innerHTML = providers.map((provider, index) => `
      <button type="button" class="wallet-provider" data-wallet-index="${index}" disabled>
        ${provider.icon ? `<img src="${safeMediaUrl(provider.icon)}" alt="">` : '<span class="wallet-provider-mark" aria-hidden="true">S</span>'}
        <span><strong>${escapeHtml(provider.name)}</strong><small>${provider.supportsDevnet ? "Sui devnet detectada" : "Confirme a rede devnet na wallet"}</small></span>
        <i aria-hidden="true">&rarr;</i>
      </button>
    `).join("");
    walletStatus.textContent = "Confirme o aviso para habilitar a conexao.";

    walletList.querySelectorAll("[data-wallet-index]").forEach((button) => {
      button.addEventListener("click", () => connectProvider(providers[Number(button.dataset.walletIndex)], button));
    });
  } catch (error) {
    walletList.innerHTML = "";
    walletStatus.textContent = error instanceof Error ? error.message : "Nao foi possivel consultar as wallets.";
    walletStatus.className = "form-status error";
  }
}

async function connectProvider(provider, button) {
  if (!walletRiskAccepted.checked) {
    walletStatus.textContent = "Confirme o aviso de ambiente de testes antes de conectar.";
    walletStatus.className = "form-status error";
    return;
  }

  const buttons = [...walletList.querySelectorAll("button")];
  buttons.forEach((item) => { item.disabled = true; });
  button.classList.add("busy");
  walletStatus.textContent = `Aguardando autorizacao na ${provider.name}...`;
  walletStatus.className = "form-status";

  try {
    state.wallet = await connectSuiWallet(provider);
    renderWalletState();
    walletDialog.close();
    const intent = state.supportIntent;
    state.supportIntent = null;
    if (intent) window.setTimeout(() => openSupportDialog(intent.projectId, intent.tierSlug), 0);
  } catch (error) {
    walletStatus.textContent = error instanceof Error ? error.message : "A wallet recusou ou nao concluiu a conexao.";
    walletStatus.className = "form-status error";
    button.classList.remove("busy");
    updateWalletProviderState();
  }
}

function updateWalletProviderState() {
  const enabled = Boolean(walletRiskAccepted?.checked);
  walletList?.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
  if (enabled && walletStatus.textContent.includes("Confirme o aviso")) {
    walletStatus.textContent = "Selecione a wallet que deseja conectar.";
  }
}

function renderWalletState() {
  document.querySelectorAll("[data-wallet-connect]").forEach((button) => {
    if (!state.wallet) {
      button.textContent = button.closest("#walletGate") ? "Conectar Sui wallet" : "Conectar wallet";
      button.classList.remove("connected", "wrong-network");
      button.removeAttribute("title");
      return;
    }

    button.textContent = shortAddress(state.wallet.address);
    button.classList.add("connected");
    button.classList.toggle("wrong-network", !state.wallet.supportsDevnet);
    button.title = state.wallet.supportsDevnet
      ? `${state.wallet.walletName} conectada em Sui devnet`
      : `${state.wallet.walletName} conectada fora da Sui devnet`;
  });
  renderDashboard();
}

function renderDashboard() {
  const gate = document.querySelector("#walletGate");
  const connected = document.querySelector("#connectedDashboard");
  if (!gate || !connected) return;

  gate.hidden = Boolean(state.wallet);
  connected.hidden = !state.wallet;
  if (!state.wallet) return;

  const ownSupports = state.supports.filter((support) => support.address === state.wallet.address);
  const totalAmount = ownSupports.reduce((sum, support) => sum + positiveNumber(support.amount), 0);
  const totalPoints = ownSupports.reduce((sum, support) => sum + Math.max(0, Math.trunc(positiveNumber(support.points))), 0);
  const uniqueProjects = new Set(ownSupports.map((support) => support.projectId)).size;
  const dashboard = document.querySelector("#dashboardGrid");
  const addressUrl = explorerAddress(encodeURIComponent(state.wallet.address));

  dashboard.innerHTML = `
    <article class="stat-card wallet-card">
      <span>Wallet conectada</span>
      <strong>${escapeHtml(shortAddress(state.wallet.address))}</strong>
      <a href="${escapeHtml(addressUrl)}" target="_blank" rel="noopener noreferrer">Abrir no explorer <span aria-hidden="true">&nearr;</span></a>
    </article>
    <article class="stat-card"><span>Apoio assinado</span><strong>${formatSui(totalAmount)}</strong><small>Historico local confirmado por digest</small></article>
    <article class="stat-card"><span>Allocation Points</span><strong>${totalPoints.toLocaleString("pt-BR")}</strong><small>Somente transacoes assinadas nesta wallet</small></article>
    <article class="stat-card"><span>Projetos apoiados</span><strong>${uniqueProjects}</strong><small>NFTs dependem da emissao on-chain do contrato</small></article>
  `;

  const supportList = document.querySelector("#supportList");
  supportList.innerHTML = ownSupports.length
    ? ownSupports.map(renderSignedSupport).join("")
    : emptyState("Nenhum apoio assinado nesta wallet", "Explore o marketplace e escolha um projeto configurado para a Sui devnet.", '<a class="primary-action compact" href="/projects" data-route>Explorar projetos</a>');
}

function renderSignedSupport(support) {
  const explorerUrl = explorerTransaction(encodeURIComponent(support.digest));
  return `
    <article class="support-row">
      <div><span>${escapeHtml(formatDate(support.createdAt))}</span><h3>${escapeHtml(support.projectName)}</h3><p>${escapeHtml(support.tierName)} · ${positiveNumber(support.points).toLocaleString("pt-BR")} Allocation Points</p></div>
      <strong>${formatSui(support.amount)}</strong>
      <a class="text-action" href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(formatHash(support.digest))} <span aria-hidden="true">&nearr;</span></a>
    </article>
  `;
}

function saveSignedSupport(support) {
  if (!support?.digest || state.supports.some((item) => item.digest === support.digest)) return;
  state.supports = [support, ...state.supports].slice(0, 100);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.supports));
  } catch (_error) {
    // A confirmacao on-chain continua valida mesmo se o navegador bloquear armazenamento local.
  }
}

function loadSignedSupports() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.filter((item) => {
      if (!item?.digest || seen.has(item.digest)) return false;
      seen.add(item.digest);
      return true;
    });
  } catch (_error) {
    return [];
  }
}

function normalizeTier(tier) {
  if (!Array.isArray(tier)) return { slug: "", name: "", amount: 0, points: 0, chainTier: 0, metadataUri: "", description: "" };
  return {
    slug: String(tier[0] || ""),
    name: String(tier[1] || tier[0] || "Faixa"),
    amount: positiveNumber(tier[2]),
    points: Math.max(0, Math.trunc(positiveNumber(tier[3]))),
    chainTier: Math.max(0, Math.trunc(positiveNumber(tier[4]))),
    metadataUri: String(tier[5] || ""),
    description: String(tier[6] || "")
  };
}

function parseRoute(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/") return { view: "home", nav: "" };
  if (path === "/projects") return { view: "projects", nav: "projects" };
  if (path === "/method") return { view: "method", nav: "method" };
  if (path === "/dashboard") return { view: "dashboard", nav: "dashboard" };
  if (path.startsWith("/project/")) {
    let slug = "";
    try {
      slug = decodeURIComponent(path.slice("/project/".length));
    } catch (_error) {
      slug = "";
    }
    return { view: "project", nav: "projects", slug };
  }
  return { view: "home", nav: "" };
}

function navigateTo(href) {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  renderRoute();
}

function shouldHandleRouteClick(event, link) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== "_self") return false;
  const url = new URL(link.href, window.location.origin);
  return url.origin === window.location.origin;
}

function applyMarketplaceQuery() {
  const biome = new URLSearchParams(window.location.search).get("biome");
  const validBiomes = new Set(state.projects.map((project) => project.biome));
  state.filter = biome && validBiomes.has(biome) ? biome : "Todos";
  renderMarketplace();
}

function updateMarketplaceUrl() {
  if (parseRoute(window.location.pathname).view !== "projects") return;
  const url = new URL(window.location.href);
  if (state.filter === "Todos") url.searchParams.delete("biome");
  else url.searchParams.set("biome", state.filter);
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function updateDocumentMetadata(route) {
  const descriptions = {
    home: "Leafora conecta pessoas a projetos ecologicos verificaveis por meio de uma experiencia Web3 simples e transparente.",
    projects: "Explore projetos ecologicos selecionados, suas metas, impactos e evidencias publicas na Leafora.",
    method: "Conheca a infraestrutura de verificacao e prova de campo da Leafora.",
    dashboard: "Acompanhe os apoios e registros associados a sua Sui wallet na Leafora."
  };
  const project = route.view === "project" ? state.projects.find((item) => item.id === route.slug) : null;
  const titles = {
    home: "Leafora | Regeneracao verificavel",
    projects: "Projetos | Leafora",
    method: "Como funciona | Leafora",
    dashboard: "Dashboard | Leafora"
  };
  document.title = project ? `${project.name} | Leafora` : titles[route.view] || titles.home;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = project?.objective || descriptions[route.view] || descriptions.home;
}

function projectSorter(sort) {
  if (sort === "progress") return (a, b) => projectProgress(b) - projectProgress(a);
  if (sort === "goal") return (a, b) => positiveNumber(b.goalSui) - positiveNumber(a.goalSui);
  if (sort === "name") return (a, b) => a.name.localeCompare(b.name, "pt-BR");
  return () => 0;
}

function totalRaised() {
  return state.projects.reduce((sum, project) => sum + positiveNumber(project.raisedSui), 0);
}

function totalEvidence() {
  return state.projects.reduce((sum, project) => sum + (Array.isArray(project.evidence) ? project.evidence.length : 0), 0);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}

function setSupportStatus(message, statusClass) {
  supportStatus.textContent = message;
  supportStatus.className = `form-status ${statusClass || ""}`.trim();
}

function setSupportBusy(busy) {
  confirmSupport.disabled = busy;
  confirmSupport.textContent = busy ? "Aguardando wallet..." : "Assinar na devnet";
  tierOptions.querySelectorAll("input").forEach((input) => { input.disabled = busy; });
}

function publicReadinessMessage(project) {
  return getDevnetReadiness(project).ready
    ? "Projeto pronto para assinatura na Sui devnet."
    : "A assinatura on-chain deste projeto ainda esta em configuracao na devnet.";
}

function resetSupportDialog() {
  state.pendingSupport = null;
  supportStatus.textContent = "";
  tierOptions.innerHTML = "";
  riskAccepted.checked = false;
  setSupportBusy(false);
}

function closeNavigation() {
  navToggle?.setAttribute("aria-expanded", "false");
  primaryNav?.classList.remove("open");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function emptyState(title, message, action = "") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${action}</div>`;
}
