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
import { explorerTransaction } from "./sui-devnet.js";
import { setupSupport, openWalletDialog, openSupportDialog, renderWalletState, renderDashboard } from "./support-ui.js";

import { language, locale, routePath, t, translatedFilter, updateSeo } from "./i18n.js";
import { formatUsd, fundingNote, totalUsd } from "./funding.js";


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
  filter: t("Todos"),
  sort: "featured",
  search: "",
  wallet: null,
  catalogError: false,
  pendingSupport: null,
  supportIntent: null,
  catalogLoaded: false,
  routeVersion: 0
};

setupSupport(state, refreshCatalog);
bindEvents();
initialize();

async function refreshCatalog() {
  state.projects = await loadProjectCatalog(true);
  state.catalogError = false;
  renderHome();
  renderMarketplace();
  renderRoute({ scroll: false });
}

async function initialize() {
  renderLoadingStates();
  renderRoute({ scroll: false });
  renderWalletState();
  if (window.location.hash) scrollToRoute(false);
  try { state.projects = await loadProjectCatalog(); }
  catch (error) { state.catalogError = true; }
  state.catalogLoaded = true;
  renderHome();
  renderMarketplace();
  renderRoute({ scroll: false });
  renderWalletState();
}

function bindEvents() {
  bindRoadmapPreview();
  navToggle?.addEventListener("click", () => {
    const open = navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", String(open));
    primaryNav?.classList.toggle("open", open);
  });

  window.addEventListener("popstate", () => renderRoute({ scroll: false }));
  window.addEventListener("hashchange", () => {
    if (parseRoute(window.location.pathname).view === "roadmap") {
      renderRoute({ scroll: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && primaryNav?.classList.contains("open")) {
      closeNavigation();
      navToggle?.focus();
    }
  });

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
    state.filter = button.dataset.filter || t("Todos");
    updateMarketplaceUrl();
    renderMarketplaceGrid();
  });




}

function bindRoadmapPreview() {
  const tabs = [...document.querySelectorAll("[data-preview-tab]")];
  const selectTab = (tab) => {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });

}

function setRoadmapStep(id) {
  const links = [...document.querySelectorAll("[data-phase-link]")];
  const index = Math.max(0, links.findIndex((link) => link.dataset.phaseLink === id));
  const current = links[index];
  if (!current) return;
  links.forEach((link) => {
    const selected = link === current;
    if (selected) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
    document.getElementById(link.dataset.phaseLink).hidden = !selected;
  });
  const nav = current.parentElement;
  const left = current.offsetLeft - nav.offsetLeft - (nav.clientWidth - current.clientWidth) / 2;
  nav.scrollTo({ left: Math.max(0, left), behavior: "instant" });
  setText("#phasePosition", `${String(index + 1).padStart(2, "0")} / ${String(links.length).padStart(2, "0")}`);
  const previous = document.querySelector("#previousPhase");
  const next = document.querySelector("#nextPhase");
  previous.hidden = index === 0;
  next.hidden = index === links.length - 1;
  if (index > 0) previous.href = links[index - 1].href;
  if (index < links.length - 1) {
    next.href = links[index + 1].href;
    next.textContent = t("Próxima: {phase}", { phase: links[index + 1].querySelector("strong").textContent }) + " →";
  }
  if ((previous.hidden && document.activeElement === previous) || (next.hidden && document.activeElement === next)) {
    current.focus({ preventScroll: true });
  }
}

function scrollToRoute(animate = true) {
  let target = null;
  try {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) target = document.getElementById(id);
  } catch (_error) {
    // A malformed fragment must not prevent navigation to the page itself.
  }
  if (target?.classList.contains("roadmap-phase")) target = document.querySelector(".roadmap-nav");
  if (target && !target.closest("[hidden]")) {
    target.scrollIntoView({ block: "start", behavior: animate && !prefersReducedMotion() ? "smooth" : "instant" });
  } else {
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}

function renderCatalogError() {
  for (const id of ["featuredProjectGrid", "projectGrid"]) {
    const node = document.getElementById(id);
    if (!node) continue;
    node.innerHTML = emptyState(language === "en" ? "Projects temporarily unavailable" : "Projetos temporariamente indisponíveis",
      language === "en" ? "We could not verify project data. Please try again." : "Não foi possível conferir os dados dos projetos. Tente novamente.");
    const button = document.createElement("button");
    button.type = "button"; button.className = "secondary-action";
    button.textContent = language === "en" ? "Try again" : "Tentar novamente";
    button.addEventListener("click", async () => { button.disabled = true; try { await refreshCatalog(); } catch { state.catalogError = true; renderCatalogError(); } });
    node.append(button);
  }
  setText("#metricRaised", "—"); setText("#metricProjects", "—");
}

function renderLoadingStates() {
  const loading = `<div class="loading-state"><span></span><p>${t("Carregando projetos...")}</p></div>`;
  const featured = document.querySelector("#featuredProjectGrid");
  const catalog = document.querySelector("#projectGrid");
  if (featured) featured.innerHTML = loading;
  if (catalog) catalog.innerHTML = loading;
}

function renderHome() {
  if (state.catalogError) { renderCatalogError(); return; }
  const featured = document.querySelector("#featuredProjectGrid");
  if (featured) {
    featured.innerHTML = state.projects.length
      ? state.projects.slice(0, 3).map(renderProjectCard).join("")
      : emptyState(t("Nenhum projeto publicado"), t("A curadoria ainda nao publicou projetos neste ambiente."));
  }

  setText("#metricProjects", state.projects.length);
  setText("#metricRaised", formatUsd(totalUsd(state.projects)));
  setText("#metricEvidence", totalEvidence());
  setText("#catalogOrigin", "");
  setText("#homeFundingNote", state.projects.length ? fundingNote(state.projects[0]) : "");
  document.querySelector("#homeImageNote").hidden = !state.projects.some((project) => project.imageKind !== "capture");
}

function renderMarketplace() {
  if (state.catalogError) { renderCatalogError(); return; }
  const biomes = uniqueValues(state.projects.map((project) => project.biome));
  const filters = document.querySelector("#filters");
  if (filters) {
    filters.innerHTML = [t("Todos"), ...biomes].map((biome) => `
      <button type="button" data-filter="${escapeHtml(biome)}" class="${state.filter === biome ? "active" : ""}" aria-pressed="${state.filter === biome}">
        ${escapeHtml(biome)}
      </button>
    `).join("");
  }

  setText("#marketProjectCount", state.projects.length);
  setText("#marketBiomeCount", biomes.length);
  setText("#marketEvidenceCount", totalEvidence());
  setText("#marketFundingNote", state.projects.length ? fundingNote(state.projects[0]) : "");
  document.querySelector("#marketImageNote").hidden = !state.projects.some((project) => project.imageKind !== "capture");
  renderMarketplaceGrid();
}

function renderMarketplaceGrid() {
  const query = normalizeText(state.search);
  const matching = state.projects.filter((project) => {
    const matchesBiome = state.filter === t("Todos") || project.biome === state.filter;
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
      : emptyState(t("Nenhum projeto encontrado"), t("Altere a busca ou remova o filtro para consultar outras iniciativas."));
  }

  setText("#resultCount", `${sorted.length} ${sorted.length === 1 ? t("projeto encontrado") : t("projetos encontrados")}`);
  document.querySelectorAll("#filters [data-filter]").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderRoute({ scroll = true, focus = false } = {}) {
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
  if (route.view === "roadmap") setRoadmapStep(window.location.hash.slice(1) || "apoio");

  if (route.view === "project") renderProjectDetail(route.slug, version);
  if (route.view === "dashboard") renderDashboard();
  if (focus) {
    const heading = document.querySelector(`[data-view="${route.view}"] h1`);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
  if (scroll) scrollToRoute(false);
}

async function renderProjectDetail(slug, version) {
  const container = document.querySelector("#projectDetail");
  if (!container) return;
  if (state.catalogError) {
    container.innerHTML = emptyState(language === "en" ? "Project data unavailable" : "Dados do projeto indisponíveis",
      language === "en" ? "We could not verify this project. Please return to the catalog and try again." : "Não foi possível verificar este projeto. Volte ao catálogo e tente novamente.",
      `<a class="text-action" href="${routePath('/projects')}" data-route>${t("Projetos")}</a>`);
    return;
  }
  if (!state.catalogLoaded) {
    container.innerHTML = `<div class="loading-state page-loading"><span></span><p>${t("Carregando o projeto...")}</p></div>`;
    return;
  }
  const project = state.projects.find((item) => item.id === slug);

  if (!project) {
    container.innerHTML = `
      <section class="not-found">
        <p class="eyebrow">${t("Projeto nao encontrado")}</p>
        <h1>${t("Esta iniciativa nao esta disponivel.")}</h1>
        <p>${t("Ela pode estar em curadoria, arquivada ou ter sido acessada por um endereco incorreto.")}</p>
        <a class="primary-action" href="${routePath('/projects')}" data-route>${t("Voltar ao marketplace")}</a>
      </section>
    `;
    return;
  }

  container.innerHTML = `<div class="loading-state page-loading"><span></span><p>${t("Carregando o projeto...")}</p></div>`;
  const evidence = await loadProjectEvidence(project);
  if (version !== state.routeVersion) return;

  const progress = projectProgress(project);
  const supportDisabled = project.funding.open ? "" : "disabled";
  const supportLabel = project.funding.open ? t("Apoiar este projeto") : (language === "en" ? "Funding closed" : "Captação encerrada");


  container.innerHTML = `
    <nav class="breadcrumb" aria-label="${t("Caminho")}">
      <a href="${routePath('/projects')}" data-route>${t("Projetos")}</a><span aria-hidden="true">/</span><span>${escapeHtml(project.name)}</span>
    </nav>

    <section class="project-hero-layout">
      <div class="project-detail-media">
        <img src="${safeMediaUrl(project.image)}" alt="${escapeHtml(project.name)}">
      </div>
      <div class="project-detail-copy">
        <div class="project-kicker"><span>${escapeHtml(project.category)}</span><span>${escapeHtml(project.biome)}</span></div>
        <h1>${escapeHtml(project.name)}</h1>
        <p class="detail-location">${escapeHtml(project.location)}</p>
        ${project.imageKind !== "capture" ? `<p class="image-provenance">${t("Imagem ilustrativa; ainda não é um registro de campo do Leafora Capture.")}</p>` : ""}
        <p class="detail-objective">${escapeHtml(project.objective)}</p>
        ${language === "en" && project.fromApi ? `<p class="source-language">${t("Conteúdo publicado pela equipe no idioma original.")}</p>` : ""}
        <dl class="project-facts">
          <div><dt>${t("Impacto esperado")}</dt><dd>${escapeHtml(project.impact)}</dd></div>
          <div><dt>${t("Evidencias publicas")}</dt><dd>${evidence.length}</dd></div>
          <div><dt>${t("Apoiadores registrados")}</dt><dd>${project.supporters || 0}</dd></div>
        </dl>
      </div>
      <aside class="funding-panel" aria-label="${t("Captacao do projeto")}">
        <p class="funding-label">${project.fromApi ? t("Meta de apoio em US$") : t("Captação ilustrativa em US$")}</p>
        <strong class="funding-total">${formatUsd(project.fundingUsd?.raised)}</strong>
        <div class="funding-progress-line"><span>${t("de")} ${formatUsd(project.fundingUsd?.goal)}</span><b>${progress}%</b></div>
        <div class="progress large" aria-label="${t("{progress}% da meta", { progress })}"><span style="width:${Math.min(progress, 100)}%"></span></div>
        <p class="currency-note">${language === "en" ? "Closes" : "Prazo"}: ${formatDate(project.funding.deadline * 1000)}</p>
        <button class="primary-action wide" data-support="${escapeHtml(project.id)}" ${supportDisabled} type="button">${supportLabel}</button>

        <p class="risk-caption">${t("Apoio experimental, sem promessa de lucro, retorno financeiro ou emissao de credito ambiental.")}</p>
      </aside>
    </section>

    <nav class="project-subnav" aria-label="${t("Secoes do projeto")}">
      <a href="#visao-geral">${t("Visao geral")}</a>
      <a href="#etapas">${t("Etapas")}</a>
      <a href="#evidencias">${t("Evidencias")}</a>
      <a href="#riscos">${t("Riscos")}</a>
    </nav>

    <section class="project-content" id="visao-geral">
      <div class="project-story">
        <p class="eyebrow">${t("Sobre o projeto")}</p>
        <h2>${t("Uma iniciativa com escopo, territorio e execucao acompanhaveis.")}</h2>
        <p>${escapeHtml(project.story)}</p>
      </div>
      <aside class="project-support-tiers" aria-labelledby="tiersTitle">
        <h2 id="tiersTitle">${language === "en" ? "Your support, recorded" : "Seu apoio, registrado"}</h2>
        <p>${language === "en" ? "Choose an amount in USDC. Each USDC adds one AP to your position in this project, including fractional amounts. Your dashboard brings these positions together." : "Escolha o valor em USDC. Cada USDC acrescenta um AP à sua participação neste projeto, inclusive nos valores fracionados. No dashboard, você acompanha todas as suas participações."}</p>
        <a class="text-action" href="${project.funding.network === "public" ? "https://stellar.expert/explorer/public" : "https://stellar.expert/explorer/testnet"}/contract/${escapeHtml(project.funding.contract)}" target="_blank" rel="noopener noreferrer">${language === "en" ? "View public contract" : "Ver contrato público"} ↗</a>
      </aside>

    </section>

    <section class="project-section" id="etapas">
      <div class="section-heading project-section-heading"><div><p class="eyebrow">${t("Execucao")}</p><h2>${t("Milestones do projeto")}</h2></div><p>${project.milestones.length} ${t("etapas publicadas")}</p></div>
      <div class="milestone-timeline">
        ${project.milestones.length ? project.milestones.map((item, index) => renderMilestone(item, index, project)).join("") : emptyState(t("Etapas em definicao"), t("A curadoria ainda nao publicou o cronograma deste projeto."))}
      </div>
    </section>

    <section class="project-section evidence-section" id="evidencias">
      <div class="section-heading project-section-heading">
        <div><p class="eyebrow">${t("Trilha de verificacao")}</p><h2>${t("Evidencias vinculadas ao projeto")}</h2></div>
        <a class="text-action" href="${routePath('/method')}" data-route>${t("Entender a prova")} <span aria-hidden="true">&rarr;</span></a>
      </div>
      <div class="evidence-list">
        ${!project.fromApi ? `<p class="currency-note">${t("Registros ilustrativos")}</p>` : ""}
        ${evidence.length ? evidence.map(renderEvidence).join("") : emptyState(t("Nenhuma evidencia publicada"), t("Os registros aparecerao aqui depois da captura, revisao e vinculacao ao projeto."))}
      </div>
    </section>

    <section class="risk-band" id="riscos">
      <div><p class="eyebrow">${t("Riscos declarados")}</p><h2>${t("Transparencia inclui explicar o que pode nao sair como previsto.")}</h2></div>
      <p>${escapeHtml(project.risks)}</p>
    </section>
  `;
}

function renderMilestone(item, index, project) {
  const title = Array.isArray(item) ? item[0] : item?.title;
  const status = Array.isArray(item) ? item[2] : item?.status;
  const description = Array.isArray(item) ? item[3] : item?.description;
  const normalizedStatus = String(status || "planned").toLowerCase();
  return `
    <article class="milestone-item ${escapeHtml(normalizedStatus)}">
      <div class="milestone-index"><span>${String(index + 1).padStart(2, "0")}</span></div>
      <div class="milestone-copy">
        <span class="milestone-status">${escapeHtml(milestoneLabel(status))}</span>
        <h3>${escapeHtml(title || t("Etapa sem titulo"))}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>

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
        <div><dt>${t("Hash do arquivo")}</dt><dd title="${escapeHtml(record.contentHash)}">${escapeHtml(formatHash(record.contentHash))}</dd></div>
        <div><dt>${t("Origem")}</dt><dd>${escapeHtml(record.source)}</dd></div>
      </dl>
      ${txUrl ? `<a class="text-action" href="${escapeHtml(txUrl)}" target="_blank" rel="noopener noreferrer">${t("Ver transacao")} <span aria-hidden="true">&nearr;</span></a>` : `<span class="anchoring-state">${t("Ancoragem pendente")}</span>`}
    </article>
  `;
}



function parseRoute(pathname) {
  const path = String(pathname || "/").replace(/^\/en(?=\/|$)/, "").replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/";
  if (path === "/") return { view: "home", nav: "" };
  if (path === "/projects") return { view: "projects", nav: "projects" };
  if (path === "/method") return { view: "method", nav: "method" };
  if (path === "/roadmap") return { view: "roadmap", nav: "roadmap" };
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
  return { view: "not-found", nav: "" };
}

function navigateTo(href) {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  renderRoute({ focus: !url.hash });
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
  const candidate = biome && (validBiomes.has(biome) ? biome : translatedFilter(biome));
  state.filter = candidate && validBiomes.has(candidate) ? candidate : t("Todos");
  renderMarketplace();
}

function updateMarketplaceUrl() {
  if (parseRoute(window.location.pathname).view !== "projects") return;
  const url = new URL(window.location.href);
  if (state.filter === t("Todos")) url.searchParams.delete("biome");
  else url.searchParams.set("biome", state.filter);
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function updateDocumentMetadata(route) {
  const project = route.view === "project" ? state.projects.find((item) => item.id === route.slug) : null;
  updateSeo(route, project, state.catalogLoaded && !state.catalogError);
}

function projectSorter(sort) {
  if (sort === "progress") return (a, b) => projectProgress(b) - projectProgress(a);
  if (sort === "goal") return (a, b) => BigInt(a.fundingUsd.goal) === BigInt(b.fundingUsd.goal) ? 0 : BigInt(a.fundingUsd.goal) > BigInt(b.fundingUsd.goal) ? -1 : 1;
  if (sort === "name") return (a, b) => a.name.localeCompare(b.name, locale);
  return () => 0;
}

function totalEvidence() {
  return state.projects.reduce((sum, project) => sum + project.evidenceCount, 0);
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
