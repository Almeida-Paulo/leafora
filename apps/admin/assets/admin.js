import { walletOptions, connectWallet, signIntent, api as fundingApi } from "./stellar-wallet.js";
import { parseAmount, decimal } from "./money.js";
let fundingWallet, fundingProviders = [], fundingBusy = false;
const state = {
  projects: [],
  selected: null,
  apiBase: sessionStorage.getItem("leafora.panel.apiBase") || "/api",
  token: sessionStorage.getItem("leafora.panel.adminToken") || ""
};

const els = {
  apiBase: document.querySelector("#apiBase"),
  adminToken: document.querySelector("#adminToken"),
  saveSession: document.querySelector("#saveSession"),
  clearSession: document.querySelector("#clearSession"),
  sessionStatus: document.querySelector("#sessionStatus"),
  refreshProjects: document.querySelector("#refreshProjects"),
  projectList: document.querySelector("#projectList"),
  projectForm: document.querySelector("#projectForm"),
  editorTitle: document.querySelector("#editorTitle"),
  projectStatus: document.querySelector("#projectStatus"),
  newProject: document.querySelector("#newProject"),
  milestoneRows: document.querySelector("#milestoneRows"),
  addMilestone: document.querySelector("#addMilestone"),
  milestoneTemplate: document.querySelector("#milestoneTemplate")
};

init();

async function init() {
  els.apiBase.value = state.apiBase;
  els.adminToken.value = state.token;
  renderSessionStatus();
  bindEvents();
  addMilestoneRow();
  renderProjectPreview();
  await loadProjects();
}

function bindEvents() {
  els.saveSession.addEventListener("click", async () => {
    state.apiBase = normalizeApiBase(els.apiBase.value);
    state.token = els.adminToken.value.trim();
    sessionStorage.setItem("leafora.panel.apiBase", state.apiBase);
    sessionStorage.setItem("leafora.panel.adminToken", state.token);
    els.apiBase.value = state.apiBase;
    renderSessionStatus("Sessão salva.");
    await loadProjects();
  });

  els.clearSession.addEventListener("click", () => {
    state.token = "";
    els.adminToken.value = "";
    sessionStorage.removeItem("leafora.panel.adminToken");
    renderSessionStatus("Sessão limpa.");
  });

  els.refreshProjects.addEventListener("click", loadProjects);
  els.newProject.addEventListener("click", resetEditor);
  els.addMilestone.addEventListener("click", () => addMilestoneRow());
  els.projectForm.addEventListener("input", renderProjectPreview);
  els.projectForm.addEventListener("submit", onSaveProject);
  document.getElementById("loadStellarWallets").addEventListener("click", async () => {
    const status = document.getElementById("stellarPublishStatus");
    try {
      fundingProviders = await walletOptions();
      const select = document.getElementById("stellarProvider");
      select.replaceChildren(...fundingProviders.map((provider, i) => new Option(provider.name, String(i))));
      status.textContent = fundingProviders.length ? "Escolha a carteira e publique o projeto salvo." : "Nenhuma carteira compatível disponível.";
    } catch (error) { status.textContent = error.message; }
  });
  document.getElementById("stellarPublishForm").addEventListener("submit", publishStellar);
  document.getElementById("pauseStellar").addEventListener("click", () => changeFundingPause(true));
  document.getElementById("resumeStellar").addEventListener("click", () => changeFundingPause(false));
}

async function loadProjects() {
  try {
    setStatus(els.sessionStatus, "Carregando projetos...");
    state.projects = await request("/projects");
    renderProjects();
    renderSessionStatus(`${state.projects.length} ${state.projects.length === 1 ? "projeto carregado" : "projetos carregados"}.`);
  } catch (error) {
    state.projects = [];
    renderProjects();
    renderSessionStatus(error.message, true);
  }
}

function renderProjects() {
  els.projectList.innerHTML = state.projects.length
    ? state.projects.map((project) => `
      <button class="project-item ${state.selected?.slug === project.slug ? "active" : ""}" type="button" data-slug="${escapeHtml(project.slug)}">
        <strong>${escapeHtml(project.name)}</strong>
        <small>${escapeHtml(project.slug)} / ${escapeHtml(editorialStatusLabel(project.status))} / ${escapeHtml(project.biome)}</small>
      </button>
    `).join("")
    : `<p class="muted">Nenhum projeto cadastrado.</p>`;

  els.projectList.querySelectorAll("[data-slug]").forEach((button) => {
    button.addEventListener("click", () => selectProject(button.dataset.slug));
  });
}

function selectProject(slug) {
  const project = state.projects.find((item) => item.slug === slug);
  if (!project) return;

  state.selected = project;
  renderProjects();
  fillProjectForm(project);
}

function fillProjectForm(project) {
  els.editorTitle.textContent = project.name;
  setFormValues(els.projectForm, {
    slug: project.slug,
    name: project.name,
    status: project.status,
    category: project.category,
    biome: project.biome,
    country: project.country,
    region: project.region,
    location_label: project.location_label,
    image_uri: project.image_uri,
    objective: project.objective,
    impact_summary: project.impact_summary,
    story: project.story,
    risks: project.risks
  });

  els.milestoneRows.innerHTML = "";
  (project.milestones || []).forEach((milestone) => addMilestoneRow({
    ...milestone,
    target_sui: mistToSui(milestone.target_amount_mist)
  }));
  if (!project.milestones?.length) addMilestoneRow();

  setStatus(els.projectStatus, "");
  renderProjectPreview();
}

function resetEditor() {
  state.selected = null;
  els.editorTitle.textContent = "Novo projeto";
  els.projectForm.reset();
  setFormValues(els.projectForm, {
    country: "BR",
    status: "draft"
  });
  els.milestoneRows.innerHTML = "";
  addMilestoneRow();
  renderProjects();
  renderProjectPreview();
}

async function onSaveProject(event) {
  event.preventDefault();
  try {
    requireAdminToken();
    setStatus(els.projectStatus, "Salvando projeto...");

    const form = new FormData(els.projectForm);
    const slug = String(form.get("slug")).trim();
    const payload = projectPayload(form);
    const milestones = readMilestoneRows();
    if (!milestones.length) throw new Error("Adicione pelo menos uma etapa antes de salvar.");

    if (state.selected?.slug === slug) {
      await request(`/projects/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await request(`/projects/${encodeURIComponent(slug)}/milestones`, {
        method: "PUT",
        body: JSON.stringify({ milestones })
      });
    } else {
      await request("/projects", {
        method: "POST",
        body: JSON.stringify({ slug, ...payload, milestones })
      });
    }

    await loadProjects();
    selectProject(slug);
    setStatus(els.projectStatus, "Projeto salvo.");
  } catch (error) {
    setStatus(els.projectStatus, error.message, true);
  }
}

function projectPayload(form) {
  return {
    name: required(form, "name"),
    category: required(form, "category"),
    biome: required(form, "biome"),
    country: value(form, "country") || "BR",
    region: value(form, "region"),
    location_label: required(form, "location_label"),
    image_uri: required(form, "image_uri"),
    objective: required(form, "objective"),
    impact_summary: required(form, "impact_summary"),
    story: required(form, "story"),
    risks: required(form, "risks"),
    status: value(form, "status") || "draft"
  };
}

function readMilestoneRows() {
  return [...els.milestoneRows.querySelectorAll(".milestone-row")]
    .map((row, index) => ({
      title: rowValue(row, "title"),
      target_amount_mist: suiToMistNumber(rowValue(row, "target_sui") || "0"),
      status: rowValue(row, "status") || "planned",
      description: rowValue(row, "description"),
      display_order: Number(rowValue(row, "display_order") || index)
    }))
    .filter((milestone) => milestone.title);
}

function addMilestoneRow(values = {}) {
  const node = els.milestoneTemplate.content.firstElementChild.cloneNode(true);
  els.milestoneRows.appendChild(node);
  fillRow(node, values);
  node.querySelector(".remove-row").addEventListener("click", () => node.remove());
}

function fillRow(row, values) {
  row.querySelectorAll("[data-field]").forEach((input) => {
    const field = input.dataset.field;
    if (values[field] !== undefined && values[field] !== null) {
      input.value = values[field];
    }
  });
}

function renderProjectPreview() {
  const form = els.projectForm;
  const field = (name) => String(form.elements[name]?.value || "").trim();
  const name = field("name");
  document.querySelector("#previewName").textContent = name || "Nome do projeto";
  document.querySelector("#previewCategory").textContent = [field("category"), field("biome")].filter(Boolean).join(" · ");
  document.querySelector("#previewLocation").textContent = field("location_label");
  document.querySelector("#previewImpact").textContent = field("impact_summary");
  document.querySelector("#previewObjective").textContent = field("objective");

  const image = document.querySelector("#previewImage");
  const mediaUrl = previewMediaUrl(field("image_uri"));
  image.hidden = !mediaUrl;
  image.alt = name ? `Imagem ilustrativa de ${name}` : "Imagem ilustrativa do projeto";
  image.referrerPolicy = "no-referrer";
  image.onerror = () => { image.hidden = true; };
  if (mediaUrl && image.src !== mediaUrl) image.src = mediaUrl;
  else image.removeAttribute("src");
}

function editorialStatusLabel(status) {
  return ({ draft: "Rascunho", review: "Em revisão", active: "Aprovado",
    paused: "Pausado", completed: "Concluído", archived: "Arquivado" })[status] || status;
}

function previewMediaUrl(candidate) {
  if (!candidate) return "";
  try {
    const origin = document.querySelector('meta[name="leafora-public-origin"]').content;
    const url = new URL(candidate, origin);
    return url.protocol === "https:" ? url.href : "";
  } catch (_error) {
    return "";
  }
}

async function request(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {})
  };
  if (state.token) headers["X-Admin-Token"] = state.token;

  const response = await fetch(`${state.apiBase}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.detail || `Request failed with HTTP ${response.status}`);
  }
  return data;
}

function setFormValues(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value ?? "";
  });
}

function required(form, key) {
  const result = value(form, key);
  if (!result) throw new Error(`${key} is required.`);
  return result;
}

function value(form, key) {
  return String(form.get(key) ?? "").trim();
}

function rowValue(row, field) {
  return String(row.querySelector(`[data-field="${field}"]`)?.value ?? "").trim();
}

function suiToMistNumber(value) {
  const [whole, fraction = ""] = String(value || "0").replace(",", ".").split(".");
  const decimals = `${fraction}000000000`.slice(0, 9);
  return Number(BigInt(whole || "0") * 1_000_000_000n + BigInt(decimals || "0"));
}

function mistToSui(value) {
  const mist = BigInt(value || 0);
  const whole = mist / 1_000_000_000n;
  const fraction = String(mist % 1_000_000_000n).padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function normalizeApiBase(value) {
  const result = String(value || "/api").trim().replace(/\/+$/, "");
  return result || "/api";
}

function requireAdminToken() {
  if (!state.token) throw new Error("Admin token is required.");
}

function renderSessionStatus(message = "") {
  setStatus(
    els.sessionStatus,
    message || (state.token ? "Sessão configurada." : "Sessão não configurada."),
    false
  );
}

function setStatus(node, message, isError = false) {
  node.textContent = message;
  node.classList.toggle("error", Boolean(isError));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function publishStellar(event) {
  event.preventDefault();
  if (fundingBusy) return;
  const fields = new FormData(event.target);
  await manageFunding("publish", () => {
    const amount = decimal(parseAmount(fields.get("goal")));
    const deadline = Math.floor(new Date(fields.get("deadline")).getTime() / 1000);
    if (!Number.isSafeInteger(deadline) || deadline <= Date.now() / 1000) throw new Error("Informe um prazo futuro.");
    return { amount, deadline };
  });
}

async function changeFundingPause(paused) {
  if (fundingBusy) return;
  await manageFunding("pause", () => ({ paused }));
}

async function manageFunding(action, payload) {
  const status = document.getElementById("stellarPublishStatus");
  const buttons = document.querySelectorAll("#stellarPublishForm button");
  fundingBusy = true;
  buttons.forEach(button => { button.disabled = true; });
  try {
    requireAdminToken();
    if (!state.selected) throw new Error("Selecione e salve um projeto.");
    const slug = state.selected.slug;
    const fields = payload();
    const provider = fundingProviders[Number(document.getElementById("stellarProvider").value)];
    if (!provider) throw new Error("Clique em Conectar carteira primeiro.");
    fundingWallet = await connectWallet(provider);
    status.textContent = "Preparando transação...";
    const intent = await request("/funding/projects/" + encodeURIComponent(slug) + "/" + action, {
      method: "POST", body: JSON.stringify({ wallet: fundingWallet.address, ...fields })
    });
    const xdr = await signIntent(fundingWallet, intent);
    const result = await fundingApi("/intents/" + intent.id + "/submit", { method: "POST", body: JSON.stringify({ xdr }) });
    status.textContent = "Transação " + result.hash + ": " + result.status + ". O catálogo só muda após a confirmação na blockchain.";
  } catch (error) { status.textContent = error.message; }
  finally { fundingBusy = false; buttons.forEach(button => { button.disabled = false; }); }
}
