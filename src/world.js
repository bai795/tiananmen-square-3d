import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { createEnvironment } from './environment.js';
import {
  createTiananmen, createSquare, createMonument, createMausoleum,
  createGreatHall, createMuseum, createQianmen, createForbiddenCity,
  createGreenery, createCrowd, createLamps, createTraffic, createCityContext,
  makeGlow,
} from './landmarks.js';

const nextFrame = () => new Promise((resolve) => {
  // A timeout rather than requestAnimationFrame: progress must still advance
  // when the page is backgrounded or rendered by a headless browser.
  setTimeout(resolve, 28);
});

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function buildWorld(renderer, progress = () => {}, { fast = false } = {}) {
  const step = fast ? (() => Promise.resolve()) : nextFrame;
  const scene = new THREE.Scene();
  scene.name = 'Tiananmen Square';

  progress(0.04, '正在研墨 · 铺陈天地');
  const mats = createMaterials(renderer);
  await step();
  progress(0.14, '正在布光 · 描摹晨昏');
  const env = createEnvironment(renderer, scene, mats);
  await step();

  const ctx = {
    renderer,
    scene,
    mats,
    env,
    night: { emissive: [], glows: [], lights: [], points: [] },
    updaters: [],
  };
  makeGlow(ctx);

  progress(0.24, '正在起脊 · 营造城楼');
  createTiananmen(ctx);
  await step();
  progress(0.38, '正在铺石 · 展开广场');
  createSquare(ctx);
  await step();
  progress(0.48, '正在立碑 · 雕刻纪念');
  createMonument(ctx);
  createMausoleum(ctx);
  await step();
  progress(0.60, '正在立柱 · 构筑两翼');
  createGreatHall(ctx);
  createMuseum(ctx);
  await step();
  progress(0.70, '正在收束中轴 · 前门与宫城');
  createQianmen(ctx);
  createForbiddenCity(ctx);
  await step();
  progress(0.82, '正在点染 · 树木与人间');
  createGreenery(ctx);
  createLamps(ctx);
  createCrowd(ctx);
  createTraffic(ctx);
  await step();
  progress(0.92, '正在落笔 · 北京的天际线');
  createCityContext(ctx);
  await step();

  // ---- day / night director ----------------------------------------
  let fromHour = 18.1;
  let targetHour = 18.1;
  let currentHour = 18.1;
  let transition = 1;
  let duration = 2.6;
  let lastState = env.samplePalette(currentHour);

  function applyNight(n) {
    const v = Math.max(0, Math.min(1, n));
    for (const e of ctx.night.emissive) {
      e.material.emissiveIntensity = lerp(e.day, e.night, v);
    }
    for (const g of ctx.night.glows) {
      g.sprite.material.opacity = g.base * Math.pow(v, 0.8);
    }
    for (const p of ctx.night.points) {
      p.material.opacity = p.base * Math.pow(v, 0.7);
    }
    for (const l of ctx.night.lights) {
      l.light.intensity = l.night * Math.pow(v, 1.15);
    }
    ctx.nightFactor = v;
  }

  function commitState(hour, elapsed) {
    lastState = env.samplePalette(hour);
    env.setState(lastState, elapsed);
    applyNight(lastState.night);
    ctx.hour = hour;
  }

  commitState(currentHour, 0);

  const world = {
    scene,
    env,
    mats,
    hour: currentHour,
    get targetHour() { return targetHour; },
    get state() { return lastState; },
    get period() {
      const h = currentHour;
      if (h < 5.2) return '娣卞';
      if (h < 7.4) return '娓呮櫒';
      if (h < 11.2) return '涓婂崍';
      if (h < 16.0) return '鐧芥樇';
      if (h < 18.0) return '鏂滈槼';
      if (h < 20.0) return '榛勬槒';
      return '澶滃箷';
    },
    setHour(hour, { instant = false, duration: d = 2.6 } = {}) {
      targetHour = hour;
      fromHour = currentHour;
      duration = d;
      transition = instant ? 1 : 0;
      if (instant) {
        currentHour = hour;
        commitState(hour, 0);
      }
      return hour;
    },
    setNight(instant = false) {
      return this.setHour(21.6, { instant, duration: 2.4 });
    },
    setDay(instant = false) {
      return this.setHour(10.4, { instant, duration: 2.4 });
    },
    setDusk(instant = false) {
      return this.setHour(18.1, { instant, duration: 2.4 });
    },
    update(dt, elapsed) {
      if (transition < 1) {
        transition = Math.min(1, transition + dt / duration);
        currentHour = lerp(fromHour, targetHour, easeInOut(transition));
        commitState(currentHour, elapsed);
      }
      env.update(dt, elapsed);
      for (const fn of ctx.updaters) fn(dt, elapsed);
    },
  };

  progress(0.98, '正在点灯 · 眼前即是北京');
  await step();
  return world;
}

