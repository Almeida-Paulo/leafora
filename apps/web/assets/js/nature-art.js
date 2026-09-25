const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.querySelectorAll("[data-nature-art]").forEach(mountNatureArt);

function mountNatureArt(figure) {
  const canvas = figure.querySelector("canvas");
  const context = canvas?.getContext("2d");
  if (!context) return;

  const toggle = figure.querySelector(".art-toggle");
  let texture;
  let frame = 0;
  let visible = false;
  let paused = false;
  let lastFrame = 0;
  let elapsed = 0;
  let width = 0;
  let height = 0;

  function draw() {
    if (!width || !height) return;
    texture ??= createFernTexture(getComputedStyle(figure).color);
    const scale = width / 600;
    context.clearRect(0, 0, width, height);
    context.save();
    context.scale(scale, height / 480);
    // Each cached frond pivots at its root; no per-frame particle generation.
    const fronds = [
      { x: 294, y: 454, angle: -0.58, size: 0.71, offset: 1.6 },
      { x: 294, y: 454, angle: 0.54, size: 0.79, offset: 3.2 },
      { x: 294, y: 454, angle: -0.07, size: 1, offset: 0 }
    ];
    for (const frond of fronds) {
      const sway = Math.sin(elapsed / 3400 + frond.offset) * 0.022;
      context.save();
      context.translate(frond.x, frond.y);
      context.rotate(frond.angle + sway);
      context.scale(frond.size, frond.size);
      context.drawImage(texture, -120, -410, 240, 410);
      context.restore();
    }
    context.restore();
  }

  function animate(now) {
    frame = 0;
    if (now - lastFrame >= 50) {
      elapsed += lastFrame ? Math.min(now - lastFrame, 100) : 0;
      lastFrame = now;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }

  function sync() {
    const moving = visible && !paused && !reducedMotion.matches && !document.hidden;
    toggle.hidden = reducedMotion.matches;
    const label = paused ? "Retomar anima\u00e7\u00e3o da folhagem" : "Pausar anima\u00e7\u00e3o da folhagem";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.querySelector("[data-art-play]").toggleAttribute("hidden", !paused);
    toggle.querySelector("[data-art-pause]").toggleAttribute("hidden", paused);
    figure.dataset.motion = moving ? "running" : "paused";
    if (moving && !frame) {
      lastFrame = 0;
      frame = requestAnimationFrame(animate);
    } else if (!moving && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    width = bounds.width;
    height = bounds.height;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    draw();
  }

  toggle.addEventListener("click", () => {
    paused = !paused;
    sync();
  });
  reducedMotion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frame);
    frame = 0;
  });
  window.addEventListener("pageshow", sync);
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(canvas);
  resize();
  sync();
}

function createFernTexture(color) {
  const columns = 110;
  const rows = 190;
  const field = new Uint16Array(columns * rows);
  let x = 0;
  let y = 0;
  let seed = 419;
  // A deterministic fern IFS supplies the silhouette; ordered dithering keeps
  // the same botanical pattern across reloads and reduced-motion rendering.
  for (let i = 0; i < 75000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const choice = seed / 4294967296;
    let nextX;
    let nextY;
    if (choice < 0.01) {
      nextX = 0;
      nextY = 0.16 * y;
    } else if (choice < 0.86) {
      nextX = 0.85 * x + 0.04 * y;
      nextY = -0.04 * x + 0.85 * y + 1.6;
    } else if (choice < 0.93) {
      nextX = 0.2 * x - 0.26 * y;
      nextY = 0.23 * x + 0.22 * y + 1.6;
    } else {
      nextX = -0.15 * x + 0.28 * y;
      nextY = 0.26 * x + 0.24 * y + 0.44;
    }
    x = nextX;
    y = nextY;
    if (i < 30) continue;
    const column = Math.floor((x + 2.7) / 5.5 * columns);
    const row = Math.floor((10.15 - y) / 10.3 * rows);
    if (column >= 0 && column < columns && row >= 0 && row < rows) field[row * columns + column]++;
  }

  const texture = document.createElement("canvas");
  texture.width = columns * 4;
  texture.height = rows * 4;
  const pen = texture.getContext("2d");
  pen.fillStyle = color;
  const thresholds = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const count = field[row * columns + column];
      if (!count) continue;
      const density = Math.min(1, 0.25 + Math.log1p(count) / 4.8);
      if (density <= thresholds[(row % 4) * 4 + column % 4] / 16) continue;
      const size = count > 8 ? 2.6 : 1.8;
      pen.fillRect(column * 4, row * 4, size, size);
    }
  }
  return texture;
}
