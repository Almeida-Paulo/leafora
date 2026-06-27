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
  duplicateDemo: document.querySelector("#duplicateDemo"),
  tierRows: document.querySelector("#tierRows"),
  addTier: document.querySelector("#addTier"),
  milestoneRows: document.querySelector("#milestoneRows"),
  addMilestone: document.querySelector("#addMilestone"),
  tierTemplate: document.querySelector("#tierTemplate"),
  milestoneTemplate: document.querySelector("#milestoneTemplate"),
  chainForm: document.querySelector("#chainForm"),
  chainSlug: document.querySelector("#chainSlug"),
  chainStatus: document.querySelector("#chainStatus")
};

init();

async function init() {
  els.apiBase.value = state.apiBase;
  els.adminToken.value = state.token;
  renderSessionStatus();
  bindEvents();
  addTierRow();
  addMilestoneRow();
  await loadProjects();
}

function bindEvents() {
  els.saveSession.addEventListener("click", async () => {
    state.apiBase = normalizeApiBase(els.apiBase.value);
    state.token = els.adminToken.value.trim();
    sessionStorage.setItem("leafora.panel.apiBase", state.apiBase);
    sessionStorage.setItem("leafora.panel.adminToken", state.token);
    els.apiBase.value = state.apiBase;
    renderSessionStatus("Session saved.");
    await loadProjects();
  });

  els.clearSession.addEventListener("click", () => {
    state.token = "";
    els.adminToken.value = "";
    sessionStorage.removeItem("leafora.panel.adminToken");
    renderSessionStatus("Session cleared.");
  });

  els.refreshProjects.addEventListener("click", loadProjects);
  els.newProject.addEventListener("click", resetEditor);
  els.addTier.addEventListener("click", () => addTierRow());
  els.addMilestone.addEventListener("click", () => addMilestoneRow());
  els.duplicateDemo.addEventListener("click", loadDemoStructure);
  els.projectForm.addEventListener("submit", onSaveProject);
  els.chainForm.addEventListener("submit", onSaveChainBinding);
}

async function loadProjects() {
  try {
    setStatus(els.sessionStatus, "Loading projects...");
    state.projects = await request("/projects");
    renderProjects();
    renderSessionStatus(`${state.projects.length} project${state.projects.length === 1 ? "" : "s"} loaded.`);
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
        <small>${escapeHtml(project.slug)} / ${escapeHtml(project.status)} / ${escapeHtml(project.biome)}</small>
      </button>
    `).join("")
    : `<p class="muted">No projects found.</p>`;

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
  fillChainForm(project);
}

function fillProjectForm(project) {
  els.editorTitle.textContent = project.name;
  setFormValues(els.projectForm, {
    slug: project.slug,
    name: project.name,
    status: project.status,
    display_status: project.display_status,
    category: project.category,
    biome: project.biome,
    country: project.country,
    region: project.region,
    location_label: project.location_label,
    funding_goal_sui: mistToSui(project.funding_goal_mist),
    image_uri: project.image_uri,
    objective: project.objective,
    impact_summary: project.impact_summary,
    story: project.story,
    risks: project.risks,
    metadata_uri: project.metadata_uri,
    metadata_hash: project.metadata_hash,
    verification_level: project.verification_level,
    raised_sui: mistToSui(project.raised_mist)
  });

  els.tierRows.innerHTML = "";
  (project.tiers || []).forEach((tier) => addTierRow({
    ...tier,
    amount_sui: mistToSui(tier.amount_mist)
  }));
  if (!project.tiers?.length) addTierRow();

  els.milestoneRows.innerHTML = "";
  (project.milestones || []).forEach((milestone) => addMilestoneRow({
    ...milestone,
    target_sui: mistToSui(milestone.target_amount_mist)
  }));
  if (!project.milestones?.length) addMilestoneRow();

  setStatus(els.projectStatus, "");
}

function fillChainForm(project) {
  els.chainSlug.textContent = project.slug;
  setFormValues(els.chainForm, {
    sui_package_id: project.sui_package_id,
    sui_project_id: project.sui_project_id,
    sui_vault_id: project.sui_vault_id
  });
  setStatus(els.chainStatus, "");
}

function resetEditor() {
  state.selected = null;
  els.editorTitle.textContent = "New project";
  els.projectForm.reset();
  setFormValues(els.projectForm, {
    country: "BR",
    status: "draft",
    verification_level: 0,
    raised_sui: 0
  });
  els.tierRows.innerHTML = "";
  els.milestoneRows.innerHTML = "";
  addTierRow();
  addMilestoneRow();
  els.chainForm.reset();
  els.chainSlug.textContent = "No project selected";
  renderProjects();
}

async function onSaveProject(event) {
  event.preventDefault();
  try {
    requireAdminToken();
    setStatus(els.projectStatus, "Saving project...");

    const form = new FormData(els.projectForm);
    const slug = String(form.get("slug")).trim();
    const payload = projectPayload(form);
    const tiers = readTierRows();
    const milestones = readMilestoneRows();

    if (state.selected?.slug === slug) {
      await request(`/projects/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await request(`/projects/${encodeURIComponent(slug)}/tiers`, {
        method: "PUT",
        body: JSON.stringify({ tiers })
      });
      await request(`/projects/${encodeURIComponent(slug)}/milestones`, {
        method: "PUT",
        body: JSON.stringify({ milestones })
      });
    } else {
      await request("/projects", {
        method: "POST",
        body: JSON.stringify({ slug, ...payload, tiers, milestones })
      });
    }

    await loadProjects();
    selectProject(slug);
    setStatus(els.projectStatus, "Project saved.");
  } catch (error) {
    setStatus(els.projectStatus, error.message, true);
  }
}

async function onSaveChainBinding(event) {
  event.preventDefault();
  try {
    requireAdminToken();
    if (!state.selected?.slug) throw new Error("Select a project before saving chain IDs.");

    const form = new FormData(els.chainForm);
    setStatus(els.chainStatus, "Saving chain binding...");
    await request(`/projects/${encodeURIComponent(state.selected.slug)}/chain`, {
      method: "PATCH",
      body: JSON.stringify({
        sui_package_id: String(form.get("sui_package_id")).trim(),
        sui_project_id: String(form.get("sui_project_id")).trim(),
        sui_vault_id: String(form.get("sui_vault_id")).trim(),
        status: "active"
      })
    });
    await loadProjects();
    selectProject(state.selected.slug);
    setStatus(els.chainStatus, "Chain binding saved.");
  } catch (error) {
    setStatus(els.chainStatus, error.message, true);
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
    image_uri: value(form, "image_uri"),
    display_status: value(form, "display_status"),
    objective: required(form, "objective"),
    impact_summary: required(form, "impact_summary"),
    story: required(form, "story"),
    risks: required(form, "risks"),
    status: value(form, "status") || "draft",
    verification_level: Number(value(form, "verification_level") || 0),
    funding_goal_mist: suiToMistNumber(required(form, "funding_goal_sui")),
    raised_mist: suiToMistNumber(value(form, "raised_sui") || "0"),
    metadata_uri: value(form, "metadata_uri"),
    metadata_hash: value(form, "metadata_hash")
  };
}

function readTierRows() {
  return [...els.tierRows.querySelectorAll(".tier-row")]
    .map((row, index) => ({
      slug: rowValue(row, "slug"),
      name: rowValue(row, "name"),
      amount_mist: suiToMistNumber(rowValue(row, "amount_sui")),
      allocation_points: Number(rowValue(row, "allocation_points") || 0),
      chain_tier: Number(rowValue(row, "chain_tier") || 0),
      metadata_uri: rowValue(row, "metadata_uri"),
      description: rowValue(row, "description"),
      display_order: Number(rowValue(row, "display_order") || index),
      is_active: true
    }))
    .filter((tier) => tier.slug && tier.name);
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

function addTierRow(values = {}) {
  const node = els.tierTemplate.content.firstElementChild.cloneNode(true);
  els.tierRows.appendChild(node);
  fillRow(node, values);
  node.querySelector(".remove-row").addEventListener("click", () => node.remove());
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

function loadDemoStructure() {
  els.tierRows.innerHTML = "";
  addTierRow({
    slug: "seed",
    name: "Seed",
    amount_sui: 5,
    allocation_points: 50,
    chain_tier: 0,
    display_order: 0,
    description: "Badge inicial e registro de apoio."
  });
  addTierRow({
    slug: "guardian",
    name: "Guardian",
    amount_sui: 25,
    allocation_points: 250,
    chain_tier: 1,
    display_order: 1,
    description: "NFT do projeto e destaque no mural."
  });
  addTierRow({
    slug: "founder",
    name: "Founder",
    amount_sui: 100,
    allocation_points: 1000,
    chain_tier: 2,
    display_order: 2,
    description: "Badge fundador e maior peso de participacao."
  });

  els.milestoneRows.innerHTML = "";
  addMilestoneRow({ title: "Diagnostico inicial", target_sui: 2500, status: "planned", display_order: 0 });
  addMilestoneRow({ title: "Execucao de campo", target_sui: 4000, status: "planned", display_order: 1 });
  addMilestoneRow({ title: "Monitoramento", target_sui: 3000, status: "planned", display_order: 2 });
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
    message || (state.token ? "Session configured." : "Session not configured."),
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
