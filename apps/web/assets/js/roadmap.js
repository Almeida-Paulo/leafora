const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let timeline, steps = [], connectors = [], frame = 0;

export function setupRoadmapTimeline() {
  if (timeline) return;
  timeline = document.querySelector("[data-roadmap-timeline]");
  if (!timeline) return;
  steps = [...timeline.querySelectorAll(".roadmap-phase")];
  connectors = [...timeline.querySelectorAll(".timeline-connector")];
  const items = [...timeline.querySelectorAll(".phase-heading, .timeline-text, .timeline-visual, .exchange-preview")];
  items.forEach(item => item.classList.add("timeline-reveal"));

  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        reveal.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -32px 0px", threshold: 0.05 });
    items.forEach(item => {
      const bounds = item.getBoundingClientRect();
      if (!item.closest("[hidden]") && bounds.top < innerHeight && bounds.bottom > 0) {
        item.classList.add("is-revealed");
      } else reveal.observe(item);
    });
    timeline.classList.add("is-enhanced");
  }

  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) items.forEach(item => item.classList.add("is-revealed"));
    scheduleUpdate();
  });
  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate);
  timeline.addEventListener("toggle", scheduleUpdate, true);
  timeline.addEventListener("load", scheduleUpdate, true);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleUpdate).observe(timeline);
  document.fonts.ready.then(scheduleUpdate);
  scheduleUpdate();
}

export function selectRoadmapStep(id) {
  if (!timeline) return;
  const selected = steps.find(step => step.id === id) || steps[0];
  if (!selected) return;
  selected.querySelectorAll(".timeline-reveal").forEach(item => item.classList.add("is-revealed"));
  scheduleUpdate();
}

function scheduleUpdate() {
  if (!frame) frame = requestAnimationFrame(update);
}

function update() {
  frame = 0;
  if (!timeline || timeline.closest("[hidden]")) return;
  const anchor = Math.min(innerHeight * 0.72, 640);
  const progress = connectors.map(connector => {
    const bounds = connector.getBoundingClientRect();
    return reducedMotion.matches ? 1 : Math.max(0, Math.min(1, (anchor - bounds.top) / Math.max(1, bounds.height)));
  });
  connectors.forEach((connector, index) => connector.style.setProperty("--connector-progress", String(progress[index])));
}
