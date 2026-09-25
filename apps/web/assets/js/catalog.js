import { projects as seedProjects } from "./projects.js";
import { leaforaConfig } from "./config.js";

const fallbackImages = {
  cerrado: "/assets/img/project-cerrado.png",
  manguezal: "/assets/img/project-mangrove.png",
  default: "/assets/img/project-spring.png"
};

let catalogPromise = null;

export function loadProjectCatalog() {
  if (!catalogPromise) catalogPromise = fetchProjectCatalog();
  return catalogPromise;
}

async function fetchProjectCatalog() {
  try {
    const response = await fetch("/api/projects", { headers: { Accept: "application/json" } });
    if (!response.ok) return normalizeProjects(seedProjects);

    const payload = await response.json();
    if (!Array.isArray(payload)) return normalizeProjects(seedProjects);

    const activeProjects = normalizeProjects(
      payload
        .filter((project) => project && project.status !== "archived")
        .map(projectFromApi)
    );

    return activeProjects.length ? activeProjects : normalizeProjects(seedProjects);
  } catch (_error) {
    return normalizeProjects(seedProjects);
  }
}

export async function loadProjectEvidence(project) {
  const fallback = normalizeEvidence(project?.evidence || []);
  if (!project?.fromApi || !project.id) return fallback;

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/evidence`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    return Array.isArray(payload) ? normalizeEvidence(payload.map(evidenceFromApi)) : fallback;
  } catch (_error) {
    return fallback;
  }
}

export function renderProjectCard(project) {
  const progress = projectProgress(project);
  const supportReady = Boolean(
    project.tiers.length &&
    leaforaConfig.packageId &&
    leaforaConfig.browserSigningEnabled &&
    project.chain?.projectId &&
    project.chain?.vaultId
  );

  return `
    <article class="project-card">
      <a class="project-media" href="${projectPath(project.id)}" data-route aria-label="Ver ${escapeHtml(project.name)}">
        <img src="${safeMediaUrl(project.image)}" alt="${escapeHtml(project.name)}">
        <span class="status-badge">${escapeHtml(statusLabel(project.status))}</span>
        <span class="chain-badge">${project.fromApi ? "SUI DEVNET" : "DEMONSTRACAO"}</span>
      </a>
      <div class="project-body">
        <div class="project-kicker"><span>${escapeHtml(project.category)}</span><span>${escapeHtml(project.biome)}</span></div>
        <h3><a href="${projectPath(project.id)}" data-route>${escapeHtml(project.name)}</a></h3>
        <p class="location">${escapeHtml(project.location)}</p>
        <div class="impact-line"><span>Impacto esperado</span><strong>${escapeHtml(project.impact)}</strong></div>
        <div class="funding-line">
          <span><strong>${formatSui(project.raisedSui)}</strong> captados</span>
          <span>${progress}%</span>
        </div>
        <div class="progress" aria-label="${progress}% da meta"><span style="width:${progress}%"></span></div>
        <div class="project-card-footer">
          <span>Meta ${formatSui(project.goalSui)}</span>
          <div class="card-actions">
            ${supportReady ? `<button class="primary-action compact" data-support="${escapeHtml(project.id)}" type="button">Apoiar</button>` : ""}
            <a class="project-open" href="${projectPath(project.id)}" data-route aria-label="Conhecer ${escapeHtml(project.name)}">Conhecer <span aria-hidden="true">&nearr;</span></a>
          </div>
        </div>
      </div>
    </article>
  `;
}

export function projectPath(projectId) {
  return `/project/${encodeURIComponent(String(projectId || ""))}`;
}

export function projectProgress(project) {
  const raised = finiteNumber(project?.raisedSui);
  const goal = finiteNumber(project?.goalSui);
  if (goal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((raised / goal) * 100)));
}

export function formatSui(value) {
  return `${finiteNumber(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} SUI`;
}

export function formatDate(value) {
  if (!value) return "Data indisponivel";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponivel";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatHash(value) {
  const hash = String(value || "");
  if (!hash) return "Hash pendente";
  return hash.length > 28 ? `${hash.slice(0, 14)}...${hash.slice(-10)}` : hash;
}

export function shortAddress(value) {
  const address = String(value || "");
  return address.length > 16 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

export function safeMediaUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return fallbackImages.default;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return escapeHtml(candidate);
  if (candidate.startsWith("data:image/")) return escapeHtml(candidate);

  try {
    const url = new URL(candidate, window.location.origin);
    return url.protocol === "https:" ? escapeHtml(url.href) : fallbackImages.default;
  } catch (_error) {
    return fallbackImages.default;
  }
}

export function statusLabel(value) {
  const status = String(value || "").toLowerCase();
  const labels = {
    active: "Ativo",
    draft: "Em curadoria",
    documented: "Documentado",
    validated: "Validado",
    "field evidence": "Com evidencias",
    approved: "Aprovada",
    pending: "Em revisao",
    rejected: "Rejeitada"
  };
  return labels[status] || value || "Em curadoria";
}

export function milestoneLabel(value) {
  const labels = {
    completed: "Concluida",
    active: "Em execucao",
    planned: "Planejada"
  };
  return labels[String(value || "").toLowerCase()] || value || "Planejada";
}

function normalizeProjects(items) {
  const seen = new Set();
  const normalized = [];

  for (const item of items || []) {
    if (!item) continue;
    const project = normalizeProject(item);
    if (!project.id || seen.has(project.id)) continue;
    seen.add(project.id);
    normalized.push(project);
  }

  return normalized;
}

function normalizeProject(project) {
  const biome = textOr(project.biome, "Bioma nao informado");
  return {
    ...project,
    id: textOr(project.id, ""),
    name: textOr(project.name, "Projeto sem nome"),
    category: textOr(project.category, "Regeneracao ecologica"),
    biome,
    location: textOr(project.location, "Localizacao em validacao"),
    image: textOr(project.image, imageForBiome(biome)),
    status: textOr(project.status, "Em curadoria"),
    goalSui: finiteNumber(project.goalSui),
    raisedSui: finiteNumber(project.raisedSui),
    supporters: Math.max(0, Math.trunc(finiteNumber(project.supporters))),
    impact: textOr(project.impact, "Impacto em validacao"),
    objective: textOr(project.objective, "Objetivo em validacao pela curadoria."),
    story: textOr(project.story, "As informacoes detalhadas deste projeto estao em preparacao."),
    risks: textOr(project.risks, "Riscos em processo de avaliacao."),
    chain: project.chain || { projectId: "", vaultId: "" },
    milestones: dedupeRows(project.milestones),
    evidence: Array.isArray(project.evidence) ? project.evidence.filter(Boolean) : [],
    tiers: dedupeRows(project.tiers, true),
    fromApi: Boolean(project.fromApi)
  };
}

function normalizeEvidence(items) {
  const seen = new Set();
  const normalized = [];

  for (const item of items || []) {
    const record = Array.isArray(item)
      ? {
          id: item[0],
          title: item[1],
          status: item[2],
          contentHash: item[3],
          geohash: item[4],
          timestamp: item[5],
          source: item[6]
        }
      : item;
    const id = textOr(record?.id, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      title: textOr(record.title, "Evidencia sem titulo"),
      status: textOr(record.status, "Pending"),
      contentHash: textOr(record.contentHash, ""),
      metadataHash: textOr(record.metadataHash, ""),
      geohash: textOr(record.geohash, "Nao publicado"),
      timestamp: record.timestamp || null,
      source: textOr(record.source, "Leafora Registry"),
      txDigest: textOr(record.txDigest, "")
    });
  }

  return normalized;
}

function projectFromApi(project) {
  return {
    id: project.slug,
    name: project.name,
    category: project.category,
    biome: project.biome,
    location: project.location_label,
    image: project.image_uri || imageForBiome(project.biome),
    status: project.display_status || project.status,
    goalSui: mistToSui(project.funding_goal_mist),
    raisedSui: mistToSui(project.raised_mist),
    supporters: 0,
    impact: project.impact_summary,
    objective: project.objective,
    story: project.story,
    risks: project.risks,
    chain: {
      projectId: textOr(project.sui_project_id, ""),
      vaultId: textOr(project.sui_vault_id, "")
    },
    milestones: (project.milestones || [])
      .filter(Boolean)
      .sort((a, b) => finiteNumber(a.display_order) - finiteNumber(b.display_order))
      .map((milestone) => [
        milestone.title,
        mistToSui(milestone.target_amount_mist),
        milestone.status,
        milestone.description
      ]),
    evidence: [],
    tiers: (project.tiers || [])
      .filter((tier) => tier?.is_active)
      .sort((a, b) => finiteNumber(a.display_order) - finiteNumber(b.display_order))
      .map((tier) => [
        tier.slug,
        tier.name,
        mistToSui(tier.amount_mist),
        Math.max(0, Math.trunc(finiteNumber(tier.allocation_points))),
        Math.max(0, Math.trunc(finiteNumber(tier.chain_tier))),
        textOr(tier.metadata_uri, ""),
        textOr(tier.description, "")
      ]),
    fromApi: true
  };
}

function evidenceFromApi(record) {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    contentHash: record.content_hash,
    metadataHash: record.metadata_hash,
    geohash: record.geohash,
    timestamp: record.capture_timestamp || record.created_at,
    source: "Leafora Capture",
    txDigest: record.sui_tx_digest
  };
}

function imageForBiome(biome) {
  const normalized = String(biome || "").toLowerCase();
  if (normalized.includes("cerrado")) return fallbackImages.cerrado;
  if (normalized.includes("mang")) return fallbackImages.manguezal;
  return fallbackImages.default;
}

function dedupeRows(rows, requireArray = false) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter((row) => {
    if (!row || (requireArray && !Array.isArray(row))) return false;
    const key = String(Array.isArray(row) ? row[0] : row.title || row.id || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mistToSui(value) {
  return finiteNumber(value) / 1_000_000_000;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function textOr(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}
