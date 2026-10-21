// Preserve the supplied film, including every silhouette and wing pose.
// An SVG colour matrix turns its white background transparent and its ink #1A1A1A.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('[data-footer-birds]').forEach(mountBirds);

function mountBirds(figure) {
  const video = figure.querySelector('video');
  if (!video) return;
  let visible = false, ready = false, loading = false, videoFrame = 0;
  video.muted = true;
  video.defaultPlaybackRate = .60;
  video.playbackRate = .60;

  function fadeLoop() {
    videoFrame = 0;
    if (reduceMotion.matches) { sync(); return; }
    if (video.paused) return;
    // Hide only the film's cut at the loop boundary, never invent wing poses.
    const duration = video.duration || 10;
    const opacity = Math.min(1, video.currentTime / .20, (duration - video.currentTime) / .20);
    video.style.opacity = String(Math.max(0, opacity));
    videoFrame = video.requestVideoFrameCallback(fadeLoop);
  }

  function sync() {
    const moving = ready && visible && !reduceMotion.matches && !document.hidden;
    figure.dataset.motion = !ready ? 'loading' : moving ? 'running' : 'paused';
    if (moving) {
      video.play().then(() => {
        if ('requestVideoFrameCallback' in video && !videoFrame) videoFrame = video.requestVideoFrameCallback(fadeLoop);
      }).catch(() => { figure.dataset.motion = 'paused'; });
    } else {
      video.pause();
      if (videoFrame) video.cancelVideoFrameCallback(videoFrame);
      videoFrame = 0;
      video.style.opacity = '1';
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    video.addEventListener('loadeddata', () => {
      // The still image for reduced motion is also a real frame of the source.
      video.currentTime = 1.15;
      video.playbackRate = .60;
      ready = true; figure.dataset.ready = 'true'; sync();
    }, { once: true });
    video.addEventListener('error', () => { figure.dataset.motion = 'unavailable'; });
    try {
      // Buffer the small local file once; local preview servers may not support byte ranges.
      const response = await fetch(new URL('../video/birds-flight-reference.mp4', import.meta.url));
      if (!response.ok) throw new Error('Flight unavailable');
      video.src = URL.createObjectURL(await response.blob());
      video.load();
    } catch { figure.dataset.motion = 'unavailable'; }
  }

  function resize() {
    const bounds = figure.getBoundingClientRect();
    const copy = figure.closest('.future-birds').querySelector('.future-copy').getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const copyBottom = copy.bottom - bounds.top;
    const copyRight = copy.right - bounds.left + 16;
    const narrow = bounds.width <= 1000;
    const availableWidth = Math.max(0, bounds.width - copyRight - 24);
    const filmHeight = narrow
      ? Math.min(bounds.width + 24, 640) * 900 / 640
      : Math.min(bounds.height * 1.12, availableWidth * 900 / 640);
    const filmWidth = filmHeight * 720 / 900;
    const cropWidth = filmHeight * 640 / 900;
    const x = narrow ? (bounds.width - filmWidth) / 2
      : copyRight + (availableWidth - cropWidth) / 2 - filmHeight * 40 / 900;
    // Cover the mobile flight area by width, preserving the original film ratio.
    const y = narrow ? copyBottom + (bounds.height - copyBottom - filmHeight) / 2
      : (bounds.height - filmHeight) / 2;
    Object.assign(video.style, {width: `${filmWidth}px`, height: `${filmHeight}px`, left: `${x}px`, top: `${y}px`});
    figure.style.setProperty('--birds-copy-right', `${copyRight}px`);
    figure.style.setProperty('--birds-copy-bottom', `${copyBottom}px`);
  }
  reduceMotion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { video.pause(); if (videoFrame) video.cancelVideoFrameCallback(videoFrame); videoFrame = 0; });
  window.addEventListener('pageshow', sync);
  new ResizeObserver(resize).observe(figure.closest('.future-birds'));
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) load(); sync(); }).observe(figure);
  document.fonts.ready.then(resize);
  resize(); sync();
}
