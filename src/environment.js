import * as THREE from 'three';
import { cloudTexture, glowTexture, moonTexture, toTexture } from './materials.js';

/* ------------------------------------------------------------------
   A physically-inspired but fully procedural sky, sun and atmosphere.
------------------------------------------------------------------- */

const KEYFRAMES = [
  {
    h: 0,
    top: '#02060f', horizon: '#0a1626', ground: '#060b13', fog: '#09121f',
    sun: '#9cb7e4', sunI: 0.3, hemiSky: '#2b3c55', hemiGround: '#151310',
    hemiI: 0.36, ambient: '#2b3c53', ambientI: 0.36, stars: 0.8, night: 1,
    exposure: 1.15, clouds: '#1b2636', cloudA: 0.1, envI: 0.18, fogD: 0.0005,
  },
  {
    h: 4.8,
    top: '#061120', horizon: '#1a2636', ground: '#0c1017', fog: '#121c28',
    sun: '#b2b9c7', sunI: 0.28, hemiSky: '#3b4b62', hemiGround: '#1e1b17',
    hemiI: 0.36, ambient: '#2c3a4c', ambientI: 0.33, stars: 0.55, night: 0.92,
    exposure: 1.14, clouds: '#2d3542', cloudA: 0.14, envI: 0.18, fogD: 0.00048,
  },
  {
    h: 6.2,
    top: '#20375b', horizon: '#d69a79', ground: '#5b4b40', fog: '#b99688',
    sun: '#ffc08c', sunI: 1.45, hemiSky: '#8797ad', hemiGround: '#59483c',
    hemiI: 0.48, ambient: '#a48b7f', ambientI: 0.2, stars: 0.18, night: 0.28,
    exposure: 1.06, clouds: '#e5b7a0', cloudA: 0.3, envI: 0.34, fogD: 0.00082,
  },
  {
    h: 9,
    top: '#3b699e', horizon: '#c4d2d6', ground: '#6a6155', fog: '#bcc8c9',
    sun: '#fff1d7', sunI: 2.65, hemiSky: '#aac8e4', hemiGround: '#786a55',
    hemiI: 0.68, ambient: '#d7e1e9', ambientI: 0.15, stars: 0, night: 0,
    exposure: 1.0, clouds: '#f2f1eb', cloudA: 0.46, envI: 0.5, fogD: 0.0007,
  },
  {
    h: 13,
    top: '#346da9', horizon: '#d2dde0', ground: '#756a58', fog: '#c9d2d1',
    sun: '#fff7e6', sunI: 3.0, hemiSky: '#bed9ee', hemiGround: '#7f725c',
    hemiI: 0.72, ambient: '#dfe6e8', ambientI: 0.16, stars: 0, night: 0,
    exposure: 0.96, clouds: '#f7f5ef', cloudA: 0.5, envI: 0.52, fogD: 0.00068,
  },
  {
    h: 16.1,
    top: '#2e5f92', horizon: '#f4cb98', ground: '#7b6750', fog: '#d7b89b',
    sun: '#ffe0ad', sunI: 3.9, hemiSky: '#a7c0d6', hemiGround: '#7d684f',
    hemiI: 0.46, ambient: '#d4bea2', ambientI: 0.1, stars: 0, night: 0,
    exposure: 1.16, clouds: '#f6e5cc', cloudA: 0.5, envI: 0.34, fogD: 0.00082,
  },
  {
    h: 17.55,
    top: '#264a6d', horizon: '#efb279', ground: '#66513d', fog: '#c9a686',
    sun: '#ffbb73', sunI: 2.9, hemiSky: '#8fa7be', hemiGround: '#65503d',
    hemiI: 0.4, ambient: '#c1a285', ambientI: 0.11, stars: 0.08, night: 0.08,
    exposure: 1.11, clouds: '#f3d1ad', cloudA: 0.44, envI: 0.3, fogD: 0.00086,
  },
  {
    h: 18.55,
    top: '#273d5f', horizon: '#dd8c60', ground: '#3d3028', fog: '#a47f6c',
    sun: '#ff975e', sunI: 1.1, hemiSky: '#65778f', hemiGround: '#48382d',
    hemiI: 0.38, ambient: '#8d7365', ambientI: 0.16, stars: 0.48, night: 0.48,
    exposure: 1.07, clouds: '#e2a581', cloudA: 0.34, envI: 0.3, fogD: 0.00086,
  },
  {
    h: 19.5,
    top: '#101e38', horizon: '#935d54', ground: '#17171c', fog: '#4a444f',
    sun: '#bc7c68', sunI: 0.38, hemiSky: '#36455f', hemiGround: '#25201c',
    hemiI: 0.32, ambient: '#3d4559', ambientI: 0.29, stars: 0.65, night: 0.92,
    exposure: 1.16, clouds: '#3c3944', cloudA: 0.18, envI: 0.2, fogD: 0.00078,
  },
  {
    h: 21.5,
    top: '#030812', horizon: '#111d2e', ground: '#080d14', fog: '#0c1521',
    sun: '#94accc', sunI: 0.34, hemiSky: '#304058', hemiGround: '#171411',
    hemiI: 0.37, ambient: '#2c3c50', ambientI: 0.34, stars: 0.82, night: 1,
    exposure: 1.18, clouds: '#1d2837', cloudA: 0.1, envI: 0.2, fogD: 0.00078,
  },
  {
    h: 24,
    top: '#02060f', horizon: '#0a1626', ground: '#060b13', fog: '#09121f',
    sun: '#9cb7e4', sunI: 0.3, hemiSky: '#2b3c55', hemiGround: '#151310',
    hemiI: 0.36, ambient: '#2b3c53', ambientI: 0.36, stars: 0.8, night: 1,
    exposure: 1.15, clouds: '#1b2636', cloudA: 0.1, envI: 0.18, fogD: 0.0005,
  },
];
for (const k of KEYFRAMES) {
  for (const key of ['top', 'horizon', 'ground', 'fog', 'sun', 'hemiSky', 'hemiGround', 'ambient', 'clouds']) {
    k[key + 'C'] = new THREE.Color(k[key]);
  }
}

const COLOR_KEYS = ['top', 'horizon', 'ground', 'fog', 'sun', 'hemiSky', 'hemiGround', 'ambient', 'clouds'];
const NUM_KEYS = ['sunI', 'hemiI', 'ambientI', 'stars', 'night', 'exposure', 'cloudA', 'envI', 'fogD'];

function samplePalette(hour) {
  let a = KEYFRAMES[0], b = KEYFRAMES[KEYFRAMES.length - 1];
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (h >= KEYFRAMES[i].h && h <= KEYFRAMES[i + 1].h) {
      a = KEYFRAMES[i]; b = KEYFRAMES[i + 1];
      break;
    }
  }
  const t = b === a ? 0 : (h - a.h) / (b.h - a.h);
  const out = { hour: h };
  for (const key of COLOR_KEYS) out[key] = a[key + 'C'].clone().lerp(b[key + 'C'], t);
  for (const key of NUM_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

export function sunDirection(hour) {
  const h = ((hour % 24) + 24) % 24;
  const theta = ((h - 6) / 12) * Math.PI; // 6h east, 12h high-south, 18h west
  return new THREE.Vector3(
    Math.cos(theta) * 0.96,
    Math.sin(theta) * 1.02 + 0.015,
    0.68,
  ).normalize();
}

function moonDirection(hour) {
  const theta = ((hour - 18) / 12) * Math.PI;
  return new THREE.Vector3(
    Math.cos(theta) * 0.55 + 0.16,
    Math.max(0.34, Math.sin(theta) * 0.55 + 0.35),
    0.5,
  ).normalize();
}

/* ------------------------------------------------------------------
   Sky dome
------------------------------------------------------------------- */
function createSkyDome() {
  const uniforms = {
    uTop: { value: new THREE.Color('#3e5d84') },
    uHorizon: { value: new THREE.Color('#eab27d') },
    uGround: { value: new THREE.Color('#624d3a') },
    uSunColor: { value: new THREE.Color('#ffb76f') },
    uSunDir: { value: new THREE.Vector3(0, 0.3, 1) },
    uMoonDir: { value: new THREE.Vector3(0, 0.5, 1) },
    uCloudColor: { value: new THREE.Color('#f7e0c4') },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uSunUp: { value: 1 },
    uCloudAmount: { value: 0.45 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uGround, uSunColor, uSunDir, uMoonDir, uCloudColor;
      uniform float uStars, uTime, uSunUp, uCloudAmount;
      varying vec3 vWorld;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise2(p);
          p = p * 2.03 + vec2(13.1, 7.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float elev = dir.y;
        float g = clamp(elev * 1.35 + 0.06, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(g, 0.43));
        col = mix(mix(uGround, uHorizon, smoothstep(-0.22, 0.02, elev)), col, smoothstep(-0.03, 0.14, elev));

        float sd = max(dot(dir, normalize(uSunDir)), 0.0);
        float sunMask = smoothstep(-0.07, 0.03, uSunDir.y) * uSunUp;
        col += uSunColor * pow(sd, 700.0) * 7.0 * sunMask;
        col += uSunColor * pow(sd, 72.0) * 0.32 * sunMask;
        col += uSunColor * pow(sd, 9.0) * 0.12 * sunMask;
        float band = exp(-pow((elev - 0.015) * 12.0, 2.0));
        col += uSunColor * band * pow(sd, 3.0) * 0.15 * sunMask;

        // A field of stars, only at night and away from the horizon.
        if (uStars > 0.001) {
          vec3 p = dir * 620.0;
          vec3 id = floor(p);
          float n = hash31(id);
          float star = smoothstep(0.9982, 0.9997, n);
          float tw = 0.66 + 0.34 * sin(uTime * 1.7 + n * 91.7);
          vec3 starCol = mix(vec3(0.76, 0.86, 1.0), vec3(1.0, 0.88, 0.7), hash31(id + 3.7));
          col += starCol * star * tw * uStars * (1.5 + 1.5 * smoothstep(0.9997, 1.0, n));
          col += vec3(0.5, 0.62, 0.9) * pow(max(0.0, n - 0.985) * 12.0, 2.0) * 0.05 * uStars;
        }

        // Layered cloud sheets projected onto the sky dome.
        float elevMask = smoothstep(0.02, 0.09, elev) * (1.0 - smoothstep(0.66, 0.92, elev));
        vec2 cp = dir.xz / (max(elev, 0.035) + 0.24) * 1.15;
        cp += vec2(uTime * 0.0045, uTime * 0.0018);
        float warp = fbm(cp * 0.55 + 4.2);
        float cloudNoise = fbm(cp * 1.35 + vec2(warp * 0.9, -warp * 0.6));
        float cloud = smoothstep(0.5, 0.73, cloudNoise) * elevMask * uCloudAmount;
        float wisps = smoothstep(0.63, 0.85, fbm(cp * 2.7 + vec2(7.1, 1.3))) * elevMask * uCloudAmount * 0.3;
        vec3 cloudCol = mix(uCloudColor, vec3(1.0, 0.96, 0.89), 0.35);
        cloudCol = mix(cloudCol, uHorizon * 1.06, 0.22);
        cloudCol += uSunColor * pow(sd, 5.0) * 0.18 * sunMask;
        cloudCol *= 0.86 + 0.3 * cloudNoise;
        col = mix(col, cloudCol, clamp(cloud * 0.72 + wisps * 0.34, 0.0, 0.8));

        // fine airglow near the horizon
        col += uHorizon * 0.05 * exp(-max(elev, 0.0) * 9.0);

        // a touch of saturation and contrast keeps the sky from looking grey
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(lum), col, 1.25) * 1.08;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(6200, 40, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, uniforms };
}

/* ------------------------------------------------------------------
   Water
------------------------------------------------------------------- */
function createWaterMaterial(renderer) {
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 0.3, 1) },
    uSunColor: { value: new THREE.Color('#ffb76f') },
    uTop: { value: new THREE.Color('#3e5d84') },
    uHorizon: { value: new THREE.Color('#eab27d') },
    uFogColor: { value: new THREE.Color('#c6a586') },
    uFogDensity: { value: 0.00018 },
    uNight: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFogDensity, uNight;
      uniform vec3 uSunDir, uSunColor, uTop, uHorizon, uFogColor;
      varying vec3 vWorld;

      void main() {
        vec2 p = vWorld.xz;
        float w1 = sin(p.x * 1.7 + uTime * 0.55) * 0.5 + sin(p.y * 2.3 - uTime * 0.42) * 0.5;
        float w2 = sin(p.x * 4.1 - uTime * 0.8 + p.y * 1.3) * 0.5 + sin(p.y * 5.3 + uTime * 0.7) * 0.5;
        vec3 n = normalize(vec3(w1 * 0.045 + w2 * 0.018, 1.0, w2 * 0.04 - w1 * 0.014));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 refl = reflect(-viewDir, n);
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
        float h = clamp(refl.y, 0.0, 1.0);
        vec3 skyRefl = mix(uHorizon, uTop, pow(h, 0.6));
        vec3 deep = mix(vec3(0.045, 0.085, 0.070), vec3(0.012, 0.030, 0.040), uNight);
        vec3 col = mix(deep, skyRefl, 0.16 + 0.5 * fres);
        float glint = pow(max(dot(refl, normalize(uSunDir)), 0.0), 260.0);
        float broad = pow(max(dot(refl, normalize(uSunDir)), 0.0), 18.0);
        col += uSunColor * (glint * 2.5 + broad * 0.07) * (1.0 - uNight * 0.75);
        float ripple = smoothstep(0.72, 1.0, sin(p.x * 5.1 + uTime * 1.4) * sin(p.y * 6.3 - uTime * 1.1));
        col += uHorizon * ripple * 0.03;
        float dist = length(cameraPosition - vWorld);
        float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return { material, uniforms };
}

/* ------------------------------------------------------------------
   Public environment factory
------------------------------------------------------------------- */
export function createEnvironment(renderer, scene, mats) {
  const { mesh: sky, uniforms: skyU } = createSkyDome();
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffb76f, 2.3);
  sun.castShadow = true;
  const shadowSize = window.innerWidth < 760 ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 80;
  sun.shadow.camera.far = 3400;
  sun.shadow.camera.left = -700;
  sun.shadow.camera.right = 700;
  sun.shadow.camera.top = 900;
  sun.shadow.camera.bottom = -900;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.9;
  sun.shadow.radius = 2.2;
  sun.target.position.set(0, 0, 120);
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x8fa6bf, 0x66513e, 0.5);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xbc9f86, 0.16);
  scene.add(ambient);

  // soft southern fill: a cinematic bounce that keeps the gate facade legible
  const fill = new THREE.DirectionalLight(0xffd7ad, 0.45);
  fill.position.set(30, 240, 760);
  fill.target.position.set(0, 20, -160);
  scene.add(fill);
  scene.add(fill.target);

  scene.fog = new THREE.FogExp2(0xc6a586, 0.00018);

  // moon
  const moonTex = toTexture(renderer, moonTexture(), { repeat: [1, 1] });
  const moonMat = new THREE.SpriteMaterial({
    map: moonTex, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const moon = new THREE.Sprite(moonMat);
  moon.scale.set(300, 300, 1);
  moon.position.set(-1750, 1260, -5200);
  scene.add(moon);

  // drifty cloud sprites
  const cloudTex = toTexture(renderer, cloudTexture(), { repeat: [1, 1] });
  const cloudGroup = new THREE.Group();
  scene.add(cloudGroup);
  const cloudMats = [];
  const clouds = [];
  const cloudRng = (() => {
    let s = 81;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  })();
  for (let i = 0; i < 11; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.25, depthWrite: false,
      color: 0xf2cfab, fog: false,
    });
    const sp = new THREE.Sprite(mat);
    const angle = cloudRng() * Math.PI * 2;
    const r = 1600 + cloudRng() * 1200;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = 520 + cloudRng() * 680;
    sp.position.set(x, y, z);
    const s = 550 + cloudRng() * 750;
    sp.scale.set(s, s * (0.34 + cloudRng() * 0.12), 1);
    cloudGroup.add(sp);
    cloudMats.push(mat);
    clouds.push({ sprite: sp, baseX: x, speed: 0.7 + cloudRng() * 0.8, phase: cloudRng() * 10 });
  }

  // water materials (used by the moat in the landmarks)
  const water = createWaterMaterial(renderer);

  // low mountains on the northern / western horizon
  const mountainGroup = new THREE.Group();
  scene.add(mountainGroup);
  const rng = (() => {
    let s = 12345;
    return () => { s = (s * 48271) % 2147483647; return (s - 1) / 2147483646; };
  })();
  const mountainMat = new THREE.MeshStandardMaterial({
    color: 0x8c9ba0, roughness: 1, flatShading: true, fog: true,
  });
  const mountainMat2 = new THREE.MeshStandardMaterial({
    color: 0xa3afb1, roughness: 1, flatShading: true, fog: true,
  });
  for (let i = 0; i < 27; i++) {
    const angle = Math.PI * (0.62 + rng() * 1.2) + (rng() - 0.5) * 0.08;
    const r = 4300 + rng() * 2400;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const h = 80 + rng() * 240;
    const rad = 380 + rng() * 680;
    const geo = new THREE.ConeGeometry(rad, h, 5 + ((rng() * 3) | 0), 1);
    const m = new THREE.Mesh(geo, rng() > 0.4 ? mountainMat : mountainMat2);
    m.position.set(x, h / 2 - 8, z);
    m.rotation.y = rng() * Math.PI;
    m.scale.x = 1.2 + rng() * 1.3;
    mountainGroup.add(m);
  }

  // distant, hazy urban mass — a silhouette of Beijing around the square.
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  let envTarget = null;
  let envSource = null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  function makeEnvMap(state) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#' + state.top.getHexString());
    g.addColorStop(0.47, '#' + state.horizon.getHexString());
    g.addColorStop(0.52, '#' + state.horizon.getHexString());
    g.addColorStop(0.7, '#' + state.ground.getHexString());
    g.addColorStop(1, '#1a1713');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    const sx = 256 + 120 * Math.cos((state.hour - 6) / 12 * Math.PI);
    const sg = ctx.createRadialGradient(sx, 90, 4, sx, 90, 120);
    sg.addColorStop(0, 'rgba(255,224,170,.9)');
    sg.addColorStop(0.25, 'rgba(255,184,112,.35)');
    sg.addColorStop(1, 'rgba(255,178,110,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 512, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const target = pmrem.fromEquirectangular(tex);
    tex.dispose();
    return target;
  }

  let state = samplePalette(18.1);
  let lastEnvHour = -99;
  let envDirty = true;

  function applyState(s, elapsed) {
    state = s;
    skyU.uTop.value.copy(s.top);
    skyU.uHorizon.value.copy(s.horizon);
    skyU.uGround.value.copy(s.ground);
    skyU.uSunColor.value.copy(s.sun);
    skyU.uStars.value = s.stars;
    skyU.uTime.value = elapsed || 0;
    skyU.uCloudColor.value.copy(s.clouds);
    skyU.uCloudAmount.value = Math.min(0.6, s.cloudA * 0.9);
    const sDir = sunDirection(s.hour);
    skyU.uSunDir.value.copy(sDir);
    const mDir = moonDirection(s.hour);
    skyU.uMoonDir.value.copy(mDir);
    skyU.uSunUp.value = sDir.y > 0.01 ? 1 : 0;

    const lightDir = sDir.y > 0.035 ? sDir : mDir;
    sun.position.copy(lightDir).multiplyScalar(1400);
    sun.position.y = Math.max(sun.position.y, 120);
    sun.color.copy(s.sun);
    sun.intensity = s.sunI;
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = s.hemiI;
    ambient.color.copy(s.ambient);
    ambient.intensity = s.ambientI;
    fill.color.copy(s.horizon).lerp(new THREE.Color('#ffe4bf'), 0.5);
    fill.intensity = (1 - s.night) * 0.42 + s.night * 0.03;
    scene.fog.color.copy(s.fog);
    scene.fog.density = s.fogD;
    renderer.toneMappingExposure = s.exposure;
    scene.environmentIntensity = s.envI;

    // cloud colours
    for (const m of cloudMats) {
      m.color.copy(s.clouds);
      m.opacity = s.cloudA;
    }

    // moon
    moonMat.opacity = Math.max(0, s.night * 0.92 - 0.08);
    moonMat.color.copy(s.horizon).lerp(new THREE.Color('#dfe8f2'), 0.7);

    // water
    water.uniforms.uSunDir.value.copy(lightDir);
    water.uniforms.uSunColor.value.copy(s.sun);
    water.uniforms.uTop.value.copy(s.top);
    water.uniforms.uHorizon.value.copy(s.horizon);
    water.uniforms.uFogColor.value.copy(s.fog);
    water.uniforms.uFogDensity.value = s.fogD;
    water.uniforms.uNight.value = s.night;

    // Refresh the (cheap, low-res) environment reflection only when the
    // lighting has actually changed; this is not a per-frame operation.
    if (!envTarget || Math.abs(s.hour - lastEnvHour) > 0.35 || envDirty) {
      const target = makeEnvMap(s);
      scene.environment = target.texture;
      if (envTarget) envTarget.dispose();
      envTarget = target;
      lastEnvHour = s.hour;
      envDirty = false;
    }
    envSource = state;
  }

  applyState(state, 0);

  const api = {
    sky, sun, hemi, ambient, fill, moon, cloudGroup, clouds, mountainGroup, envGroup,
    waterMaterial: water.material,
    waterUniforms: water.uniforms,
    get state() { return state; },
    setState(s, elapsed = 0) { applyState(s, elapsed); },
    samplePalette,
    sunDirection,
    moonDirection,
    update(dt, elapsed) {
      skyU.uTime.value = elapsed;
      water.uniforms.uTime.value = elapsed;
      for (const c of clouds) {
        c.sprite.position.x = c.baseX + Math.sin(elapsed * 0.006 + c.phase) * 80 + elapsed * c.speed * 0.18;
      }
    },
  };
  return api;
}


