import * as THREE from 'three';

/* ------------------------------------------------------------------
   Procedural textures — the whole scene is generated in the browser.
   No external images, fonts or models are required.
------------------------------------------------------------------- */

const TAU = Math.PI * 2;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(ctx, w, h, count, colors, size = 1.5, rand = Math.random) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.globalAlpha = 0.15 + rand() * 0.4;
    const r = size * (0.35 + rand() * 1.7);
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function toTexture(renderer, canvas, { repeat = [1, 1], srgb = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

/* ---- granite paving ------------------------------------------------ */
function pavingTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(21);
  ctx.fillStyle = '#a7a294';
  ctx.fillRect(0, 0, 512, 512);
  const cols = 4, rows = 8;
  const cw = 512 / cols, ch = 512 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const base = 156 + (rand() * 28 - 14);
      const warm = 6 * rand();
      ctx.fillStyle = `rgb(${base + warm | 0},${base + 2 | 0},${base - 7 | 0})`;
      ctx.fillRect(x * cw + 1.5, y * ch + 1.5, cw - 3, ch - 3);
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = rand() > 0.5 ? '#fffaf0' : '#514c42';
      ctx.fillRect(x * cw + 5, y * ch + 4, cw - 10, ch * (0.2 + rand() * 0.5));
      ctx.globalAlpha = 1;
    }
  }
  ctx.strokeStyle = 'rgba(71,67,58,.55)';
  ctx.lineWidth = 3;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath(); ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, 512); ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * ch); ctx.lineTo(512, y * ch); ctx.stroke();
  }
  speckle(ctx, 512, 512, 2600, ['#5f594f', '#d8d1c1', '#8e897d'], 1.2, rand);
  return c;
}

/* ---- asphalt ------------------------------------------------------- */
function asphaltTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(8);
  ctx.fillStyle = '#3e4042';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 8000, ['#1f2223', '#6e7070', '#54585a', '#898a84'], 1.05, rand);
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = rand() > 0.5 ? '#151718' : '#787a78';
    ctx.lineWidth = 0.8 + rand() * 2;
    ctx.beginPath();
    let x = rand() * 512, y = rand() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rand() - 0.5) * 90; y += (rand() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

/* ---- glazed roof tiles -------------------------------------------- */
function roofTexture(gold = true) {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(gold ? 33 : 9);
  const top = gold ? [204, 157, 62] : [104, 107, 105];
  const bottom = gold ? [151, 107, 31] : [64, 68, 68];
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`);
  grad.addColorStop(0.55, `rgb(${bottom[0] + 16},${bottom[1] + 12},${bottom[2] + 10})`);
  grad.addColorStop(1, `rgb(${bottom[0]},${bottom[1]},${bottom[2]})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const rowH = 32, colW = 32;
  for (let y = 0; y < 512; y += rowH) {
    const light = ctx.createLinearGradient(0, y, 0, y + rowH);
    light.addColorStop(0, 'rgba(255,244,205,.28)');
    light.addColorStop(0.32, 'rgba(255,255,255,0)');
    light.addColorStop(1, 'rgba(29,19,9,.35)');
    ctx.fillStyle = light;
    ctx.fillRect(0, y, 512, rowH);
    ctx.strokeStyle = 'rgba(57,39,14,.55)';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, y + rowH - 1); ctx.lineTo(512, y + rowH - 1); ctx.stroke();
    for (let x = 0; x < 512; x += colW) {
      const off = (y / rowH) % 2 ? colW / 2 : 0;
      const xx = (x + off) % 512;
      const rib = ctx.createLinearGradient(xx, 0, xx + colW, 0);
      rib.addColorStop(0, 'rgba(55,38,13,.24)');
      rib.addColorStop(0.18, 'rgba(255,248,209,.3)');
      rib.addColorStop(0.48, 'rgba(255,255,255,.02)');
      rib.addColorStop(0.86, 'rgba(53,36,11,.3)');
      rib.addColorStop(1, 'rgba(255,235,170,.18)');
      ctx.fillStyle = rib;
      ctx.fillRect(xx - colW * 0.3, y, colW * 0.6, rowH);
      ctx.strokeStyle = 'rgba(65,43,12,.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(xx, y + rowH * 0.5, colW * 0.22, rowH * 0.5, 0, 0, TAU);
      ctx.stroke();
    }
  }
  speckle(ctx, 512, 512, 700, gold ? ['#f5d888', '#7d551d', '#b08131'] : ['#9a9e9b', '#3b4040'], 1.1, rand);
  return c;
}

/* ---- vermilion plaster / imperial wall ----------------------------- */
function redWallTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(14);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#a74133');
  g.addColorStop(0.55, '#942f28');
  g.addColorStop(1, '#7d251f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 120; i++) {
    const x = rand() * 512, y = rand() * 512;
    const r = 8 + rand() * 80;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rand() > 0.45 ? 'rgba(235,139,105,.075)' : 'rgba(46,8,7,.07)');
    rg.addColorStop(1, 'rgba(80,16,12,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = rand() > 0.5 ? '#4b0d0b' : '#e0a085';
    ctx.lineWidth = 0.7 + rand();
    ctx.beginPath();
    ctx.moveTo(rand() * 512, 0);
    ctx.lineTo(rand() * 512, 512);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, 512, 512, 1800, ['#5a0d0a', '#c5654f', '#e4a68e'], 1.1, rand);
  return c;
}

/* ---- white marble -------------------------------------------------- */
function marbleTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(31);
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#eee9dc');
  g.addColorStop(0.5, '#dcd5c4');
  g.addColorStop(1, '#ebe5d8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = rand() > 0.4 ? 'rgba(128,124,113,.16)' : 'rgba(255,255,248,.26)';
    ctx.lineWidth = 0.6 + rand() * 2.1;
    ctx.beginPath();
    let x = rand() * 512, y = rand() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += 40 + rand() * 100;
      y += (rand() - 0.5) * 150;
      ctx.quadraticCurveTo(x - 20, y + (rand() - 0.5) * 40, x, y);
    }
    ctx.stroke();
  }
  speckle(ctx, 512, 512, 1000, ['#a9a397', '#faf7ef', '#c8c1b2'], 1.1, rand);
  return c;
}

/* ---- grey brick ---------------------------------------------------- */
function brickTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(17);
  ctx.fillStyle = '#5d5b54';
  ctx.fillRect(0, 0, 512, 512);
  const bw = 64, bh = 25;
  for (let row = 0; row < 21; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 9; col++) {
      const v = 92 + (rand() * 32 - 16);
      ctx.fillStyle = `rgb(${v + 8 | 0},${v + 6 | 0},${v | 0})`;
      ctx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      ctx.fillStyle = 'rgba(220,214,195,.08)';
      ctx.fillRect(col * bw + off + 4, row * bh + 3, bw - 9, 2);
    }
  }
  speckle(ctx, 512, 512, 1600, ['#3a3933', '#b1aea0', '#77756c'], 1, rand);
  return c;
}

/* ---- carved lattice doors ----------------------------------------- */
function latticeTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = '#2f1510';
  ctx.fillRect(0, 0, 512, 512);
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#3b1b14');
  g.addColorStop(0.55, '#4b2318');
  g.addColorStop(1, '#2a100d');
  ctx.fillStyle = g;
  ctx.fillRect(8, 8, 496, 496);

  ctx.strokeStyle = '#b98e45';
  ctx.lineWidth = 10;
  ctx.strokeRect(9, 9, 494, 494);
  ctx.lineWidth = 4;
  ctx.strokeRect(25, 25, 462, 462);

  // geometric window-screen lattice
  ctx.strokeStyle = 'rgba(209,169,94,.78)';
  ctx.lineWidth = 3;
  const step = 32;
  for (let x = 32; x < 512; x += step) {
    for (let y = 32; y < 512; y += step) {
      const n = ((x / step) | 0) + ((y / step) | 0);
      ctx.strokeStyle = n % 3 ? 'rgba(204,164,93,.56)' : 'rgba(150,105,58,.85)';
      ctx.beginPath();
      ctx.moveTo(x + step / 2, y + 5); ctx.lineTo(x + step - 5, y + step / 2);
      ctx.lineTo(x + step / 2, y + step - 5); ctx.lineTo(x + 5, y + step / 2);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(235,206,144,.65)';
  ctx.lineWidth = 2;
  for (let x = 32; x < 512; x += step * 2) {
    ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, 486); ctx.stroke();
  }
  // door pull rings
  ctx.strokeStyle = '#c59a50'; ctx.lineWidth = 6;
  for (const x of [150, 362]) {
    ctx.beginPath(); ctx.arc(x, 286, 26, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, 318, 7, 0, TAU); ctx.fillStyle = '#e1b969'; ctx.fill();
  }
  // gold studs
  ctx.fillStyle = '#c8a05a';
  for (let y = 60; y < 500; y += 56) {
    for (let x = 46; x < 500; x += 56) {
      if (x > 120 && x < 390 && y > 220 && y < 360) continue;
      ctx.beginPath(); ctx.arc(x, y, 4.3, 0, TAU); ctx.fill();
    }
  }
  return c;
}

function latticeEmissiveTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  // warm paper visible between the wooden screen
  for (let x = 30; x < 500; x += 32) {
    for (let y = 30; y < 500; y += 32) {
      const v = 180 + ((x + y) / 32) % 5 * 10;
      ctx.fillStyle = `rgb(${v},${v * 0.55 | 0},${v * 0.22 | 0})`;
      ctx.fillRect(x + 3, y + 3, 26, 26);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,.82)';
  ctx.fillRect(0, 0, 512, 512);
  // only the paper panes glow, lattice stays dark
  for (let x = 30; x < 500; x += 32) {
    for (let y = 30; y < 500; y += 32) {
      if ((Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,157,70,.82)';
        ctx.fillRect(x + 7, y + 7, 18, 18);
      }
    }
  }
  return c;
}

/* ---- painted beam (caihua) ---------------------------------------- */
function friezeTexture() {
  const { c, ctx } = makeCanvas(512, 64);
  ctx.fillStyle = '#163d3c';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#0d2c2d';
  ctx.fillRect(0, 0, 512, 6);
  ctx.fillRect(0, 58, 512, 6);
  for (let i = 0; i < 8; i++) {
    const x = i * 64;
    ctx.strokeStyle = i % 2 ? 'rgba(208,173,94,.9)' : 'rgba(193,124,80,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, 32);
    ctx.bezierCurveTo(x + 18, 4, x + 30, 58, x + 32, 32);
    ctx.bezierCurveTo(x + 36, 10, x + 46, 52, x + 58, 32);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? 'rgba(215,180,101,.65)' : 'rgba(187,98,68,.65)';
    ctx.beginPath(); ctx.arc(x + 32, 32, 5, 0, TAU); ctx.fill();
  }
  return c;
}

/* ---- national flag ------------------------------------------------- */
function flagTexture() {
  const { c, ctx } = makeCanvas(900, 600);
  ctx.fillStyle = '#de2910';
  ctx.fillRect(0, 0, 900, 600);
  // five-pointed star in a 30 x 20 grid, scaled to 900 x 600
  const sx = 30, sy = 33.333;
  function star(cx, cy, R, rotate = 0) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + rotate + i * Math.PI / 5;
      const r = i % 2 ? R * 0.382 : R;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffde00';
    ctx.fill();
  }
  star(150, 150, 90);
  const small = [
    [300, 60], [360, 120], [360, 210], [300, 270],
  ];
  for (const [x, y] of small) {
    const angle = Math.atan2(150 - y, 150 - x);
    // one point aims at the large star: rotate so a point lies along angle
    star(x, y, 30, angle + Math.PI / 2);
  }
  return c;
}

/* ---- text / signage ------------------------------------------------ */
export function textTexture({
  text, font = '700 96px "STKaiti","KaiTi","SimSun",serif',
  color = '#f4d99a', bg = 'rgba(0,0,0,0)', padding = 30,
  width = 1024, height = 256, lineHeight = 1.14, align = 'center',
  stroke = null, vertical = false,
} = {}) {
  const { c, ctx } = makeCanvas(width, height);
  ctx.clearRect(0, 0, width, height);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; }
  if (!vertical) {
    ctx.fillText(text, width / 2, height / 2, width - padding * 2);
    if (stroke) ctx.strokeText(text, width / 2, height / 2, width - padding * 2);
  } else {
    const chars = [...text];
    const size = Math.min(width * 0.72, (height - padding * 2) / chars.length);
    ctx.font = font.replace(/\d+px/, `${Math.floor(size)}px`);
    const step = (height - padding * 2) / chars.length;
    chars.forEach((ch, i) => {
      const y = padding + step * (i + 0.5);
      ctx.fillText(ch, width / 2, y);
      if (stroke) ctx.strokeText(ch, width / 2, y);
    });
  }
  return c;
}

/* ---- window / curtain-wall ---------------------------------------- */
function glassTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(44);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#32423f');
  g.addColorStop(0.4, '#24332f');
  g.addColorStop(0.75, '#1b2925');
  g.addColorStop(1, '#141f1d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // tall, smoky glazing bays with subtle variation
  for (let x = 0; x < 512; x += 64) {
    for (let y = 0; y < 512; y += 128) {
      const v = 34 + rand() * 24;
      ctx.fillStyle = `rgba(${v + 10},${v + 24},${v + 17},.38)`;
      ctx.fillRect(x + 4, y + 5, 56, 118);
      if (rand() > 0.72) {
        ctx.fillStyle = 'rgba(218,174,103,.11)';
        ctx.fillRect(x + 4, y + 44, 56, 46);
      }
    }
  }
  ctx.strokeStyle = 'rgba(167,139,92,.8)';
  ctx.lineWidth = 6;
  for (let x = 0; x <= 512; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let y = 0; y <= 512; y += 128) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(228,211,176,.23)';
  ctx.lineWidth = 1.2;
  for (let x = 32; x < 512; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  return c;
}

function glassEmissiveTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  const rand = rng(44);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      if (rand() > 0.45) {
        ctx.fillStyle = `rgba(255,170,82,${0.3 + rand() * 0.7})`;
        ctx.fillRect(x + 6, y + 6, 52, 52);
      }
    }
  }
  return c;
}

function distantWindowTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  const rand = rng(77);
  ctx.fillStyle = '#5f5b52';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 12; y < 256; y += 28) {
    for (let x = 10; x < 256; x += 24) {
      ctx.fillStyle = rand() > 0.4 ? '#343c3b' : '#867c65';
      ctx.fillRect(x, y, 13, 14);
    }
  }
  return c;
}

function distantWindowEmissive() {
  const { c, ctx } = makeCanvas(256, 256);
  const rand = rng(77);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 12; y < 256; y += 28) {
    for (let x = 10; x < 256; x += 24) {
      if (rand() > 0.55) {
        ctx.fillStyle = rand() > 0.7 ? 'rgba(255,213,146,.9)' : 'rgba(255,167,88,.45)';
        ctx.fillRect(x, y, 13, 14);
      }
    }
  }
  return c;
}

/* ---- sprites ------------------------------------------------------- */
export function glowTexture(inner = 'rgba(255,235,180,1)', outer = 'rgba(255,150,60,0)') {
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.22, 'rgba(255,213,140,.62)');
  g.addColorStop(0.55, 'rgba(255,148,55,.18)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

export function moonTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(112, 108, 8, 128, 128, 110);
  g.addColorStop(0, 'rgba(255,248,220,1)');
  g.addColorStop(0.62, 'rgba(238,231,204,.96)');
  g.addColorStop(0.78, 'rgba(208,214,219,.23)');
  g.addColorStop(1, 'rgba(160,183,214,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const rand = rng(5);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = '#7b7d72';
    ctx.beginPath();
    ctx.arc(100 + rand() * 55, 100 + rand() * 55, 2 + rand() * 8, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

export function cloudTexture() {
  const { c, ctx } = makeCanvas(512, 256);
  const rand = rng(29);
  ctx.clearRect(0, 0, 512, 256);
  for (let i = 0; i < 28; i++) {
    const x = 70 + rand() * 380;
    const y = 110 + (rand() - 0.5) * 85;
    const r = 26 + rand() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.08 + rand() * 0.16})`);
    g.addColorStop(0.55, `rgba(255,255,255,${0.035 + rand() * 0.08})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

/* ---- materials ----------------------------------------------------- */
export function createMaterials(renderer) {
  const paving = toTexture(renderer, pavingTexture(), { repeat: [24, 36], anisotropy: 16 });
  const pavingAxis = toTexture(renderer, pavingTexture(), { repeat: [3, 50], anisotropy: 16 });
  const asphalt = toTexture(renderer, asphaltTexture(), { repeat: [7, 26] });
  const roofGold = toTexture(renderer, roofTexture(true), { repeat: [0.09, 0.09], anisotropy: 16 });
  const roofGoldBump = roofGold.clone();
  roofGoldBump.colorSpace = THREE.NoColorSpace;
  const roofGrey = toTexture(renderer, roofTexture(false), { repeat: [0.09, 0.09], anisotropy: 16 });
  const roofGreyBump = roofGrey.clone();
  roofGreyBump.colorSpace = THREE.NoColorSpace;
  const red = toTexture(renderer, redWallTexture(), { repeat: [1.4, 1] });
  const marble = toTexture(renderer, marbleTexture(), { repeat: [1.5, 1.5] });
  const brick = toTexture(renderer, brickTexture(), { repeat: [2, 1.5] });
  const lattice = toTexture(renderer, latticeTexture());
  const latticeGlow = toTexture(renderer, latticeEmissiveTexture());
  const frieze = toTexture(renderer, friezeTexture(), { repeat: [3, 1] });
  const glass = toTexture(renderer, glassTexture(), { repeat: [2.4, 1.6] });
  const glassGlow = toTexture(renderer, glassEmissiveTexture(), { repeat: [2.4, 1.6] });
  const distantWin = toTexture(renderer, distantWindowTexture(), { repeat: [3, 3] });
  const distantGlow = toTexture(renderer, distantWindowEmissive(), { repeat: [3, 3] });

  const S = (opts) => new THREE.MeshStandardMaterial(opts);
  const M = {
    paving: S({ map: paving, color: 0xece6da, roughness: 0.94, metalness: 0.01 }),
    pavingAxis: S({ map: pavingAxis, color: 0xfaf4e6, roughness: 0.9 }),
    asphalt: S({ map: asphalt, color: 0xc4c3bd, roughness: 0.92 }),
    curb: S({ color: 0xd9d2c3, roughness: 0.82 }),
    grass: S({ color: 0x566738, roughness: 1 }),
    hedge: S({ color: 0x3d522d, roughness: 1 }),
    foliage: S({ color: 0x687b45, roughness: 0.95, flatShading: true }),
    cypress: S({ color: 0x405436, roughness: 0.98, flatShading: true }),
    trunk: S({ color: 0x584231, roughness: 1 }),
    redWall: S({ map: red, color: 0xffffff, roughness: 0.86 }),
    redWallDark: S({ map: red, color: 0xc69d92, roughness: 0.9 }),
    plaster: S({ color: 0xd7cab2, roughness: 0.85 }),
    marble: S({ map: marble, color: 0xfffcf4, roughness: 0.53, metalness: 0.02 }),
    marbleShade: S({ map: marble, color: 0xd8d0c0, roughness: 0.65 }),
    stone: S({ color: 0xaea99b, roughness: 0.82 }),
    stoneDark: S({ color: 0x827e72, roughness: 0.86 }),
    brick: S({ map: brick, color: 0xe0d9ca, roughness: 0.9 }),
    greyRoof: S({
      map: roofGrey, bumpMap: roofGreyBump, bumpScale: 0.14,
      color: 0xefebe0, roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide,
    }),
    goldRoof: S({
      map: roofGold, bumpMap: roofGoldBump, bumpScale: 0.2,
      color: 0xfff0ce, roughness: 0.43, metalness: 0.22, side: THREE.DoubleSide,
    }),
    goldRoofDeep: S({
      map: roofGold, bumpMap: roofGoldBump, bumpScale: 0.18,
      color: 0xffd79a, roughness: 0.48, metalness: 0.2, side: THREE.DoubleSide,
    }),
    ridge: S({ color: 0x946b2a, roughness: 0.42, metalness: 0.32 }),
    ridgeGrey: S({ color: 0x505351, roughness: 0.58, metalness: 0.2 }),
    gold: S({ color: 0xd0ac59, metalness: 0.78, roughness: 0.3 }),
    bronze: S({ color: 0x7b633f, metalness: 0.64, roughness: 0.46 }),
    vermilion: S({ color: 0x952d24, roughness: 0.6 }),
    columnRed: S({ color: 0x8b221d, roughness: 0.62 }),
    wood: S({ color: 0x4e2117, roughness: 0.72 }),
    frieze: S({ map: frieze, color: 0xffffff, roughness: 0.55, metalness: 0.1 }),
    lattice: S({
      map: lattice, roughness: 0.7, metalness: 0.04,
      emissive: 0xff8a36, emissiveMap: latticeGlow, emissiveIntensity: 0.05,
    }),
    glass: S({
      map: glass, color: 0xb9c5bd, roughness: 0.28, metalness: 0.45,
      emissive: 0xffad60, emissiveMap: glassGlow, emissiveIntensity: 0.06,
    }),
    darkGlass: S({ color: 0x1d2a2a, roughness: 0.24, metalness: 0.55 }),
    whitePaint: S({ color: 0xe8e4da, roughness: 0.7 }),
    roadLine: S({ color: 0xe7e0cc, roughness: 0.75 }),
    roadYellow: S({ color: 0xc8a34f, roughness: 0.75 }),
    lampPole: S({ color: 0x313a3b, roughness: 0.55, metalness: 0.45 }),
    lampGlow: S({ color: 0xffe8bd, emissive: 0xffc977, emissiveIntensity: 0.3, roughness: 0.4 }),
    lantern: S({ color: 0xb73727, emissive: 0xff4d1f, emissiveIntensity: 0.45, roughness: 0.6 }),
    flowerRed: S({ color: 0xa7332e, roughness: 0.9 }),
    flowerGold: S({ color: 0xc29a3e, roughness: 0.9 }),
    distant: S({
      map: distantWin, color: 0xe8dfcd,
      emissive: 0xffb067, emissiveMap: distantGlow, emissiveIntensity: 0.02,
      roughness: 0.9,
    }),
    distantDark: S({ color: 0x837f75, roughness: 0.93 }),
    hutongRoof: S({ color: 0x787973, roughness: 0.9 }),
    hutongWall: S({ color: 0xa39a89, roughness: 1 }),
    mountain: S({ color: 0x6f7b7e, roughness: 1, flatShading: true }),
    water: null, // filled by environment.js
    flag: new THREE.MeshStandardMaterial({
      map: toTexture(renderer, flagTexture(), { repeat: [1, 1] }),
      side: THREE.DoubleSide, roughness: 0.88, metalness: 0,
    }),
  };

  // independent flag texture per side is not possible with a single plane;
  // the silk-like roughness and waving silhouette make the reverse acceptable.
  M.flag.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  M._renderer = renderer;
  M._textures = {
    paving, asphalt, roofGold, roofGrey, red, marble, brick, lattice,
    latticeGlow, frieze, glass, glassGlow, distantWin, distantGlow,
  };
  return M;
}

export { makeCanvas, toTexture, rng };
