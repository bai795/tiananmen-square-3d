import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildWorld } from './world.js';
import { SITES, VIEWS, siteById } from './sites.js';

/* ------------------------------------------------------------------
   DOM helpers
------------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = THREE.MathUtils.clamp;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const canvas = $('#scene');
const app = $('#app');
const loading = $('#loading');
const progressBar = $('#progressBar');
const loadingPct = $('#loadingPct');
const loadingText = $('#loadingText');
const hotspotsRoot = $('#hotspots');
const siteListEl = $('#siteList');
const infoPanel = $('#infoPanel');
const panelClose = $('#panelClose');
const flyBtn = $('#flyBtn');
const nextBtn = $('#nextBtn');
const timeBtn = $('#timeBtn');
const timeLabel = $('#timeLabel');
const tourBtn = $('#tourBtn');
const tourCaption = $('#tourCaption');
const toastEl = $('#toast');
const liveClock = $('#liveClock');
const livePhase = $('#livePhase');
const aboutModal = $('#aboutModal');
const fatalEl = $('#fatal');
const fatalMessage = $('#fatalMessage');
const bootHelp = $('#bootHelp');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const params = new URLSearchParams(window.location.search);
const SNAP = params.get('snap') === '1';
const FORCED_HOUR = params.get('hour') !== null ? Number(params.get('hour')) : null;
const FORCED_VIEW = params.get('view');
const OPEN_PANEL = params.get('panel');
const HIDE_UI = params.get('ui') === '0';
const DEBUG_CAM = params.get('cam')?.split(',').map(Number);
const DEBUG_LOOK = params.get('look')?.split(',').map(Number);
if (HIDE_UI) document.body.classList.add('ui-hidden');
if (SNAP) document.body.classList.add('snap-mode');

const state = {
  ready: false,
  activeSite: null,
  tourActive: false,
  tourToken: 0,
  introPlaying: false,
  lastPanelIndex: 0,
};

// Register these before the renderer is created: a WebGL/initialisation error
// must never leave the loading screen silently frozen at 0%.
window.addEventListener('error', (e) => {
  if (!state.ready && !window.__TAS_ERROR__) showFatal(friendlyErrorMessage(e.message));
  console.error('[Tiananmen Atlas]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  if (!state.ready && !window.__TAS_ERROR__) showFatal(friendlyErrorMessage(e.reason?.message || e.reason));
  console.error('[Tiananmen Atlas] unhandled', e.reason);
});

if (!CanvasRenderingContext2D) {
  // extremely old browser guard; the real check follows WebGL creation
}

/* ------------------------------------------------------------------
   Renderer & camera
------------------------------------------------------------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
} catch (err) {
  showFatal('无法创建 WebGL 渲染上下文。请使用支持 WebGL 2 的现代浏览器。');
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.5 : 1.8));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x10151b, 1);

const camera = new THREE.PerspectiveCamera(
  41,
  window.innerWidth / window.innerHeight,
  1,
  15000,
);
camera.position.set(560, 360, 780);

const isMobileViewport = () => window.innerWidth < 760;
const preferredFov = () => {
  if (window.innerWidth < 760) return 50;
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return aspect < 1.08 ? 45 : 41;
};
camera.fov = preferredFov();
camera.updateProjectionMatrix();

const getHomeView = () => (isMobileViewport() ? VIEWS.homeMobile : VIEWS.home);
const getOverviewView = () => (isMobileViewport() ? VIEWS.overviewMobile : VIEWS.overview);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 20, 120);
controls.enableDamping = true;
controls.dampingFactor = 0.057;
controls.rotateSpeed = 0.52;
controls.zoomSpeed = 0.78;
controls.panSpeed = 0.6;
controls.screenSpacePanning = false;
controls.minDistance = 18;
controls.maxDistance = 1950;
controls.minPolarAngle = 0.055;
controls.maxPolarAngle = Math.PI * 0.492;
if ('zoomToCursor' in controls) controls.zoomToCursor = true;
controls.update();

let world = null;
let elapsed = 0;
let previousTime = performance.now();
let transition = null;
let introTimer = null;
let toastTimer = null;
let livePhaseLast = '';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------
   Cinematic camera
------------------------------------------------------------------- */
function vec(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

function flyTo(view, { duration = 2.6, arc = 0 } = {}) {
  if (!view) return;
  const toPos = vec(view.pos);
  const toTarget = vec(view.target);
  const distance = camera.position.distanceTo(toPos);
  transition = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos,
    toTarget,
    t: 0,
    duration: reducedMotion ? 0.01 : Math.max(0.4, duration),
    arc: arc || Math.min(90, distance * 0.055),
    resolve: null,
  };
  controls.enabled = false;
  return new Promise((resolve) => {
    transition.resolve = resolve;
  });
}

function finishTransition(snapToEnd = true) {
  if (!transition) return;
  const tr = transition;
  transition = null;
  if (snapToEnd) {
    camera.position.copy(tr.toPos);
    controls.target.copy(tr.toTarget);
    camera.lookAt(controls.target);
  }
  controls.enabled = true;
  controls.update();
  if (tr.resolve) tr.resolve();
}

function cancelTransition({ snapToEnd = false } = {}) {
  if (!transition) return;
  const tr = transition;
  transition = null;
  if (snapToEnd) {
    camera.position.copy(tr.toPos);
    controls.target.copy(tr.toTarget);
    camera.lookAt(controls.target);
  }
  controls.enabled = true;
  controls.update();
  if (tr.resolve) tr.resolve();
}

function updateCamera(dt) {
  if (transition) {
    transition.t = Math.min(1, transition.t + dt / transition.duration);
    const e = easeInOutCubic(transition.t);
    camera.position.lerpVectors(transition.fromPos, transition.toPos, e);
    camera.position.y += Math.sin(Math.PI * e) * transition.arc;
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, e);
    camera.lookAt(controls.target);
    if (transition.t >= 1) {
      const tr = transition;
      transition = null;
      controls.enabled = true;
      controls.update();
      if (tr.resolve) tr.resolve();
    }
    return;
  }
  controls.update();
  // Keep the orbit target within the narrative bounds of the square.
  const t = controls.target;
  const nx = clamp(t.x, -1150, 1150);
  const ny = clamp(t.y, 1, 220);
  const nz = clamp(t.z, -950, 1180);
  if (nx !== t.x || ny !== t.y || nz !== t.z) {
    const shift = new THREE.Vector3(nx - t.x, ny - t.y, nz - t.z);
    camera.position.add(shift);
    t.set(nx, ny, nz);
  }
}

function setImmediate(view) {
  if (!view) return;
  camera.position.set(view.pos[0], view.pos[1], view.pos[2]);
  controls.target.set(view.target[0], view.target[1], view.target[2]);
  camera.lookAt(controls.target);
  controls.update();
}

function stopIntro() {
  if (!state.introPlaying) return;
  state.introPlaying = false;
  hideIntroLine();
  cancelTransition({ snapToEnd: false });
}

/* ------------------------------------------------------------------
   Loading
------------------------------------------------------------------- */
let displayedProgress = 0;
function updateLoading(progress, text) {
  displayedProgress = Math.max(displayedProgress, progress);
  const pct = Math.round(displayedProgress * 100);
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (loadingPct) loadingPct.textContent = `${pct}%`;
  if (text && loadingText) loadingText.textContent = text;
  if (pct > 0 && bootHelp) bootHelp.hidden = true;
}

function friendlyErrorMessage(message) {
  const text = String(message || '');
  if (/webgl|rendering context|context creation/i.test(text)) {
    return '无法创建 WebGL 渲染上下文。请开启浏览器硬件加速，或使用最新版 Chrome / Edge 打开。';
  }
  return text || '场景初始化失败，请重新载入页面。';
}

function showFatal(message) {
  if (window.__TAS_ERROR__) return;
  const text = friendlyErrorMessage(message);
  window.__TAS_ERROR__ = text;
  if (fatalEl) {
    fatalMessage.textContent = text;
    fatalEl.hidden = false;
    loading?.classList.add('is-done');
    if (bootHelp) bootHelp.hidden = true;
  }
}

async function boot() {
  const start = performance.now();
  try {
    updateLoading(0.02, '正在研墨 · 铺陈天地');
    const minLoad = SNAP ? 80 : 1600;
    world = await buildWorld(renderer, updateLoading, { fast: SNAP });
    const remaining = Math.max(0, minLoad - (performance.now() - start));
    await sleep(remaining);
    updateLoading(1, '天地已就 · 请入画');
    await sleep(SNAP ? 20 : 500);

    if (FORCED_HOUR !== null && Number.isFinite(FORCED_HOUR)) {
      world.setHour(clamp(FORCED_HOUR, 0, 23.99), { instant: true });
    }
    if (DEBUG_CAM && DEBUG_LOOK && DEBUG_CAM.length === 3 && DEBUG_LOOK.length === 3) {
      setImmediate({ pos: DEBUG_CAM, target: DEBUG_LOOK });
    } else if (FORCED_VIEW) {
      const view = siteById(FORCED_VIEW)?.focus || VIEWS[FORCED_VIEW];
      if (view) setImmediate(view);
    } else if (SNAP) {
      setImmediate(getHomeView());
    } else {
      setImmediate(getOverviewView());
      if (isMobileViewport()) {
        camera.position.set(280, 480, 740);
        controls.target.set(0, 0, 150);
      } else {
        camera.position.set(600, 430, 900);
        controls.target.set(0, 15, 220);
      }
      camera.lookAt(controls.target);
    }

    if (OPEN_PANEL) {
      const site = siteById(OPEN_PANEL) || SITES.find((s) => s.id === FORCED_VIEW);
      if (site) {
        const view = site.focus;
        setImmediate(view);
        openSitePanel(site);
      }
    }

    // start rendering behind the loading veil
    // start rendering behind the loading veil
    renderer.setAnimationLoop(animate);
    updateLoading(1, '天地已就 · 请入画');

    // One synchronous frame guarantees the scene is present even if the
    // browser throttles requestAnimationFrame during a snapshot.
    controls.update();
    renderer.render(world.scene, camera);
    updateHotspots();

    loading.classList.add('is-done');
    if (bootHelp) bootHelp.hidden = true;
    if (SNAP) loading.style.display = 'none';
    app.classList.remove('is-loading');
    app.classList.add('is-ready');
    state.ready = true;
    window.__TAS_READY__ = true;

    syncTimeUI();
    updateClock();
    requestAnimationFrame(updateHotspots);

    if (!SNAP && !FORCED_VIEW && !OPEN_PANEL) {
      startIntro();
    } else {
      hideIntroLine();
      if (!SNAP && !OPEN_PANEL) {
        // small flourish when a direct deep-link is opened normally
        flyTo(FORCED_VIEW ? (siteById(FORCED_VIEW)?.focus || VIEWS[FORCED_VIEW] || getHomeView()) : getHomeView(), { duration: 1.4, arc: 6 });
      }
    }
  } catch (err) {
    console.error(err);
    showFatal(friendlyErrorMessage(err?.message) || '构建三维场景时发生错误。');
  }
}

function startIntro() {
  state.introPlaying = true;
  const home = getHomeView();
  const introView = { pos: home.pos, target: home.target };
  controls.enabled = false;
  flyTo(introView, { duration: 7.2, arc: 95 }).then(() => {
    if (!state.introPlaying) return;
    state.introPlaying = false;
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(hideIntroLine, 3300);
  });
  // The line appears while the camera is still moving.
  setTimeout(() => {
    if (state.introPlaying) showIntroLine();
  }, 1100);
}

function showIntroLine() {
  const el = $('#introLine');
  if (!el) return;
  el.classList.add('is-visible');
  el.classList.remove('is-gone');
}

function hideIntroLine() {
  const el = $('#introLine');
  if (!el) return;
  el.classList.remove('is-visible');
  el.classList.add('is-gone');
  if (introTimer) clearTimeout(introTimer);
  introTimer = null;
}

/* ------------------------------------------------------------------
   Hotspots
------------------------------------------------------------------- */
const hotspotEls = new Map();
function buildHotspots() {
  for (const site of SITES) {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.dataset.id = site.id;
    el.innerHTML = `
      <button class="hotspot-button" type="button" aria-label="查看${site.name}">${site.no}</button>
      <span class="hotspot-label"><strong>${site.name}</strong><em>${site.en}</em></span>
    `;
    el.querySelector('button').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      stopTour({ silent: true });
      selectSite(site, { fly: true, source: 'hotspot' });
    });
    hotspotsRoot.appendChild(el);
    site._el = el;
    site._marker = new THREE.Vector3(site.marker[0], site.marker[1], site.marker[2]);
    hotspotEls.set(site.id, el);
  }
}

const projected = [];
const forward = new THREE.Vector3();
const worldDir = new THREE.Vector3();
function updateHotspots() {
  if (!state.ready) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.getWorldDirection(forward);
  projected.length = 0;
  for (const site of SITES) {
    const el = site._el;
    if (!el) continue;
    const to = worldDir.copy(site._marker).sub(camera.position);
    const isBehind = to.dot(forward) <= 0;
    const p = site._marker.clone().project(camera);
    const x = (p.x * 0.5 + 0.5) * w;
    const y = (-p.y * 0.5 + 0.5) * h;
    const out = isBehind || p.z > 1 || x < -90 || x > w + 90 || y < -50 || y > h + 80;
    if (out) {
      el.classList.remove('is-visible');
      el.classList.add('is-hidden');
      continue;
    }
    el.classList.remove('is-hidden');
    el.classList.add('is-visible');
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.classList.toggle('flip', x > w * 0.61);
    el.classList.toggle('is-active', state.activeSite?.id === site.id);
    let compact = false;
    if (state.activeSite?.id !== site.id) {
      for (const q of projected) {
        if (Math.abs(q.x - x) < 100 && Math.abs(q.y - y) < 42) { compact = true; break; }
      }
    }
    el.classList.toggle('is-compact', compact);
    if (!compact) projected.push({ x, y });
  }
}

/* ------------------------------------------------------------------
   Site rail, panel and selection
------------------------------------------------------------------- */
function buildSiteList() {
  const frag = document.createDocumentFragment();
  SITES.forEach((site) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'site-link';
    btn.dataset.id = site.id;
    btn.innerHTML = `
      <span class="site-no">${site.no}</span>
      <span class="site-copy"><strong>${site.name}</strong><small>${site.en}</small></span>
      <span class="site-mark" aria-hidden="true"></span>
    `;
    btn.addEventListener('click', () => {
      stopTour({ silent: true });
      selectSite(site, { fly: true, source: 'rail' });
    });
    li.appendChild(btn);
    frag.appendChild(li);
    site._rail = btn;
  });
  siteListEl.appendChild(frag);
}

function syncActiveSite() {
  const id = state.activeSite?.id;
  SITES.forEach((site) => {
    const current = site.id === id;
    site._rail?.classList.toggle('is-active', current);
    if (current) site._rail?.setAttribute('aria-current', 'true');
    else site._rail?.removeAttribute('aria-current');
    site._el?.classList.toggle('is-active', current);
  });
}

function fillPanel(site) {
  $('#panelIndex').textContent = site.no;
  $('#panelTag').textContent = site.tag;
  $('#panelName').textContent = site.name;
  $('#panelEn').textContent = site.en;
  $('#panelDesc').textContent = site.desc;
  $('#panelNote').textContent = site.note;
  $('#panelChar').textContent = site.char;
  $('#panelView').textContent = site.view;
  $('#panelCounter').textContent = `${site.no} / ${String(SITES.length).padStart(2, '0')}`;
  const facts = $('#panelFacts');
  facts.replaceChildren();
  for (const [label, value] of site.facts) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    div.append(dt, dd);
    facts.appendChild(div);
  }
  state.lastPanelIndex = SITES.findIndex((s) => s.id === site.id);
}

function openSitePanel(site) {
  fillPanel(site);
  infoPanel.classList.add('is-open');
  infoPanel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open-mobile');
}

function closeSitePanel({ clearActive = true } = {}) {
  infoPanel.classList.remove('is-open');
  infoPanel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open-mobile');
  if (clearActive) {
    state.activeSite = null;
    syncActiveSite();
  }
}

function selectSite(site, { fly = true, source = 'ui', duration = 2.5 } = {}) {
  if (!site) return;
  state.activeSite = site;
  syncActiveSite();
  fillPanel(site);
  openSitePanel(site);
  hideIntroLine();
  if (fly) {
    state.introPlaying = false;
    flyTo(site.focus, { duration, arc: 10 });
  }
}

function selectNext() {
  if (!SITES.length) return;
  const current = state.activeSite || SITES[state.lastPanelIndex] || SITES[0];
  const idx = SITES.findIndex((s) => s.id === current.id);
  const next = SITES[(idx + 1) % SITES.length];
  stopTour({ silent: false });
  selectSite(next, { fly: true, source: 'next' });
}

panelClose?.addEventListener('click', () => {
  if (state.tourActive) stopTour({ silent: true });
  closeSitePanel();
});
flyBtn?.addEventListener('click', () => {
  stopTour({ silent: true });
  if (state.activeSite) flyTo(state.activeSite.focus, { duration: 1.9, arc: 5 });
});
nextBtn?.addEventListener('click', selectNext);

/* ------------------------------------------------------------------
   Guided tour
------------------------------------------------------------------- */
async function startTour() {
  if (!state.ready) return;
  if (state.tourActive) {
    stopTour({ silent: false });
    return;
  }
  state.tourActive = true;
  state.tourToken++;
  const token = state.tourToken;
  updateTourUI(true);
  hideIntroLine();
  closeSitePanel({ clearActive: false });
  tourCaption.classList.add('is-visible');
  const compactView = window.innerWidth <= 940;

  for (let i = 0; i < SITES.length; i++) {
    if (token !== state.tourToken || !state.tourActive) return;
    const site = SITES[i];
    state.activeSite = site;
    syncActiveSite();
    updateTourCaption(site, i);
    fillPanel(site);
    if (!compactView) openSitePanel(site);
    else closeSitePanel({ clearActive: false });
    await flyTo(site.focus, { duration: 2.9, arc: 14 });
    if (token !== state.tourToken || !state.tourActive) return;
    await sleep(compactView ? 3500 : 4300);
  }
  if (token === state.tourToken) {
    await flyTo(getOverviewView(), { duration: 3.4, arc: 30 });
    if (token !== state.tourToken) return;
    stopTour({ silent: true });
    closeSitePanel();
    showToast('巡游结束 · 可继续自由探索');
  }
}

function stopTour({ silent = false } = {}) {
  if (!state.tourActive) {
    if (!silent) updateTourUI(false);
    return;
  }
  state.tourActive = false;
  state.tourToken++;
  updateTourUI(false);
  tourCaption.classList.remove('is-visible');
  cancelTransition({ snapToEnd: false });
  if (!silent) showToast('已暂停巡游 · 拖拽以自由探索');
}

function updateTourUI(active) {
  tourBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  const label = tourBtn.querySelector('span');
  if (label) label.textContent = active ? '停止巡游' : '自动巡游';
}

function updateTourCaption(site, i) {
  $('#tourIndex').textContent = site.no;
  $('#tourName').textContent = site.name;
  $('#tourTag').textContent = site.tag;
  tourCaption.classList.add('is-visible');
}

tourBtn?.addEventListener('click', () => {
  if (state.tourActive) stopTour({ silent: false });
  else startTour();
});

/* ------------------------------------------------------------------
   Time of day
------------------------------------------------------------------- */
function isNightTarget() {
  if (!world) return false;
  const h = world.targetHour;
  return h >= 19 || h < 5.3;
}

function syncTimeUI() {
  if (!world) return;
  const night = isNightTarget();
  const daylight = !night && world.targetHour < 13.2;
  document.body.classList.toggle('is-night', night);
  if (timeLabel) {
    timeLabel.textContent = night ? '切换白昼' : daylight ? '切换黄昏' : '切换夜景';
  }
  timeBtn?.setAttribute('aria-pressed', night ? 'true' : 'false');
  livePhase && (livePhase.textContent = world.period);
}

function toggleTime() {
  if (!world) return;
  if (isNightTarget()) {
    world.setDay();
    showToast('晨光初开 · 白昼');
  } else if (world.targetHour < 13.2) {
    world.setDusk();
    showToast('斜阳西下 · 黄昏');
  } else {
    world.setNight();
    showToast('暮色四合 · 华灯初上');
  }
  syncTimeUI();
}

timeBtn?.addEventListener('click', toggleTime);

/* ------------------------------------------------------------------
   Utilities: view buttons, toast, clock, modal
------------------------------------------------------------------- */
$('#overviewBtn')?.addEventListener('click', () => {
  stopTour({ silent: true });
  state.activeSite = null;
  syncActiveSite();
  closeSitePanel();
  flyTo(getOverviewView(), { duration: 2.8, arc: 25 });
});

$('#resetBtn')?.addEventListener('click', () => {
  stopTour({ silent: true });
  state.activeSite = null;
  syncActiveSite();
  closeSitePanel();
  flyTo(getHomeView(), { duration: 2.6, arc: 10 });
});

$('#brand')?.addEventListener('click', (e) => {
  e.preventDefault();
  stopTour({ silent: true });
  closeSitePanel();
  state.activeSite = null;
  syncActiveSite();
  flyTo(getHomeView(), { duration: 2.4, arc: 6 });
});

function showToast(message, ms = 2300) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastTimer = null;
  }, ms);
}

function updateClock() {
  if (!liveClock) return;
  try {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const beijing = new Date(utc + 8 * 3600000);
    liveClock.textContent = beijing.toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch {
    liveClock.textContent = '--:--:--';
  }
  if (world) {
    const phase = world.period;
    if (phase !== livePhaseLast) {
      livePhaseLast = phase;
      if (livePhase) livePhase.textContent = phase;
      syncTimeUI();
    }
  }
}
setInterval(updateClock, 1000);

function openModal() {
  aboutModal.hidden = false;
  document.body.classList.add('modal-open');
}
function closeModal() {
  aboutModal.hidden = true;
  document.body.classList.remove('modal-open');
}
$('#aboutBtn')?.addEventListener('click', openModal);
$$('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));

$('#fullscreenBtn')?.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showToast('当前浏览器不支持全屏');
  }
});

/* ------------------------------------------------------------------
   Compass
------------------------------------------------------------------- */
const compassRing = $('#compassRing');
const compassLabel = $('#compassLabel');
const compassDir = new THREE.Vector3();
const headings = ['正北', '东北', '正东', '东南', '正南', '西南', '正西', '西北'];
let lastBearing = -1;
function updateCompass() {
  if (!compassRing) return;
  camera.getWorldDirection(compassDir);
  const bearing = (Math.atan2(compassDir.x, -compassDir.z) * 180 / Math.PI + 360) % 360;
  if (Math.abs(bearing - lastBearing) > 0.08) {
    compassRing.style.transform = `rotate(${-bearing}deg)`;
    const idx = Math.round(bearing / 45) % 8;
    if (compassLabel) compassLabel.textContent = headings[idx];
    lastBearing = bearing;
  }
}

/* ------------------------------------------------------------------
   Interaction and keyboard
------------------------------------------------------------------- */
canvas.addEventListener('pointerdown', () => {
  if (state.tourActive) {
    stopTour({ silent: false });
  } else if (state.introPlaying) {
    stopIntro();
  }
}, { passive: true });

canvas.addEventListener('wheel', () => {
  if (state.tourActive) stopTour({ silent: true });
}, { passive: true });

controls.addEventListener('start', () => {
  hideIntroLine();
  if (state.tourActive) stopTour({ silent: true });
});

window.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (e.key === 'Escape') {
    if (!aboutModal.hidden) { closeModal(); return; }
    if (infoPanel.classList.contains('is-open')) { closeSitePanel(); return; }
    if (state.tourActive) { stopTour({ silent: false }); return; }
  }
  if (!aboutModal.hidden) return;
  if (e.code === 'Space' && !e.target?.closest?.('button, a')) {
    e.preventDefault();
    if (state.tourActive) stopTour({ silent: false });
    else startTour();
    return;
  }
  if (e.key === 'n' || e.key === 'N') { toggleTime(); }
  if (e.key === 'r' || e.key === 'R') {
    $('#resetBtn')?.click();
  }
});

/* ------------------------------------------------------------------
   Resize & render loop
------------------------------------------------------------------- */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = preferredFov();
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 760 ? 1.5 : 1.8));
  renderer.setSize(w, h, false);
  updateHotspots();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 160));

function animate(now) {
  const raw = typeof now === 'number' ? now : performance.now();
  const dt = Math.min(0.14, Math.max(0.001, (raw - previousTime) / 1000));
  previousTime = raw;
  elapsed += dt;

  if (world) {
    world.update(dt, elapsed);
  }
  updateCamera(dt);
  updateHotspots();
  updateCompass();
  if (state.ready) {
    livePhase && (livePhase.textContent = world?.period || '黄昏');
  }
  renderer.render(world?.scene || new THREE.Scene(), camera);
}

/* ------------------------------------------------------------------
   Exhibit
------------------------------------------------------------------- */
buildSiteList();
buildHotspots();
boot();

window.__TAS__ = {
  get camera() { return camera; },
  get controls() { return controls; },
  get world() { return world; },
  get renderer() { return renderer; },
  flyTo,
  setImmediate,
  selectSite: (id) => {
    const s = siteById(id);
    if (s) selectSite(s, { fly: true });
  },
};
