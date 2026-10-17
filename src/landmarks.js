import * as THREE from 'three';
import {
  textTexture, glowTexture, makeCanvas, rng, toTexture,
} from './materials.js';
import {
  addBox, addCylinder, addSphere, addPlane, signPlane,
  createRoof, createSkirtRoof, createBalustrade, createStairs,
  addInstancedColumns, addBracketBand, createLantern, createTreeGeometrySet,
  V3,
} from './geometry.js';

const TAU = Math.PI * 2;

/* ==================================================================
   Shared helpers
=================================================================== */

export function makeGlow(ctx) {
  if (!ctx.glowTex) {
    ctx.glowTex = toTexture(ctx.renderer, glowTexture(), { repeat: [1, 1] });
  }
  return ctx.glowTex;
}

export function collectGlow(ctx, sprite, baseOpacity = 0.75) {
  sprite.material.opacity = 0;
  ctx.night.glows.push({ sprite, base: baseOpacity });
}

export function collectEmissive(ctx, material, dayValue, nightValue) {
  material.emissiveIntensity = dayValue;
  ctx.night.emissive.push({ material, day: dayValue, night: nightValue });
  return material;
}

function clonedMapMat(base, tex, repeat) {
  const m = base.clone();
  if (tex) {
    m.map = tex.clone();
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    m.map.repeat.set(repeat[0], repeat[1]);
    m.map.needsUpdate = true;
    if (base.emissiveMap) {
      m.emissiveMap = base.emissiveMap.clone();
      m.emissiveMap.wrapS = m.emissiveMap.wrapT = THREE.RepeatWrapping;
      m.emissiveMap.repeat.set(repeat[0], repeat[1]);
      m.emissiveMap.needsUpdate = true;
    }
  }
  return m;
}

function plaqueTexture(text, {
  width = 1024, height = 256, bg = '#26100b', border = '#c7a253',
  color = '#e9cc83', font = '700 132px "STKaiti","KaiTi","STSong","SimSun",serif',
} = {}) {
  const { c, ctx } = makeCanvas(width, height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(4, width * 0.008);
  ctx.strokeRect(ctx.lineWidth * 2, ctx.lineWidth * 2, width - ctx.lineWidth * 4, height - ctx.lineWidth * 4);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, width / 2, height / 2 + height * 0.03, width * 0.87);
  return c;
}

function sloganTexture(text) {
  const { c, ctx } = makeCanvas(2048, 260);
  ctx.clearRect(0, 0, 2048, 260);
  ctx.font = '700 136px "STKaiti","KaiTi","FangSong","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f3e3bd';
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 5;
  ctx.fillText(text, 1024, 140, 1880);
  return c;
}

function archShape(aw, ah, yBase = 0.02) {
  const r = aw / 2;
  const spring = Math.max(r + 0.05, ah - r);
  const s = new THREE.Shape();
  s.moveTo(-r, yBase);
  s.lineTo(-r, spring);
  s.absarc(0, spring, r, Math.PI, 0, true);
  s.lineTo(r, yBase);
  s.closePath();
  return s;
}

function archedWall({ width, height, depth, arches, material, shapeOnly = false }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  for (const a of arches) {
    if (a.x + a.w / 2 > width / 2 - 1 || a.h > height - 1) continue;
    const hole = new THREE.Path();
    const r = a.w / 2;
    const spring = Math.max(r + 0.05, a.h - r);
    hole.moveTo(a.x - r, 0.02);
    hole.lineTo(a.x - r, spring);
    hole.absarc(a.x, spring, r, Math.PI, 0, true);
    hole.lineTo(a.x + r, 0.02);
    hole.closePath();
    shape.holes.push(hole);
  }
  if (shapeOnly) return shape;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: false, curveSegments: 20,
  });
  geo.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function archRing(aw, ah, band, material, depth = 0.5) {
  const rO = aw / 2 + band;
  const hO = ah + band;
  const springO = Math.max(rO + 0.05, hO - rO);
  const rI = aw / 2;
  const springI = Math.max(rI + 0.05, ah - rI);
  const s = new THREE.Shape();
  s.moveTo(-rO, 0);
  s.lineTo(-rO, springO);
  s.absarc(0, springO, rO, Math.PI, 0, true);
  s.lineTo(rO, 0);
  s.lineTo(rI, 0);
  s.lineTo(rI, springI);
  s.absarc(0, springI, rI, 0, Math.PI, false);
  s.lineTo(-rI, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, steps: 1, bevelEnabled: false, curveSegments: 24 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addArchTrim(parent, arches, zFront, mats) {
  for (const a of arches) {
    const ring = archRing(a.w, a.h, 0.55, mats.marble, 0.5);
    ring.position.set(a.x, 0, zFront);
    parent.add(ring);
    addBox(parent, a.w * 0.28, 0.55, 0.65, mats.marbleShade, a.x, a.h + 0.45, zFront + 0.25);
    // threshold slab
    addBox(parent, a.w + 1.4, 0.26, 1.7, mats.marbleShade, a.x, 0.13, zFront + 0.5);
  }
}

function addDoorPlane(parent, a, z, material) {
  const shape = archShape(a.w - 0.12, a.h - 0.12, 0.05);
  const geo = new THREE.ShapeGeometry(shape, 20);
  const m = material.clone();
  m.side = THREE.DoubleSide;
  const door = new THREE.Mesh(geo, m);
  door.position.set(a.x, 0, z);
  door.receiveShadow = true;
  parent.add(door);
}

/* ==================================================================
   Tiananmen gate and its forecourt
=================================================================== */

export function createTiananmen(ctx) {
  const { scene, mats } = ctx;
  const group = new THREE.Group();
  group.name = 'Tiananmen';
  group.position.set(0, 0, -265);
  scene.add(group);

  const wallW = 84, wallD = 44, plinthH = 2.4, wallH = 17.5;
  const wallTop = plinthH + wallH;
  const arches = [
    { x: 0, w: 12, h: 14.1 },
    { x: -16.2, w: 9.2, h: 12.1 },
    { x: 16.2, w: 9.2, h: 12.1 },
    { x: -31.3, w: 7.4, h: 10.2 },
    { x: 31.3, w: 7.4, h: 10.2 },
  ];

  // stone plinth
  addBox(group, 96, plinthH, 56, mats.marbleShade, 0, plinthH / 2, 0);
  addBox(group, 92, 0.34, 52, mats.marble, 0, plinthH + 0.15, 0);
  // plinth edge at the forecourt; the five arched bridges meet it directly
  for (const s of [-1, 1]) {
    addBox(group, 4.2, plinthH + 0.1, 56, mats.marble, s * 48, (plinthH + 0.1) / 2, 0);
  }

  // the red gate wall with five real arch openings
  const wall = archedWall({
    width: wallW, height: wallH, depth: wallD, arches, material: mats.redWall,
  });
  wall.position.y = plinthH;
  group.add(wall);
  const solidShape = new THREE.Shape();
  solidShape.moveTo(-wallW / 2 + 2, 0);
  solidShape.lineTo(wallW / 2 - 2, 0);
  solidShape.lineTo(wallW / 2 - 2, wallH - 2);
  solidShape.lineTo(-wallW / 2 + 2, wallH - 2);
  solidShape.closePath();
  for (const a of arches) addDoorPlane(group, a, wallD / 2 - 0.85, mats.wood);
  addArchTrim(group, arches, wallD / 2 + 0.02, mats);

  // a few monumental string courses
  addBox(group, wallW + 0.4, 0.45, wallD + 0.4, mats.marbleShade, 0, plinthH + wallH - 0.2, 0);
  addBox(group, wallW + 0.2, 0.35, wallD + 0.2, mats.marble, 0, plinthH + 2.5, 0);
  // pilasters at the corners of the gate wall
  for (const sx of [-1, 1]) {
    addBox(group, 1.1, wallH, 1.1, mats.marbleShade, sx * (wallW / 2 - 1.2), plinthH + wallH / 2, wallD / 2 + 0.1);
    addBox(group, 1.1, wallH, 1.1, mats.marbleShade, sx * (wallW / 2 - 1.2), plinthH + wallH / 2, -wallD / 2 - 0.1);
  }

  // national slogans, flanking the centre of the wall
  const sloganMat1 = new THREE.MeshBasicMaterial({
    map: toTexture(ctx.renderer, sloganTexture('中华人民共和国万岁'), { repeat: [1, 1] }),
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const sloganMat2 = new THREE.MeshBasicMaterial({
    map: toTexture(ctx.renderer, sloganTexture('世界人民大团结万岁'), { repeat: [1, 1] }),
    transparent: true, depthWrite: false, toneMapped: false,
  });
  for (const [x, mat] of [[-22, sloganMat1], [22, sloganMat2]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(31, 3.1), mat);
    p.position.set(x, plinthH + 15.7, wallD / 2 + 0.16);
    p.renderOrder = 2;
    group.add(p);
  }

  // balustrade on the wall top
  const topRail = createBalustrade({
    width: wallW + 0.6, depth: wallD + 0.6, material: mats.marble,
    height: 1.02, spacing: 3.4, y: wallTop,
  });
  group.add(topRail);

  /* ---- the double-eaved gate tower ---- */
  const floorY = wallTop + 1.45;
  addBox(group, 72, 1.3, 36, mats.marble, 0, wallTop + 0.65, 0);
  addBox(group, 69, 0.35, 33, mats.marbleShade, 0, wallTop + 1.35, 0);
  const balconyRail = createBalustrade({
    width: 72, depth: 36, material: mats.marble,
    height: 0.82, spacing: 3.8, y: floorY + 0.02,
  });
  group.add(balconyRail);

  const towerW = 64, towerD = 25;
  addBox(group, 58, 9.0, 18, mats.redWallDark, 0, floorY + 4.5, 0);
  // rear and side walls / shadowed interior
  addBox(group, 58.4, 7.6, 18.4, mats.redWall, 0, floorY + 3.8, 0);

  // lattice door-screen along the whole south facade
  const latticeMat = clonedMapMat(mats.lattice, mats._textures.lattice, [9, 1]);
  collectEmissive(ctx, latticeMat, 0.05, 1.25);
  const latticePlane = new THREE.Mesh(new THREE.PlaneGeometry(56, 7.3), latticeMat);
  latticePlane.position.set(0, floorY + 3.75, 9.12);
  latticePlane.receiveShadow = true;
  group.add(latticePlane);
  // same screen on the north side (visible through the gate axis)
  const backLatticeMat = clonedMapMat(mats.lattice, mats._textures.lattice, [9, 1]);
  collectEmissive(ctx, backLatticeMat, 0.03, 0.8);
  const backLattice = new THREE.Mesh(new THREE.PlaneGeometry(56, 7.3), backLatticeMat);
  backLattice.position.set(0, floorY + 3.75, -9.12);
  backLattice.rotation.y = Math.PI;
  group.add(backLattice);

  // gold transom and threshold
  addBox(group, 58, 0.28, 0.34, mats.gold, 0, floorY + 7.55, 9.25);
  addBox(group, 58, 0.26, 0.34, mats.gold, 0, floorY + 0.15, 9.25);

  const colPositions = [];
  for (let i = 0; i < 10; i++) {
    const x = -31.5 + (63 * i) / 9;
    colPositions.push({ x, z: 11.4 });
    colPositions.push({ x, z: -11.4 });
  }
  for (let i = 1; i < 4; i++) {
    const z = -8 + (16 * i) / 4;
    colPositions.push({ x: 31.4, z });
    colPositions.push({ x: -31.4, z });
  }
  const columnsGroup = new THREE.Group();
  columnsGroup.position.y = floorY;
  addInstancedColumns(columnsGroup, colPositions, {
    radius: 0.46, height: 8.9, material: mats.columnRed,
    baseMaterial: mats.marble, capMaterial: mats.gold, segments: 12,
  });
  group.add(columnsGroup);

  addBracketBand(group, {
    width: 64, depth: 25, y: floorY + 9.25, material: mats.gold, spacing: 2.1,
  });
  addBox(group, 66, 0.8, 27, mats.frieze, 0, floorY + 8.95, 0);

  // lanterns hanging from the front eave
  const lanternBody = collectEmissive(ctx, mats.lantern.clone(), 0.35, 1.7);
  for (const x of [-28, -13, 13, 28]) {
    const lan = createLantern({
      scale: 1.28, material: lanternBody, capMaterial: mats.gold,
      glowTexture: makeGlow(ctx),
    });
    lan.position.set(x, floorY + 7.95, 13.9);
    group.add(lan);
    if (lan.userData.glow) collectGlow(ctx, lan.userData.glow, 0.6);
    addCylinder(group, 0.035, 0.035, 1.2, mats.gold, x, floorY + 8.8, 13.9, { cast: false });
  }

  // lower eave (skirt roof)
  const lowerRoof = createSkirtRoof({
    width: 71, depth: 30, innerWidth: 58, innerDepth: 19, height: 3.3, lift: 1.55,
    material: mats.goldRoof, ridgeMaterial: mats.ridge, fasciaMaterial: mats.ridge,
  });
  lowerRoof.position.y = floorY + 9.4;
  group.add(lowerRoof);

  // clerestory band inside the double roof
  const clerY = floorY + 9.4 + 3.0;
  addBox(group, 55, 3.1, 17, mats.redWall, 0, clerY + 1.55, 0);
  const clereLattice = clonedMapMat(mats.lattice, mats._textures.lattice, [8, 0.45]);
  collectEmissive(ctx, clereLattice, 0.04, 1.0);
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(48, 2.1), clereLattice);
    p.position.set(0, clerY + 1.7, side * 8.54);
    if (side < 0) p.rotation.y = Math.PI;
    group.add(p);
  }
  addBox(group, 57, 0.45, 19, mats.gold, 0, clerY + 3.15, 0);

  // upper roof
  const upperRoof = createRoof({
    width: 68, depth: 28, height: 7.4, lift: 2.05, ridgeRatio: 0.56,
    material: mats.goldRoofDeep, ridgeMaterial: mats.ridge,
    beasts: true, details: true,
  });
  upperRoof.position.y = floorY + 15.35;
  group.add(upperRoof);

  // plaque beneath the upper eave
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(12.6, 2.8),
    new THREE.MeshBasicMaterial({
      map: toTexture(ctx.renderer, plaqueTexture('天安门'), { repeat: [1, 1] }),
      toneMapped: false,
    }),
  );
  plaque.position.set(0, floorY + 13.55, 8.9);
  group.add(plaque);

  // side approach stairs into the tower (largely hidden, adds silhouette)
  for (const s of [-1, 1]) {
    addBox(group, 9, 1.1, 25, mats.marbleShade, s * 38.4, floorY + 0.5, 0);
  }

  // Imperial side walls stretching east and west from the gate.
  addGateSideWalls(group, ctx);

  /* ---- moat, bridges, huabiao and lions live in the forecourt group ---- */
  createForecourt(ctx);
  return group;
}

function addGateSideWalls(parent, ctx) {
  const { mats } = ctx;
  for (const s of [-1, 1]) {
    const wall = new THREE.Group();
    wall.position.set(s * 103, 0, 0);
    addBox(wall, 122, 9.2, 3.4, mats.redWall, 0, 4.6, 0);
    addBox(wall, 122.6, 0.5, 4.1, mats.marbleShade, 0, 0.26, 0);
    addBox(wall, 123, 0.55, 4.8, mats.ridge, 0, 9.35, 0);
    const capShape = new THREE.Shape();
    capShape.moveTo(-2.7, 0);
    capShape.lineTo(0, 0.95);
    capShape.lineTo(2.7, 0);
    capShape.closePath();
    const capGeo = new THREE.ExtrudeGeometry(capShape, { depth: 123, bevelEnabled: false });
    capGeo.rotateY(Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, mats.goldRoof);
    cap.position.set(-61.4, 9.6, 0);
    cap.castShadow = true;
    wall.add(cap);
    for (let i = -2; i <= 2; i++) {
      addBox(wall, 1.2, 9.1, 4.1, mats.redWallDark, i * 23, 4.55, 0.4);
    }
    parent.add(wall);
  }
}

function createHuabiao(ctx, x, z) {
  const { mats } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addBox(g, 6.4, 0.45, 6.4, mats.marbleShade, 0, 0.22, 0);
  addBox(g, 4.9, 1.1, 4.9, mats.marble, 0, 0.98, 0);
  addBox(g, 4.1, 0.35, 4.1, mats.marbleShade, 0, 1.7, 0);
  addCylinder(g, 0.7, 0.92, 10.2, mats.marble, 0, 7.05, 0, { segments: 12 });
  for (let i = 0; i < 4; i++) {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.91 - i * 0.04, 0.09, 5, 16), mats.marbleShade);
    torus.rotation.x = Math.PI / 2;
    torus.position.y = 2.6 + i * 2.2;
    torus.castShadow = true;
    g.add(torus);
  }
  // a stylised dragon coiling around the column
  const pts = [];
  for (let i = 0; i < 50; i++) {
    const t = i / 49;
    const a = t * Math.PI * 3.6;
    pts.push(V3(Math.cos(a) * (0.86 - t * 0.09), 2.6 + t * 7.4, Math.sin(a) * (0.86 - t * 0.09)));
  }
  const spiral = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.115, 4, false),
    mats.marbleShade,
  );
  spiral.castShadow = true;
  g.add(spiral);
  const dragonHead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), mats.marbleShade);
  dragonHead.position.set(0.5, 10.1, 0.7);
  g.add(dragonHead);

  // cloud plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.24, 1.15), mats.marble);
  plate.position.y = 12.2;
  plate.castShadow = true;
  g.add(plate);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.8), mats.marble);
    wing.position.set(s * 1.9, 12.48, 0);
    wing.rotation.z = s * 0.22;
    wing.castShadow = true;
    g.add(wing);
  }
  addCylinder(g, 0.72, 0.5, 0.4, mats.marbleShade, 0, 12.55, 0, { segments: 12 });
  // crouching mythical beast
  const beast = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mats.marbleShade);
  body.scale.set(1.55, 0.95, 0.9);
  body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 7, 5), mats.marbleShade);
  head.position.set(0.36, 0.85, 0);
  beast.add(body, head);
  beast.position.y = 12.8;
  beast.castShadow = true;
  g.add(beast);
  // small stone railing around the pedestal
  return g;
}

function createStoneLion(ctx, x, z, mirrored = false) {
  const { mats } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addBox(g, 3.4, 2.4, 4.2, mats.marbleShade, 0, 1.2, 0);
  addBox(g, 2.9, 1.75, 3.6, mats.marble, 0, 3.25, 0);
  const lion = new THREE.Group();
  lion.position.y = 4.15;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mats.stone);
  body.scale.set(0.95, 1.0, 1.35);
  body.position.set(0, 0.85, -0.1);
  lion.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.7, 9, 7), mats.stone);
  chest.scale.set(1, 0.9, 0.85);
  chest.position.set(0, 0.72, 0.55);
  lion.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 10, 8), mats.stone);
  head.scale.set(0.88, 0.95, 0.82);
  head.position.set(0, 1.65, 0.74);
  lion.add(head);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI + Math.PI;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mats.stoneDark);
    m.position.set(Math.sin(a) * 0.52, 1.72 + Math.cos(a * 1.7) * 0.23, 0.78 - Math.cos(a) * 0.12);
    lion.add(m);
  }
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 7), mats.stone);
    leg.position.set(s * 0.42, 0.15, 1.0);
    lion.add(leg);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.8), mats.stoneDark);
    paw.position.set(s * 0.42, -0.38, 1.14);
    lion.add(paw);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 5), mats.stoneDark);
    eye.position.set(s * 0.22, 1.78, 1.25);
    lion.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 5, 10, Math.PI * 1.2), mats.stone);
  tail.rotation.set(0.4, 0.4, 0.8);
  tail.position.set(0.5, 0.92, -0.95);
  lion.add(tail);
  g.add(lion);
  g.scale.x = mirrored ? -1 : 1;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function createBridge(ctx, x, width, z) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const length = 32;
  const segments = 12;
  const base = 1.0;
  const rise = 1.05;
  const half = length / 2;
  for (let i = 0; i < segments; i++) {
    const zz = -half + (i + 0.5) * (length / segments);
    const t = zz / half;
    const yy = base + rise * (1 - t * t);
    const slope = -2 * rise * zz / (half * half);
    const rx = Math.atan(slope);
    addBox(g, width, 0.42, length / segments + 0.07, mats.marble, 0, yy, zz, { rx });
    for (const s of [-1, 1]) {
      const px = s * (width / 2 - 0.1);
      addBox(g, 0.3, 0.88, length / segments + 0.08, mats.marbleShade, px, yy + 0.44, zz, { rx });
      addBox(g, 0.45, 0.14, length / segments + 0.08, mats.marble, px, yy + 0.92, zz, { rx });
    }
  }
  // approach ramps at both ends, tying the arched deck into the banks
  for (const s of [-1, 1]) {
    const rampLen = 6.2;
    const drop = base - 0.08;
    const ang = Math.atan2(drop, rampLen);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.34, rampLen),
      mats.marbleShade,
    );
    ramp.position.set(0, (base + 0.08) / 2 - 0.16, s * (half + rampLen / 2));
    ramp.rotation.x = s * ang;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    g.add(ramp);
  }
  // end posts and a pair of small marble lanterns at the approach
  for (const s of [-1, 1]) {
    for (const side of [-1, 1]) {
      addBox(g, 0.5, 1.3, 0.5, mats.marble, side * (width / 2 - 0.1), base + 0.1, s * half, { cast: false });
      addSphere(g, 0.22, mats.gold, side * (width / 2 - 0.1), base + 0.85, s * half, [1, 1, 1], 8);
    }
  }
  g.position.set(x, 0, z);
  return g;
}

function createForecourt(ctx) {
  const { scene, mats, env } = ctx;
  const g = new THREE.Group();
  g.name = 'Jinshui Forecourt';
  scene.add(g);

  const moatZ = -216;
  const moatW = 600;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(moatW, 20), env.waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.42, moatZ);
  g.add(water);
  for (const s of [-1, 1]) {
    addBox(g, moatW, 1.05, 1.4, mats.marbleShade, 0, 0.52, moatZ + s * 10.6);
    addBox(g, moatW, 0.22, 2.0, mats.marble, 0, 1.04, moatZ + s * 10.6);
  }
  addBox(g, moatW, 0.1, 20, mats.stoneDark, 0, 0.1, moatZ);

  const bridgeConfig = [
    [0, 12.5], [-17.5, 8.3], [17.5, 8.3], [-34.6, 7.0], [34.6, 7.0],
  ];
  for (const [x, w] of bridgeConfig) g.add(createBridge(ctx, x, w, moatZ));

  // paved forecourt between moat and Chang'an Avenue
  const foreMat = clonedMapMat(mats.paving, mats._textures.paving, [20, 3]);
  const fore = new THREE.Mesh(new THREE.PlaneGeometry(600, 42), foreMat);
  fore.rotation.x = -Math.PI / 2;
  fore.position.set(0, 0.06, moatZ + 28);
  fore.receiveShadow = true;
  g.add(fore);

  g.add(createHuabiao(ctx, -55, -193));
  g.add(createHuabiao(ctx, 55, -193));
  g.add(createStoneLion(ctx, -42, -192, false));
  g.add(createStoneLion(ctx, 42, -192, true));

  // a couple of ceremonial red lantern posts near the bridgeheads
  const bodyMat = collectEmissive(ctx, mats.lantern.clone(), 0.25, 1.4);
  for (const s of [-1, 1]) {
    const pole = new THREE.Group();
    pole.position.set(s * 68, 0, -196);
    addCylinder(pole, 0.13, 0.18, 6.2, mats.wood, 0, 3.1, 0);
    addBox(pole, 2.4, 0.16, 0.16, mats.wood, 0, 6.1, 0);
    for (const k of [-1, 1]) {
      const lan = createLantern({
        scale: 0.9, material: bodyMat, capMaterial: mats.gold, glowTexture: makeGlow(ctx),
      });
      lan.position.set(k * 1.0, 5.0, 0);
      pole.add(lan);
      if (lan.userData.glow) collectGlow(ctx, lan.userData.glow, 0.45);
    }
    g.add(pole);
  }
}

/* ==================================================================
   The square, its roads and the flag
=================================================================== */

export function createSquare(ctx) {
  const { scene, mats } = ctx;
  const g = new THREE.Group();
  g.name = 'Tiananmen Square';
  scene.add(g);

  // the great paved field
  const pavingMat = clonedMapMat(mats.paving, mats._textures.paving, [46, 66]);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(520, 772), pavingMat);
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, 0.04, 255);
  field.receiveShadow = true;
  g.add(field);

  // lighter ceremonial axis
  const axisMat = clonedMapMat(mats.pavingAxis, mats._textures.paving, [4, 50]);
  const axis = new THREE.Mesh(new THREE.PlaneGeometry(23, 900), axisMat);
  axis.rotation.x = -Math.PI / 2;
  axis.position.set(0, 0.06, 230);
  axis.receiveShadow = true;
  g.add(axis);
  for (const s of [-1, 1]) {
    addBox(g, 0.38, 0.02, 895, mats.stoneDark, s * 11.7, 0.075, 230, { cast: false });
    addBox(g, 0.16, 0.02, 895, mats.marble, s * 12.1, 0.08, 230, { cast: false });
  }
  // subtle drainage joints
  for (let z = -60; z <= 620; z += 76) {
    addBox(g, 518, 0.012, 0.18, mats.stoneDark, 0, 0.07, z, { cast: false, receive: false });
  }
  // perimeter curbs and stone edge
  for (const s of [-1, 1]) {
    addBox(g, 3.2, 0.28, 772, mats.curb, s * 261.5, 0.14, 255);
    addBox(g, 3.2, 0.18, 772, mats.stoneDark, s * 262.3, 0.09, 255);
  }
  addBox(g, 526, 0.28, 3.2, mats.curb, 0, 0.14, -132);
  addBox(g, 526, 0.28, 3.2, mats.curb, 0, 0.14, 642);

  // north forecourt paving to Chang'an
  const fore = new THREE.Mesh(
    new THREE.PlaneGeometry(680, 30),
    clonedMapMat(mats.paving, mats._textures.paving, [30, 2]),
  );
  fore.rotation.x = -Math.PI / 2;
  fore.position.set(0, 0.03, -132);
  fore.receiveShadow = true;
  g.add(fore);

  createRoads(ctx, g);
  createFlag(ctx, g);
  createFormalGardens(ctx, g);
  createNorthForecourtDetails(ctx, g);

  return g;
}

function createRoads(ctx, g) {
  const { mats } = ctx;
  const asphalt = clonedMapMat(mats.asphalt, mats._textures.asphalt, [115, 2]);
  const changan = new THREE.Mesh(new THREE.PlaneGeometry(4100, 58), asphalt);
  changan.rotation.x = -Math.PI / 2;
  changan.position.set(0, 0.02, -170);
  changan.receiveShadow = true;
  g.add(changan);

  // sidewalks
  for (const s of [-1, 1]) {
    addBox(g, 4100, 0.18, 5.8, mats.curb, 0, 0.09, -170 + s * 32.2, { cast: false });
    addBox(g, 4100, 0.1, 2.2, mats.stoneDark, 0, 0.05, -170 + s * 35.8, { cast: false });
  }

  // east and west perimeter roads
  const sideAsphalt = clonedMapMat(mats.asphalt, mats._textures.asphalt, [2, 48]);
  for (const s of [-1, 1]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(26, 880), sideAsphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(s * 286, 0.02, 250);
    road.receiveShadow = true;
    g.add(road);
    addBox(g, 5.5, 0.18, 880, mats.curb, s * 269, 0.09, 250, { cast: false });
    addBox(g, 5.5, 0.18, 880, mats.curb, s * 303, 0.09, 250, { cast: false });
  }
  // south road around Qianmen
  const southRoadMat = clonedMapMat(mats.asphalt, mats._textures.asphalt, [48, 2]);
  for (const z of [664, 936]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(3000, 34), southRoadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, z);
    road.receiveShadow = true;
    g.add(road);
  }

  // lane markings — all dashes live in a single instanced mesh
  const dashGeo = new THREE.BoxGeometry(5.2, 0.025, 0.18);
  const dashCount = 420;
  const dashes = new THREE.InstancedMesh(dashGeo, mats.roadLine, dashCount);
  const dummy = new THREE.Object3D();
  let idx = 0;
  const lanes = [-190.5, -181.5, -158.5, -149.5];
  for (const z of lanes) {
    for (let x = -2200; x <= 2200 && idx < dashCount; x += 27) {
      dummy.position.set(x, 0.06, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dashes.setMatrixAt(idx++, dummy.matrix);
    }
  }
  dashes.count = idx;
  dashes.castShadow = false;
  dashes.receiveShadow = false;
  dashes.instanceMatrix.needsUpdate = true;
  g.add(dashes);
  // double yellow centre line
  for (const z of [-171.4, -168.9]) {
    addBox(g, 4100, 0.03, 0.16, mats.roadYellow, 0, 0.06, z, { cast: false, receive: false });
  }
  // vertical road dashes
  for (const s of [-1, 1]) {
    for (let z = -90; z < 640; z += 25) {
      addBox(g, 0.15, 0.03, 4.4, mats.roadLine, s * 286, 0.06, z, { cast: false, receive: false });
    }
  }
  // crosswalk stripes at the south and east edges
  for (const x of [-236, 236]) {
    for (let z = 646; z <= 674; z += 3.4) {
      addBox(g, 11, 0.03, 1.7, mats.roadLine, x, 0.06, z, { cast: false, receive: false });
    }
  }
}

function createFlag(ctx, parent) {
  const { mats } = ctx;
  const g = new THREE.Group();
  g.position.set(0, 0, -104);
  parent.add(g);

  // three-tier marble flag platform
  addCylinder(g, 11.2, 12.2, 0.35, mats.marbleShade, 0, 0.17, 0, { segments: 48 });
  addCylinder(g, 8.2, 9.2, 0.48, mats.marble, 0, 0.58, 0, { segments: 48 });
  addCylinder(g, 5.6, 6.4, 0.34, mats.marbleShade, 0, 1.0, 0, { segments: 48 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.9, 0.075, 5, 48), mats.gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.84;
  g.add(ring);

  // white flagpole
  addCylinder(g, 0.14, 0.24, 32.6, mats.whitePaint, 0, 17.28, 0, { segments: 16 });
  addCylinder(g, 0.37, 0.43, 0.3, mats.gold, 0, 33.4, 0);
  addSphere(g, 0.4, mats.gold, 0, 33.7, 0, [1, 1.2, 1]);

  // tiny guard of honour
  for (const s of [-1, 1]) {
    const guard = new THREE.Group();
    guard.position.set(s * 6.8, 0, 5.4);
    guard.rotation.y = s * 0.2;
    const uniform = new THREE.MeshStandardMaterial({ color: 0x354b38, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.78, 3, 6), uniform);
    body.position.y = 1.03;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc9a384, roughness: 0.8 }));
    head.position.y = 1.68;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.12, 8), uniform);
    cap.position.y = 1.83;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.32), mats.whitePaint);
    belt.position.y = 1.08;
    for (const m of [body, head, cap, belt]) { m.castShadow = true; guard.add(m); }
    g.add(guard);
  }

  // ceremonial bollards
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const x = Math.cos(a) * 7.7;
    const z = Math.sin(a) * 7.7;
    addCylinder(g, 0.12, 0.16, 0.8, mats.marble, x, 1.2, z, { segments: 8, cast: false });
    addSphere(g, 0.16, mats.gold, x, 1.64, z, [1, 1, 1], 8);
  }

  // the flag itself — geometry is deformed in the animation loop
  const W = 18, H = 12;
  const geo = new THREE.PlaneGeometry(W, H, 36, 22);
  geo.translate(W / 2, -H / 2, 0);
  const mesh = new THREE.Mesh(geo, mats.flag);
  mesh.position.set(0.18, 32.0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  const flagGroup = new THREE.Group();
  flagGroup.position.set(0, 0, 0);
  flagGroup.rotation.y = -0.18;
  flagGroup.add(mesh);
  g.add(flagGroup);
  const base = new Float32Array(geo.attributes.position.array);
  ctx.flag = { mesh, geo, base, width: W, height: H, t: 0 };
  ctx.updaters.push((dt) => {
    const t = (ctx.flag.t += dt);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const k = x / W;
      const amp = 0.12 + 1.35 * k;
      const z = Math.sin(x * 0.36 - t * 2.25 + (y + H) * 0.15) * amp
        + Math.sin(x * 0.7 + t * 1.25 + y * 0.2) * 0.35 * k;
      const sag = Math.cos(x * 0.3 - t * 1.8) * 0.1 * k;
      pos.setXYZ(i, x, y + sag, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });

  // warm floodlight for the flag after dark
  const flagLight = new THREE.PointLight(0xffd8a8, 0, 140, 2);
  flagLight.position.set(10, 23, 16);
  g.add(flagLight);
  ctx.night.lights.push({ light: flagLight, night: 380 });
  return g;
}

function createFormalGardens(ctx, parent) {
  const { mats } = ctx;
  // clipped lawns and flower parterres flanking the monument approach
  const gardens = [
    [-92, 245, 76, 19], [92, 245, 76, 19],
    [-120, 92, 44, 18], [120, 92, 44, 18],
    [-100, 488, 68, 17], [100, 488, 68, 17],
  ];
  for (const [x, z, w, d] of gardens) {
    addBox(parent, w + 2.4, 0.38, d + 2.4, mats.marbleShade, x, 0.19, z, { cast: false });
    addBox(parent, w, 0.36, d, mats.grass, x, 0.38, z, { cast: false });
    // low hedge frame
    addBox(parent, w, 0.7, 0.8, mats.hedge, x, 0.78, z + d / 2 - 0.4);
    addBox(parent, w, 0.7, 0.8, mats.hedge, x, 0.78, z - d / 2 + 0.4);
    addBox(parent, 0.8, 0.7, d, mats.hedge, x + w / 2 - 0.4, 0.78, z);
    addBox(parent, 0.8, 0.7, d, mats.hedge, x - w / 2 + 0.4, 0.78, z);
    // flowers
    const flowerGeo = new THREE.IcosahedronGeometry(0.25, 0);
    const count = Math.floor(w * d / 8);
    const inst = new THREE.InstancedMesh(flowerGeo, mats.flowerRed, count);
    const inst2 = new THREE.InstancedMesh(flowerGeo, mats.flowerGold, count);
    const dummy = new THREE.Object3D();
    const rand = rng(1000 + x + z);
    let c1 = 0, c2 = 0;
    for (let i = 0; i < count * 2; i++) {
      const px = x + (rand() - 0.5) * (w - 3);
      const pz = z + (rand() - 0.5) * (d - 3);
      dummy.position.set(px, 0.62 + rand() * 0.16, pz);
      const s = 0.7 + rand() * 0.9;
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      if (rand() > 0.52) { if (c1 < count) inst.setMatrixAt(c1++, dummy.matrix); }
      else if (c2 < count) inst2.setMatrixAt(c2++, dummy.matrix);
    }
    inst.count = c1;
    inst2.count = c2;
    inst.instanceMatrix.needsUpdate = true;
    inst2.instanceMatrix.needsUpdate = true;
    parent.add(inst, inst2);
  }
}

function createNorthForecourtDetails(ctx, parent) {
  const { mats } = ctx;
  // low granite posts defining the north edge of the square
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = s * (128 + i * 15);
      addCylinder(parent, 0.12, 0.17, 1.15, mats.marbleShade, x, 0.59, -125, { segments: 8, cast: false });
      addSphere(parent, 0.15, mats.gold, x, 1.22, -125, [1, 0.9, 1], 8);
    }
  }
}

/* ==================================================================
   Monument to the People's Heroes
=================================================================== */

export function createMonument(ctx) {
  const { scene, mats } = ctx;
  const g = new THREE.Group();
  g.name = 'Monument to the People\'s Heroes';
  g.position.set(0, 0, 180);
  scene.add(g);

  // concentric paved apron, so the memorial reads as a focal point from above
  const apron = new THREE.Mesh(new THREE.RingGeometry(20, 30, 72), mats.stone);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.035;
  apron.receiveShadow = true;
  g.add(apron);
  for (let i = 0; i < 8; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 10), mats.stoneDark);
    strip.position.set(Math.cos(i * Math.PI / 4) * 25, 0.055, Math.sin(i * Math.PI / 4) * 25);
    strip.rotation.y = -i * Math.PI / 4;
    strip.receiveShadow = true;
    g.add(strip);
  }

  addBox(g, 36, 0.55, 36, mats.marbleShade, 0, 0.28, 0);
  addBox(g, 31, 0.65, 31, mats.marble, 0, 0.88, 0);
  addBox(g, 26, 0.8, 26, mats.marbleShade, 0, 1.6, 0);
  addBox(g, 20, 0.9, 20, mats.marble, 0, 2.45, 0);
  for (const s of [-1, 1]) {
    const stair = createStairs({
      width: 14, height: 2.9, depth: 8, steps: 7, material: mats.marble,
      x: 0, y: 0, z: s * 20, direction: s > 0 ? 'south' : 'north',
    });
    g.add(stair);
  }

  // pedestal, with inset relief panels
  addBox(g, 17, 5.0, 17, mats.marble, 0, 5.4, 0);
  addBox(g, 13.6, 0.45, 13.6, mats.marbleShade, 0, 8.1, 0);
  addBox(g, 13, 3.2, 13, mats.marble, 0, 9.5, 0);
  addBox(g, 11.2, 0.5, 11.2, mats.marbleShade, 0, 11.35, 0);
  const reliefMat = new THREE.MeshStandardMaterial({ color: 0xbdb4a1, roughness: 0.75 });
  const panelSides = [
    { rot: 0, x: 0, z: 8.55 },
    { rot: Math.PI / 2, x: 8.55, z: 0 },
    { rot: Math.PI, x: 0, z: -8.55 },
    { rot: -Math.PI / 2, x: -8.55, z: 0 },
  ];
  for (const side of panelSides) {
    for (let i = -1; i <= 1; i++) {
      const panel = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.05, 2.3, 0.18), mats.gold);
      const relief = new THREE.Mesh(new THREE.BoxGeometry(2.72, 1.98, 0.24), reliefMat);
      frame.position.z = 0.1;
      relief.position.z = 0.2;
      panel.add(frame, relief);
      const off = i * 3.55;
      const alongX = side.rot === 0 || Math.abs(side.rot) === Math.PI;
      panel.position.set(
        alongX ? off : side.x,
        5.35,
        alongX ? side.z : off,
      );
      panel.rotation.y = side.rot;
      g.add(panel);
    }
  }

  // tapering obelisk
  const shaftMat = mats.marble.clone();
  shaftMat.flatShading = true;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 4.75, 24, 4, 1), shaftMat);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 23.5;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);
  addBox(g, 4.2, 0.65, 4.2, mats.marbleShade, 0, 35.75, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.5, 1.5, 4), shaftMat);
  neck.rotation.y = Math.PI / 4;
  neck.position.y = 36.75;
  neck.castShadow = true;
  g.add(neck);

  // the small stone roof and finial
  const capMat = mats.marble.clone();
  capMat.side = THREE.DoubleSide;
  const cap = createRoof({
    width: 8.2, depth: 8.2, height: 2.1, lift: 0.34, ridgeRatio: 0.32,
    material: capMat, ridgeMaterial: mats.marbleShade, details: false, beasts: false,
  });
  cap.position.y = 37.55;
  g.add(cap);
  addCylinder(g, 0.25, 0.4, 1.2, mats.marbleShade, 0, 40.1, 0, { segments: 8 });

  // inscription on the north face (facing Tiananmen)
  const inscriptionMat = new THREE.MeshBasicMaterial({
    map: toTexture(ctx.renderer, textTexture({
      text: '人民英雄永垂不朽', font: '700 170px "STKaiti","KaiTi","STSong","SimSun",serif',
      color: '#b69955', width: 1800, height: 260, padding: 30,
    }), { repeat: [1, 1] }),
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const inscription = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.57), inscriptionMat);
  inscription.position.set(0, 27.4, -2.62);
  inscription.rotation.y = Math.PI;
  g.add(inscription);

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 1.2),
    new THREE.MeshBasicMaterial({
      map: toTexture(ctx.renderer, plaqueTexture('人民英雄纪念碑', {
        width: 1200, height: 260, font: '700 130px "STKaiti","KaiTi","STSong","SimSun",serif',
      }), { repeat: [1, 1] }),
      toneMapped: false,
    }),
  );
  plaque.position.set(0, 9.55, 6.56);
  g.add(plaque);

  // low warm up-lighting
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlow(ctx), color: 0xffc982, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      spr.position.set(sx * 8, 0.8, sz * 8);
      spr.scale.set(4, 4, 1);
      g.add(spr);
      collectGlow(ctx, spr, 0.32);
    }
  }

  return g;
}

/* ==================================================================
   Chairman Mao Memorial Hall
=================================================================== */

export function createMausoleum(ctx) {
  const { scene, mats } = ctx;
  const g = new THREE.Group();
  g.name = 'Chairman Mao Memorial Hall';
  g.position.set(0, 0, 370);
  scene.add(g);

  addBox(g, 110, 0.5, 96, mats.stone, 0, 0.25, 0);
  addBox(g, 100, 0.55, 86, mats.marbleShade, 0, 0.775, 0);
  addBox(g, 90, 0.6, 76, mats.marble, 0, 1.35, 0);
  addBox(g, 80, 0.5, 66, mats.marbleShade, 0, 1.9, 0);
  const southSteps = createStairs({
    width: 64, height: 2.15, depth: 10, steps: 8, material: mats.marble,
    x: 0, y: 0, z: 53, direction: 'south',
  });
  g.add(southSteps);
  const northSteps = createStairs({
    width: 48, height: 2.15, depth: 9, steps: 7, material: mats.marble,
    x: 0, y: 0, z: -53, direction: 'north',
  });
  g.add(northSteps);

  // inner body
  addBox(g, 78, 0.9, 66, mats.marbleShade, 0, 2.6, 0);
  addBox(g, 76, 2.4, 64, mats.redWallDark, 0, 4.25, 0);
  addBox(g, 70, 10.0, 58, mats.plaster, 0, 10.45, 0);
  addBox(g, 71, 0.45, 59, mats.frieze, 0, 15.5, 0);
  // slim vertical seams on the walls
  for (let i = -3; i <= 3; i++) {
    addBox(g, 0.3, 9.2, 0.28, mats.marbleShade, i * 9, 10.5, 29.05);
    addBox(g, 0.3, 9.2, 0.28, mats.marbleShade, i * 9, 10.5, -29.05);
  }

  // 44 granite columns around the perimeter
  const cols = [];
  const halfW = 38, halfD = 33;
  for (let i = 0; i < 12; i++) {
    const x = -halfW + (2 * halfW * i) / 11;
    cols.push({ x, z: halfD });
    cols.push({ x, z: -halfD });
  }
  for (let i = 1; i < 11; i++) {
    const z = -halfD + (2 * halfD * i) / 11;
    cols.push({ x: halfW, z });
    cols.push({ x: -halfW, z });
  }
  const colGroup = new THREE.Group();
  colGroup.position.y = 3.0;
  addInstancedColumns(colGroup, cols, {
    radius: 0.5, height: 12.4, material: mats.marbleShade,
    baseMaterial: mats.marble, capMaterial: mats.marbleShade, segments: 10,
  });
  g.add(colGroup);

  // entablature and layered flat roof
  addBox(g, 88, 1.0, 78, mats.marble, 0, 16.0, 0);
  addBox(g, 86, 1.3, 76, mats.frieze, 0, 17.15, 0);
  addBox(g, 94, 0.6, 84, mats.marbleShade, 0, 18.1, 0);
  addBox(g, 90, 1.0, 80, mats.marble, 0, 18.8, 0);
  addBox(g, 84, 0.35, 74, new THREE.MeshStandardMaterial({ color: 0x8f8c81, roughness: 0.88 }), 0, 19.35, 0);
  // a low parapet makes the roof read as a designed terrace
  for (const s of [-1, 1]) {
    addBox(g, 84, 1.0, 1.1, mats.marbleShade, 0, 19.9, s * 36.5, { cast: false });
    addBox(g, 1.1, 1.0, 72, mats.marbleShade, s * 41.5, 19.9, 0, { cast: false });
  }
  // central skylight and its stone attic
  addBox(g, 52, 2.1, 42, mats.marble, 0, 20.35, 0);
  addBox(g, 48, 0.5, 38, mats.marbleShade, 0, 21.55, 0);
  addBox(g, 32, 0.3, 24, mats.glass, 0, 21.85, 0, { cast: false });
  for (const sx of [-1, 1]) {
    addBox(g, 0.7, 0.6, 26, mats.gold, sx * 16.4, 21.9, 0, { cast: false });
  }
  for (const sz of [-1, 1]) {
    addBox(g, 33, 0.6, 0.7, mats.gold, 0, 21.9, sz * 12.5, { cast: false });
  }

  // red frieze band and column bases
  addBox(g, 80, 0.5, 62, mats.redWallDark, 0, 3.3, 0);

  // south entrance: bronze doors & a ceremonial canopy
  const doors = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 7.6),
    new THREE.MeshStandardMaterial({ color: 0x4a3023, roughness: 0.5, metalness: 0.35 }),
  );
  doors.position.set(0, 7.1, 29.15);
  g.add(doors);
  for (const s of [-1, 1]) {
    addBox(g, 0.5, 8.2, 0.6, mats.gold, s * 10.1, 7.3, 29.25);
    addBox(g, 23, 0.65, 1.0, mats.gold, 0, 11.5, 29.35);
  }
  const entrancePlaque = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 2.4),
    new THREE.MeshBasicMaterial({
      map: toTexture(ctx.renderer, plaqueTexture('毛主席纪念堂', {
        width: 1200, height: 280, font: '700 128px "STKaiti","KaiTi","STSong","SimSun",serif',
      }), { repeat: [1, 1] }),
      toneMapped: false,
    }),
  );
  entrancePlaque.position.set(0, 13.0, 29.25);
  g.add(entrancePlaque);

  // two red banners flanking the entrance
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x9c2824, roughness: 0.9, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 8.6), bannerMat);
    banner.position.set(s * 16, 8.0, 29.4);
    banner.rotation.y = s * 0.08;
    g.add(banner);
    addBox(g, 0.15, 9.0, 0.15, mats.gold, s * 17.2, 8.0, 29.3);
    addCylinder(g, 0.12, 0.12, 0.8, mats.gold, s * 16, 12.7, 29.4, { segments: 8 });
  }

  // warm entrance lighting
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlow(ctx), color: 0xffc27b, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  spr.position.set(0, 3, 38);
  spr.scale.set(14, 8, 1);
  g.add(spr);
  collectGlow(ctx, spr, 0.25);

  return g;
}

/* ==================================================================
   Great Hall of the People
=================================================================== */

function createStairsAlongX(parent, {
  widthZ, height, depth, steps = 12, material, x, y = 0, z = 0, ascending = 'west',
}) {
  const group = new THREE.Group();
  const run = depth / steps;
  const rise = height / steps;
  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1);
    const xPos = ascending === 'west'
      ? depth - run * (i + 0.5)
      : -depth + run * (i + 0.5);
    const box = new THREE.Mesh(new THREE.BoxGeometry(run, h, widthZ), material);
    box.position.set(xPos, h / 2, 0);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  }
  group.position.set(x, y, z);
  return group;
}

function createStaticFlagpole(ctx, {
  height = 18, flagW = 7.8, flagH = 5.2, poleMat, flagMat, goldMat,
}) {
  const g = new THREE.Group();
  addCylinder(g, 0.08, 0.13, height, poleMat || ctx.mats.whitePaint, 0, height / 2, 0, { segments: 10 });
  addSphere(g, 0.22, goldMat || ctx.mats.gold, 0, height + 0.1, 0, [1, 1.2, 1]);
  const geo = new THREE.PlaneGeometry(flagW, flagH, 12, 7);
  geo.translate(flagW / 2, -flagH / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 0.9 + y * 0.3) * 0.38 * (x / flagW));
  }
  geo.computeVertexNormals();
  const flag = new THREE.Mesh(geo, flagMat || ctx.mats.flag);
  flag.position.set(0.12, height - 0.5, 0);
  flag.castShadow = true;
  g.add(flag);
  return g;
}

export function createGreatHall(ctx) {
  const { scene, mats } = ctx;
  const g = new THREE.Group();
  g.name = 'Great Hall of the People';
  g.position.set(-392, 0, 105);
  scene.add(g);

  const stone = new THREE.MeshStandardMaterial({ color: 0xc9c0ad, roughness: 0.74, metalness: 0.02 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0xa79e8d, roughness: 0.8 });
  const glassMat = clonedMapMat(mats.glass, null, [1, 1]);
  collectEmissive(ctx, glassMat, 0.07, 1.1);

  addBox(g, 206, 0.55, 318, mats.marbleShade, 0, 0.28, 0);
  addBox(g, 194, 2.7, 306, stone, 0, 1.9, 0);
  addBox(g, 196, 0.25, 308, stoneDark, 0, 3.3, 0);

  // main mass
  addBox(g, 172, 24, 280, stone, 0, 15.2, 0);
  addBox(g, 173, 2.2, 281, mats.redWallDark, 0, 4.4, 0);
  addBox(g, 174, 0.6, 282, mats.frieze, 0, 26.9, 0);
  addBox(g, 182, 1.1, 290, stoneDark, 0, 27.8, 0);
  addBox(g, 176, 1.5, 284, stone, 0, 28.9, 0);

  // east facade: long stone bays and warm glass strips
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.z = s * 93;
    addBox(wing, 3.0, 17.5, 64, glassMat, 0, 14.6, 0);
    for (let i = -3; i <= 3; i++) {
      addBox(wing, 1.0, 19, 1.2, stoneDark, 1.8, 14.3, i * 9.6);
    }
    addBox(wing, 4.0, 2.2, 68, stoneDark, 1.8, 24.9, 0);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(64, 17.5), glassMat);
    win.rotation.y = Math.PI / 2;
    win.position.set(86.1, 14.6, 0);
    wing.add(win);
    g.add(wing);
  }

  // central east portico
  const portico = new THREE.Group();
  portico.position.z = 0;
  // recessed glazing
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(104, 19.5), glassMat);
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(86.15, 13.4, 0);
  portico.add(curtain);
  // red piers behind the glass
  for (const z of [-40, -20, 0, 20, 40]) {
    addBox(portico, 1.4, 21, 1.7, mats.redWallDark, 86.4, 13.4, z);
  }
  // the twelve columns
  const positions = [];
  for (let i = 0; i < 12; i++) {
    positions.push({ x: 89.6, z: -50.6 + (101.2 * i) / 11 });
  }
  const colGroup = new THREE.Group();
  colGroup.position.y = 3.2;
  addInstancedColumns(colGroup, positions, {
    radius: 1.1, height: 19.8, material: mats.marbleShade,
    baseMaterial: mats.stoneDark, capMaterial: mats.stone, segments: 16,
  });
  portico.add(colGroup);
  // entablature
  addBox(portico, 19, 4.4, 122, stone, 91.2, 24.4, 0);
  addBox(portico, 23, 2.0, 130, stoneDark, 92.0, 27.6, 0);
  addBox(portico, 20, 1.0, 122, mats.marble, 92.0, 29.1, 0);
  addBox(portico, 4, 0.45, 108, mats.gold, 100.4, 23.6, 0);
  // lintel inscription plaque
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 3.1),
    new THREE.MeshBasicMaterial({
      map: toTexture(ctx.renderer, plaqueTexture('人民大会堂', {
        width: 1400, height: 280, font: '700 150px "STKaiti","KaiTi","STSong","SimSun",serif',
      }), { repeat: [1, 1] }),
      toneMapped: false,
    }),
  );
  plaque.rotation.y = Math.PI / 2;
  plaque.position.set(100.75, 24.9, 0);
  portico.add(plaque);
  // main doors
  addBox(portico, 0.35, 8.2, 22, mats.wood, 86.65, 8.6, 0);
  for (const s of [-1, 1]) {
    addBox(portico, 0.6, 9.2, 0.8, mats.gold, 86.8, 8.6, s * 11.5);
  }
  g.add(portico);

  // grand east staircase
  const stairs = createStairsAlongX(g, {
    widthZ: 138, height: 3.2, depth: 22, steps: 12, material: stoneDark,
    x: 97, y: 0, z: 0, ascending: 'west',
  });
  g.add(stairs);
  for (const s of [-1, 1]) {
    addBox(g, 22, 0.9, 2.0, stoneDark, 108, 1.0, s * 70);
  }

  // roof cornice, parapet and dark roof deck
  addBox(g, 184, 1.2, 292, stoneDark, 0, 29.2, 0);
  addBox(g, 188, 0.55, 296, mats.ridge, 0, 30.0, 0);
  addBox(g, 176, 0.5, 284, new THREE.MeshStandardMaterial({ color: 0x5b5d59, roughness: 0.9 }), 0, 30.4, 0);
  // parapet
  for (const s of [-1, 1]) {
    addBox(g, 2.4, 1.4, 286, stone, s * 88, 31.0, 0, { cast: false });
    addBox(g, 174, 1.4, 2.4, stone, 0, 31.0, s * 140, { cast: false });
  }
  // roof skylights and service volumes
  for (const x of [-52, -28, 28, 52]) {
    addBox(g, 15, 0.4, 220, mats.glass, x, 30.7, 0, { cast: false });
  }
  addBox(g, 30, 3.4, 44, stoneDark, 0, 32.2, 58, { cast: false });
  addBox(g, 20, 2.2, 26, stone, 0, 31.5, -74, { cast: false });
  const roofFlag = createStaticFlagpole(ctx, { height: 14, flagW: 6.2, flagH: 4.1 });
  roofFlag.position.set(0, 30.6, 0);
  g.add(roofFlag);

  // plaza flagpoles
  for (const s of [-1, 1]) {
    const fp = createStaticFlagpole(ctx, { height: 17, flagW: 7, flagH: 4.7 });
    fp.position.set(128, 0, s * 80);
    g.add(fp);
    addBox(g, 4.5, 0.45, 4.5, mats.marbleShade, 128, 0.23, s * 80);
  }

  // low wings / service masses on the west side
  addBox(g, 34, 12, 160, stoneDark, -100, 8.5, 0);
  addBox(g, 34, 0.8, 164, mats.ridge, -100, 14.8, 0);

  // entrance planters
  for (const s of [-1, 1]) {
    addBox(g, 14, 0.8, 3.0, mats.marbleShade, 111, 0.4, s * 83);
    addBox(g, 13.4, 0.7, 2.4, mats.hedge, 111, 1.05, s * 83);
  }

  return g;
}

/* ==================================================================
   National Museum of China
=================================================================== */

export function createMuseum(ctx) {
  const { scene, mats } = ctx;
  const g = new THREE.Group();
  g.name = 'National Museum of China';
  g.position.set(392, 0, 100);
  scene.add(g);

  const stone = new THREE.MeshStandardMaterial({ color: 0xc4beb0, roughness: 0.72, metalness: 0.02 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.78 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x5f4932, roughness: 0.45, metalness: 0.55 });
  const glassMat = clonedMapMat(mats.glass, null, [1, 1]);
  collectEmissive(ctx, glassMat, 0.08, 1.2);

  addBox(g, 236, 0.6, 356, mats.marbleShade, 0, 0.3, 0);
  addBox(g, 224, 2.7, 344, stone, 0, 1.9, 0);
  addBox(g, 226, 0.25, 346, stoneDark, 0, 3.3, 0);

  // long horizontal wings
  addBox(g, 154, 24, 322, stone, 0, 15.2, 0);
  addBox(g, 155, 2.4, 323, mats.redWallDark, 0, 4.4, 0);
  addBox(g, 156, 0.55, 324, mats.frieze, 0, 26.9, 0);
  addBox(g, 170, 1.2, 332, stoneDark, 0, 27.9, 0);
  addBox(g, 162, 1.2, 326, stone, 0, 28.9, 0);

  // west facade rhythm: pilasters + low bronze windows
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.z = s * 93;
    addBox(wing, 0.7, 21, 60, glassMat, -78.2, 13.8, 0);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(60, 21), glassMat);
    win.rotation.y = -Math.PI / 2;
    win.position.set(-78.6, 13.8, 0);
    wing.add(win);
    for (let i = -3; i <= 3; i++) {
      addBox(wing, 1.1, 22.5, 1.5, stoneDark, -78.6, 14.4, i * 9.4);
    }
    addBox(wing, 4.5, 2.0, 65, stoneDark, -78.9, 25.2, 0);
    // a row of narrow upper windows
    for (let i = -3; i <= 3; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.2), mats.darkGlass);
      w.rotation.y = -Math.PI / 2;
      w.position.set(-79.25, 23.4, i * 9.4);
      wing.add(w);
    }
    g.add(wing);
  }

  // central pavilion, projecting west
  addBox(g, 32, 34, 104, stone, -87, 20.4, 0);
  addBox(g, 34, 1.1, 110, stoneDark, -87, 37.8, 0);
  addBox(g, 30, 0.8, 100, stone, -87, 38.7, 0);
  addBox(g, 32, 2.6, 104, mats.frieze, -87, 5.4, 0);
  const pavGlazing = new THREE.Mesh(new THREE.PlaneGeometry(96, 27), glassMat);
  pavGlazing.rotation.y = -Math.PI / 2;
  pavGlazing.position.set(-103.1, 20.4, 0);
  g.add(pavGlazing);
  // bronze frames and deeply recessed doors
  addBox(g, 0.6, 27, 0.7, bronze, -103.6, 20.4, -47);
  addBox(g, 0.6, 27, 0.7, bronze, -103.6, 20.4, 47);
  for (const z of [-16, 0, 16]) {
    addBox(g, 0.6, 7.2, 1.0, mats.gold, -103.7, 6.9, z);
  }
  // dark bronze door leaves behind the colonnade
  addBox(g, 0.5, 8.6, 20, new THREE.MeshStandardMaterial({ color: 0x3d2d21, roughness: 0.5, metalness: 0.4 }), -103.65, 8.8, -13);
  addBox(g, 0.5, 8.6, 20, new THREE.MeshStandardMaterial({ color: 0x3d2d21, roughness: 0.5, metalness: 0.4 }), -103.65, 8.8, 13);
  addBox(g, 0.65, 9.2, 0.8, mats.gold, -103.6, 9.2, 0);
  addBox(g, 0.65, 0.5, 44, mats.gold, -103.6, 13.4, 0);
  // deep portal frame
  addBox(g, 7.5, 2.2, 108, bronze, -102.0, 35.4, 0);
  for (const z of [-46, 46]) {
    addBox(g, 8, 33, 4.2, bronze, -102.0, 18.4, z);
  }
  // dark recessed soffit under the great lintel
  addBox(g, 8.4, 0.5, 96, bronze, -102.5, 29.5, 0);
  for (let i = -4; i <= 4; i++) {
    addBox(g, 8.8, 0.3, 1.2, mats.gold, -102.5, 29.7, i * 10);
  }

  // eight great columns in front of the portal
  const colPositions = [];
  for (let i = 0; i < 8; i++) {
    colPositions.push({ x: -106.8, z: -42 + (84 * i) / 7 });
  }
  const colGroup = new THREE.Group();
  colGroup.position.y = 3.2;
  addInstancedColumns(colGroup, colPositions, {
    radius: 0.92, height: 25.4, material: mats.marbleShade,
    baseMaterial: mats.stoneDark, capMaterial: mats.stone, segments: 14,
  });
  g.add(colGroup);
  addBox(g, 9.5, 3.2, 102, stone, -106.4, 30.2, 0);
  addBox(g, 12.0, 1.0, 108, bronze, -106.7, 31.9, 0);
  addBox(g, 13.5, 0.7, 112, stoneDark, -106.9, 32.7, 0);
  // dark metal roof deck and skylights
  const museumRoofMat = new THREE.MeshStandardMaterial({ color: 0x87847a, roughness: 0.88 });
  addBox(g, 148, 0.45, 310, museumRoofMat, 0, 29.55, 0);
  for (const x of [-44, 44]) {
    for (const z of [-84, 0, 84]) {
      addBox(g, 6, 0.35, 40, mats.glass, x, 29.85, z, { cast: false });
    }
  }
  for (let i = -5; i <= 5; i++) {
    addBox(g, 0.45, 0.18, 300, mats.marbleShade, i * 12, 29.78, 0, { cast: false });
  }
  // central roof pavilion: a broad, low bronze-gray cap
  addBox(g, 38, 1.4, 116, stoneDark, -87, 38.9, 0);
  addBox(g, 34, 1.6, 108, new THREE.MeshStandardMaterial({ color: 0x777d75, roughness: 0.75 }), -87, 40.2, 0);
  addBox(g, 36, 0.4, 112, mats.gold, -87, 39.7, 0);
  // a low roof outline with deep eaves
  const museumCap = createRoof({
    width: 122, depth: 44, height: 3.5, lift: 1.2, ridgeRatio: 0.55,
    material: new THREE.MeshStandardMaterial({ color: 0x7f887f, roughness: 0.68, metalness: 0.14 }),
    ridgeMaterial: mats.ridgeGrey, details: false,
  });
  museumCap.rotation.y = Math.PI / 2;
  museumCap.position.set(-87, 40.9, 0);
  g.add(museumCap);
  // suspended name plaque
  const museumPlaque = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 4.4),
    new THREE.MeshBasicMaterial({
      map: toTexture(ctx.renderer, plaqueTexture('中国国家博物馆', {
        width: 1600, height: 280, font: '700 128px "STKaiti","KaiTi","STSong","SimSun",serif',
      }), { repeat: [1, 1] }),
      toneMapped: false,
    }),
  );
  museumPlaque.rotation.y = -Math.PI / 2;
  museumPlaque.position.set(-108.1, 26.5, 0);
  g.add(museumPlaque);
  addBox(g, 0.35, 0.35, 24, mats.gold, -108.25, 28.55, 0, { cast: false });

  // steps and plaza
  const stairs = createStairsAlongX(g, {
    widthZ: 136, height: 3.2, depth: 22, steps: 12, material: stoneDark,
    x: -113, y: 0, z: 0, ascending: 'east',
  });
  g.add(stairs);
  for (const s of [-1, 1]) {
    addBox(g, 22, 0.8, 2.2, stoneDark, -124, 1.0, s * 69);
    const fp = createStaticFlagpole(ctx, { height: 17, flagW: 7, flagH: 4.7 });
    fp.position.set(-142, 0, s * 82);
    g.add(fp);
    addBox(g, 4.5, 0.45, 4.5, mats.marbleShade, -142, 0.23, s * 82);
  }

  // planters
  for (const s of [-1, 1]) {
    addBox(g, 3.0, 0.8, 14, mats.marbleShade, -126, 0.4, s * 96);
    addBox(g, 2.4, 0.7, 13.4, mats.hedge, -126, 1.05, s * 96);
  }

  return g;
}

/* ==================================================================
   Zhengyangmen (Qianmen)
=================================================================== */

function masonryTexture(ctx, {
  width = 1024, height = 512, rows = 12, cols = 28, arches = false,
} = {}) {
  const { c, ctx: g } = makeCanvas(width, height);
  const rand = rng(archorsSeed(rows, cols));
  g.fillStyle = '#625f57';
  g.fillRect(0, 0, width, height);
  const bw = width / cols, bh = height / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let col = -1; col < cols + 1; col++) {
      const v = 100 + (rand() * 34 - 17);
      g.fillStyle = `rgb(${v + 5 | 0},${v + 3 | 0},${v - 3 | 0})`;
      g.fillRect(col * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  }
  if (arches) {
    for (let row = 0; row < 3; row++) {
      const cy = height * (0.25 + row * 0.23);
      const n = 11;
      for (let i = 0; i < n; i++) {
        const cx = width * (0.1 + (0.8 * i) / (n - 1));
        const aw = width * 0.035;
        const ah = height * 0.13;
        g.fillStyle = '#2b2118';
        g.beginPath();
        g.moveTo(cx - aw / 2, cy + ah / 2);
        g.lineTo(cx - aw / 2, cy - ah * 0.1);
        g.arc(cx, cy - ah * 0.1, aw / 2, Math.PI, 0, false);
        g.lineTo(cx + aw / 2, cy + ah / 2);
        g.closePath();
        g.fill();
        g.strokeStyle = '#bbb2a0';
        g.lineWidth = Math.max(2, width * 0.0025);
        g.stroke();
      }
    }
    // red timber bands between window tiers
    for (let row = 0; row < 2; row++) {
      const y = height * (0.35 + row * 0.23);
      g.fillStyle = 'rgba(112,42,33,.85)';
      g.fillRect(0, y, width, height * 0.018);
    }
  }
  // grime / weather streaks
  g.globalAlpha = 0.12;
  for (let i = 0; i < 90; i++) {
    g.fillStyle = rand() > 0.5 ? '#d8cdb6' : '#2f2c27';
    g.fillRect(rand() * width, rand() * height, 1 + rand() * 4, 10 + rand() * 80);
  }
  g.globalAlpha = 1;
  return c;
}

function archorsSeed(a, b) { return (a * 131 + b * 17) | 0; }

function createQianmenTower(ctx, { z = 700 } = {}) {
  const { mats } = ctx;
  const g = new THREE.Group();
  g.position.set(0, 0, z);

  const baseW = 68, baseD = 30, baseH = 14;
  const arches = [{ x: 0, w: 11.5, h: 12.2 }];
  const wall = archedWall({
    width: baseW, height: baseH, depth: baseD, arches, material: mats.brick,
  });
  wall.position.y = 0;
  g.add(wall);
  addArchTrim(g, arches.map((a) => ({ ...a, w: a.w + 0.2, h: a.h + 0.2 })), baseD / 2 + 0.02, mats);
  // a dark passage inside
  addDoorPlane(g, arches[0], baseD / 2 - 0.9, mats.wood);

  addBox(g, baseW + 4, 0.55, baseD + 4, mats.stone, 0, 0.27, 0);
  const topRail = createBalustrade({
    width: baseW, depth: baseD, material: mats.marble,
    height: 0.92, spacing: 3.6, y: baseH,
  });
  g.add(topRail);
  addBox(g, baseW + 3, 0.7, baseD + 3, mats.stone, 0, baseH + 0.2, 0);

  // gate hall
  const hallW = 48, hallD = 18, hallH = 10.5;
  const y0 = baseH + 0.55;
  addBox(g, hallW, hallH, hallD, mats.redWall, 0, y0 + hallH / 2, 0);
  const latMat = clonedMapMat(mats.lattice, mats._textures.lattice, [7, 1]);
  collectEmissive(ctx, latMat, 0.03, 0.8);
  const lat = new THREE.Mesh(new THREE.PlaneGeometry(40, 6.2), latMat);
  lat.position.set(0, y0 + 3.6, hallD / 2 + 0.05);
  g.add(lat);
  addBox(g, 44, 0.65, 20, mats.frieze, 0, y0 + hallH - 0.5, 0);
  const cols = [];
  for (let i = 0; i < 8; i++) {
    const x = -22.5 + (45 * i) / 7;
    cols.push({ x, z: hallD / 2 + 1.1 });
    cols.push({ x, z: -hallD / 2 - 1.1 });
  }
  const colGroup = new THREE.Group();
  colGroup.position.y = y0;
  addInstancedColumns(colGroup, cols, {
    radius: 0.36, height: 8.4, material: mats.columnRed,
    baseMaterial: mats.stone, capMaterial: mats.gold, segments: 10,
  });
  g.add(colGroup);

  const lower = createSkirtRoof({
    width: 58, depth: 28, innerWidth: 47, innerDepth: 18, height: 2.6, lift: 1.4,
    material: mats.greyRoof, ridgeMaterial: mats.ridgeGrey,
  });
  lower.position.y = y0 + 9.4;
  g.add(lower);
  addBox(g, 42, 2.8, 13, mats.redWallDark, 0, y0 + 10.2, 0);
  const upper = createRoof({
    width: 53, depth: 24, height: 4.8, lift: 1.75, ridgeRatio: 0.55,
    material: mats.greyRoof, ridgeMaterial: mats.ridgeGrey,
    details: true, beasts: false,
  });
  upper.position.y = y0 + 12.3;
  g.add(upper);

  // lanterns under the eaves
  const lanternMat = collectEmissive(ctx, mats.lantern.clone(), 0.2, 1.2);
  for (const s of [-1, 1]) {
    const l = createLantern({ scale: 0.9, material: lanternMat, capMaterial: mats.gold, glowTexture: makeGlow(ctx) });
    l.position.set(s * 16, y0 + 8.2, 12.4);
    g.add(l);
    if (l.userData.glow) collectGlow(ctx, l.userData.glow, 0.4);
  }

  return g;
}

function createArcheryTower(ctx, { z = 800 } = {}) {
  const { mats } = ctx;
  const g = new THREE.Group();
  g.position.set(0, 0, z);

  const baseW = 92, baseD = 32, baseH = 12;
  addBox(g, baseW, baseH, baseD, mats.brick, 0, baseH / 2, 0);
  addBox(g, baseW + 5, 0.8, baseD + 4, mats.stoneDark, 0, 0.4, 0);
  // façade with three tiers of arched embrasures
  const facadeCanvas = masonryTexture(ctx, { width: 1024, height: 512, rows: 13, cols: 32, arches: true });
  const facadeTex = toTexture(ctx.renderer, facadeCanvas, { repeat: [1, 1] });
  const facadeMat = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(baseW, baseH), facadeMat);
    p.position.set(0, baseH / 2, s * (baseD / 2 + 0.03));
    if (s < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  // corner brick quoins
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(g, 2.2, baseH, 2.2, mats.brick, sx * (baseW / 2 - 0.2), baseH / 2, sz * (baseD / 2 - 0.2));
    }
  }
  addBox(g, baseW + 5, 0.7, baseD + 5, mats.stone, 0, baseH + 0.3, 0);

  // first gallery
  let y = baseH + 0.5;
  addBox(g, 80, 9.5, 26, mats.redWall, 0, y + 4.75, 0);
  const latMat = clonedMapMat(mats.lattice, mats._textures.lattice, [12, 0.8]);
  collectEmissive(ctx, latMat, 0.03, 0.9);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(74, 5.2), latMat);
    p.position.set(0, y + 4.0, s * 13.05);
    if (s < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  addBox(g, 82, 0.6, 28, mats.frieze, 0, y + 9.2, 0);
  const lowerRoof = createSkirtRoof({
    width: 94, depth: 38, innerWidth: 79, innerDepth: 25, height: 3.0, lift: 1.55,
    material: mats.greyRoof, ridgeMaterial: mats.ridgeGrey,
  });
  lowerRoof.position.y = y + 9.4;
  g.add(lowerRoof);

  // second gallery
  y += 11.9;
  addBox(g, 68, 7.0, 21, mats.redWall, 0, y + 3.5, 0);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(61, 4.2), latMat);
    p.position.set(0, y + 3.2, s * 10.55);
    if (s < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  addBox(g, 70, 0.55, 23, mats.frieze, 0, y + 6.9, 0);
  const midRoof = createSkirtRoof({
    width: 82, depth: 31, innerWidth: 67, innerDepth: 20, height: 2.5, lift: 1.35,
    material: mats.greyRoof, ridgeMaterial: mats.ridgeGrey,
  });
  midRoof.position.y = y + 6.9;
  g.add(midRoof);

  // crowns
  y += 8.6;
  addBox(g, 57, 4.0, 17, mats.redWallDark, 0, y + 2.0, 0);
  const top = createRoof({
    width: 78, depth: 29, height: 6.0, lift: 2.0, ridgeRatio: 0.56,
    material: mats.greyRoof, ridgeMaterial: mats.ridgeGrey,
    details: true, beasts: false,
  });
  top.position.y = y + 4.0;
  g.add(top);
  addBox(g, 78, 0.6, 29, mats.frieze, 0, y + 4.0, 0);

  g.scale.y = 0.8;
  return g;
}

export function createQianmen(ctx) {
  const { scene, mats } = ctx;
  const g = new THREE.Group();
  g.name = 'Zhengyangmen';
  scene.add(g);
  const gate = createQianmenTower(ctx, { z: 700 });
  const archery = createArcheryTower(ctx, { z: 800 });
  g.add(gate, archery);

  // ground around the gates
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(310, 230),
    clonedMapMat(mats.paving, mats._textures.paving, [22, 16]),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0.03, 755);
  ground.receiveShadow = true;
  g.add(ground);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 260),
    clonedMapMat(mats.asphalt, mats._textures.asphalt, [2, 18]),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.075, 760);
  road.receiveShadow = true;
  g.add(road);
  for (let z = 650; z <= 900; z += 18) {
    addBox(g, 0.2, 0.03, 5.5, mats.roadLine, 0, 0.085, z, { cast: false, receive: false });
  }

  return g;
}

/* ==================================================================
   Forbidden City backdrop
=================================================================== */

function backgroundHall(ctx, {
  x = 0, z = 0, width = 90, depth = 40, hallHeight = 16, roofHeight = 10,
  baseHeight = 3, doubleRoof = true, rot = 0, golden = true,
}) {
  const { mats } = ctx;
  const g = new THREE.Group();
  addBox(g, width + 22, baseHeight, depth + 22, mats.marbleShade, 0, baseHeight / 2, 0);
  addBox(g, width, hallHeight, depth, mats.redWall, 0, baseHeight + hallHeight / 2, 0);
  addBox(g, width + 2, 0.8, depth + 2, mats.frieze, 0, baseHeight + hallHeight + 0.3, 0);
  const roofMat = golden ? mats.goldRoof : mats.greyRoof;
  const ridgeMat = golden ? mats.ridge : mats.ridgeGrey;
  if (doubleRoof) {
    const lower = createSkirtRoof({
      width: width + 20, depth: depth + 18, innerWidth: width - 2, innerDepth: depth - 4,
      height: roofHeight * 0.36, lift: 1.1, material: roofMat, ridgeMaterial: ridgeMat,
    });
    lower.position.y = baseHeight + hallHeight + 0.8;
    g.add(lower);
    addBox(g, width - 6, roofHeight * 0.28, depth - 8, mats.redWallDark, 0, baseHeight + hallHeight + roofHeight * 0.38, 0);
    const upper = createRoof({
      width: width + 8, depth: depth + 6, height: roofHeight * 0.8, lift: 1.8,
      material: roofMat, ridgeMaterial: ridgeMat, details: false,
    });
    upper.position.y = baseHeight + hallHeight + roofHeight * 0.42;
    g.add(upper);
  } else {
    const roof = createRoof({
      width: width + 16, depth: depth + 14, height: roofHeight, lift: 1.7,
      material: roofMat, ridgeMaterial: ridgeMat, details: false,
    });
    roof.position.y = baseHeight + hallHeight + 0.8;
    g.add(roof);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

function createForbiddenCityGate(ctx, { z, width, height, hallW, hallD, hallH, doubleRoof = true }) {
  const { mats } = ctx;
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  addBox(g, width + 8, 1.2, 38, mats.marbleShade, 0, 0.6, 0);
  const arches = [
    { x: 0, w: width * 0.1, h: height * 0.82 },
    { x: -width * 0.17, w: width * 0.075, h: height * 0.68 },
    { x: width * 0.17, w: width * 0.075, h: height * 0.68 },
  ];
  const wall = archedWall({ width, height, depth: 30, arches, material: mats.redWall });
  g.add(wall);
  addArchTrim(g, arches, 15.02, mats);
  addBox(g, width + 3, 0.8, 33, mats.marbleShade, 0, height + 0.1, 0);
  addBox(g, hallW, hallH, hallD, mats.redWallDark, 0, height + 0.7 + hallH / 2, 0);
  addBox(g, hallW + 2, 0.7, hallD + 2, mats.frieze, 0, height + 0.7 + hallH + 0.2, 0);
  if (doubleRoof) {
    const lower = createSkirtRoof({
      width: hallW + 18, depth: hallD + 14, innerWidth: hallW - 4, innerDepth: hallD - 6,
      height: 3.0, lift: 1.4, material: mats.goldRoof, ridgeMaterial: mats.ridge,
    });
    lower.position.y = height + 1 + hallH;
    g.add(lower);
    const upper = createRoof({
      width: hallW + 9, depth: hallD + 7, height: 6.5, lift: 2.0,
      material: mats.goldRoofDeep, ridgeMaterial: mats.ridge, details: false,
    });
    upper.position.y = height + 1 + hallH + 3.2;
    g.add(upper);
  } else {
    const roof = createRoof({
      width: hallW + 12, depth: hallD + 10, height: 6.5, lift: 1.9,
      material: mats.goldRoof, ridgeMaterial: mats.ridge, details: false,
    });
    roof.position.y = height + 1 + hallH;
    g.add(roof);
  }
  // side wing pavilions
  for (const s of [-1, 1]) {
    const wing = backgroundHall(ctx, {
      x: s * width * 0.62, z: 4, width: hallW * 0.42, depth: hallD * 0.8,
      hallHeight: hallH * 0.7, roofHeight: 5.5, baseHeight: 0.8, doubleRoof: false,
    });
    g.add(wing);
  }
  return g;
}

export function createForbiddenCity(ctx) {
  const { scene, mats } = ctx;
  const g = new THREE.Group();
  g.name = 'Forbidden City';
  scene.add(g);

  // moat and the long imperial wall just to the north of Tiananmen
  const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 24), ctx.env.waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.3, -312);
  g.add(water);
  for (const s of [-1, 1]) {
    addBox(g, 560, 0.8, 1.3, mats.stoneDark, 0, 0.4, -312 + s * 12.6);
  }

  const duanmen = createForbiddenCityGate(ctx, {
    z: -362, width: 98, height: 13, hallW: 54, hallD: 18, hallH: 11, doubleRoof: true,
  });
  g.add(duanmen);

  // transition forecourt between the gate and the palace walls
  const bridgeCourt = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 170),
    clonedMapMat(mats.paving, mats._textures.paving, [42, 12]),
  );
  bridgeCourt.rotation.x = -Math.PI / 2;
  bridgeCourt.position.set(0, 0.03, -260);
  bridgeCourt.receiveShadow = true;
  g.add(bridgeCourt);

  const wumen = createForbiddenCityGate(ctx, {
    z: -468, width: 142, height: 17, hallW: 72, hallD: 22, hallH: 14, doubleRoof: true,
  });
  g.add(wumen);

  // The palace courtyard and its enclosing red walls.
  const courtyard = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 770),
    clonedMapMat(mats.paving, mats._textures.paving, [45, 56]),
  );
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.set(0, 0.02, -690);
  courtyard.receiveShadow = true;
  g.add(courtyard);
  const axisPath = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 760),
    clonedMapMat(mats.pavingAxis, mats._textures.paving, [4, 45]),
  );
  axisPath.rotation.x = -Math.PI / 2;
  axisPath.position.set(0, 0.04, -690);
  axisPath.receiveShadow = true;
  g.add(axisPath);

  // The courtyard is bounded only by low trees and distant halls; this keeps
  // the palace quiet behind the gate instead of competing with it.
  addBox(g, 620, 6.5, 5.5, mats.redWall, 0, 3.25, -1043);
  addBox(g, 622, 0.55, 7.0, mats.ridge, 0, 6.7, -1043);

  // roofs of the central palace halls, receding into the haze
  g.add(backgroundHall(ctx, {
    z: -610, width: 108, depth: 48, hallHeight: 20, roofHeight: 16, baseHeight: 8, doubleRoof: true,
  }));
  g.add(backgroundHall(ctx, {
    z: -735, width: 76, depth: 38, hallHeight: 16, roofHeight: 11, baseHeight: 6, doubleRoof: true,
  }));
  g.add(backgroundHall(ctx, {
    z: -840, width: 66, depth: 36, hallHeight: 15, roofHeight: 10, baseHeight: 5, doubleRoof: true,
  }));
  // flanking courtyard halls
  for (const s of [-1, 1]) {
    for (const z of [-600, -780]) {
      g.add(backgroundHall(ctx, {
        x: s * 204, z, width: 58, depth: 26, hallHeight: 11, roofHeight: 7, baseHeight: 2, doubleRoof: false,
      }));
    }
  }

  // Jingshan: the verdant hill closing the view up the axis
  const hill = new THREE.Group();
  hill.position.set(0, 0, -1280);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x46533c, roughness: 1, flatShading: true });
  const hillParts = [
    [0, -4, 0, 320, 61, 150],
    [-205, -8, 26, 210, 41, 105],
    [185, -8, 8, 230, 44, 115],
  ];
  for (const [x, y, z, sx, sy, sz] of hillParts) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), hillMat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = true;
    hill.add(m);
  }
  // three small pavilions on the crest
  for (const [x, y] of [[-95, 44], [0, 54], [95, 44]]) {
    const pav = new THREE.Group();
    addBox(pav, 13, 6, 13, mats.redWall, 0, 3, 0);
    addBox(pav, 15, 0.5, 15, mats.frieze, 0, 6.2, 0);
    const roof = createRoof({
      width: 20, depth: 20, height: 4.8, lift: 1.3, ridgeRatio: 0.1,
      material: mats.goldRoof, ridgeMaterial: mats.ridge, details: false,
    });
    roof.position.y = 6.3;
    pav.add(roof);
    pav.position.set(x, y, 0);
    hill.add(pav);
  }
  // tree silhouettes that break up the hill mass
  const coneGeo = new THREE.ConeGeometry(5, 16, 7);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x35422f, roughness: 1, flatShading: true });
  const trees = new THREE.InstancedMesh(coneGeo, coneMat, 150);
  const dummy = new THREE.Object3D();
  const rand = rng(3333);
  for (let i = 0; i < 150; i++) {
    const a = rand() * TAU;
    const r = Math.sqrt(rand());
    const px = Math.cos(a) * r * 280;
    const pz = Math.sin(a) * r * 130;
    const py = 2 + Math.max(0, 1 - (px / 320) ** 2 - (pz / 150) ** 2) * 55;
    dummy.position.set(px, py, pz);
    dummy.scale.set(0.55 + rand() * 0.95, 0.7 + rand() * 0.7, 0.55 + rand() * 0.95);
    dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
  }
  trees.instanceMatrix.needsUpdate = true;
  hill.add(trees);
  g.add(hill);

  // Let the palace sit further back in the haze so that Tiananmen remains
  // the dominant silhouette in the northern view.
  g.position.z = -105;
  g.scale.y = 0.8;

  return g;
}

/* ==================================================================
   Greenery, crowds, lamps and traffic
=================================================================== */

export function createGreenery(ctx) {
  const { scene, mats } = ctx;
  const trees = [];
  const addTree = (x, z, scale = 1, kind = 'broad') => trees.push({ x, z, scale, kind });

  // rows along the east and west edge of the square
  for (let z = -85; z <= 620; z += 27) {
    addTree(-252, z, 0.86 + ((z * 7) % 11) / 30);
    addTree(252, z, 0.86 + ((z * 13) % 11) / 30);
  }
  // tree avenue along Chang'an
  for (let x = 120; x <= 1150; x += 34) {
    addTree(-x, -203, 0.8 + ((x * 3) % 7) / 30);
    addTree(x, -203, 0.8 + ((x * 11) % 7) / 30);
    addTree(-x, -137, 0.8 + ((x * 5) % 7) / 30);
    addTree(x, -137, 0.8 + ((x * 17) % 7) / 30);
  }
  // Qianmen surroundings
  for (let x = 80; x <= 250; x += 28) {
    addTree(-x, 650, 0.9);
    addTree(x, 650, 0.9);
    addTree(-x, 880, 0.95);
    addTree(x, 880, 0.95);
  }
  // around the flanks of the halls and behind them, kept off the main axis
  for (let z = -40; z <= 280; z += 44) {
    addTree(-268, z, 0.92);
    addTree(268, z, 0.92);
    addTree(-520, z, 0.95);
    addTree(520, z, 0.95);
  }
  // small park masses on the outer city blocks
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU;
    const r = 430 + (i % 5) * 45;
    const x = Math.cos(a) * r;
    const z = 260 + Math.sin(a) * r * 0.85;
    if (Math.abs(x) < 300 && z > -220 && z < 680) continue;
    addTree(x, z, 0.85 + (i % 6) * 0.06);
  }
  // much larger, softer canopy belt through the surrounding city fabric
  {
    const rand = rng(6791);
    let added = 0;
    let guard = 0;
    while (added < 620 && guard++ < 14000) {
      const a = rand() * TAU;
      const r = 460 + rand() * 1350;
      const x = Math.cos(a) * r;
      const z = 240 + Math.sin(a) * r * 0.88;
      if (Math.abs(x) < 620 && z > -280 && z < 680) continue;
      if (z < -300 && z > -1180 && Math.abs(x) < 760) continue;
      if (Math.abs(x) < 300 && z > 540 && z < 1080) continue;
      addTree(x, z, 1.02 + rand() * 0.85);
      added++;
    }
  }
  // Forbidden City wall trees
  for (let z = -420; z >= -1000; z -= 44) {
    addTree(-282, z, 1.05);
    addTree(282, z, 1.05);
  }
  // a second, looser row fills the palace forecourt and the long approach
  for (let z = -300; z >= -1010; z -= 36) {
    addTree(-246, z, 1.08 + ((z * 7) % 9) / 50);
    addTree(246, z, 1.08 + ((z * 11) % 9) / 50);
    if (z % 72 === 0) {
      addTree(-338, z, 1.15);
      addTree(338, z, 1.15);
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.17, 0.34, 3.8, 6);
  const foliageGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkInst = new THREE.InstancedMesh(trunkGeo, mats.trunk, trees.length);
  const foliageInst = new THREE.InstancedMesh(foliageGeo, mats.foliage, trees.length * 3);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const rand = rng(8123);
  let fi = 0;
  trees.forEach((t, i) => {
    const s = t.scale * 1.62;
    dummy.position.set(t.x, 1.9 * s, t.z);
    dummy.rotation.set(0, rand() * TAU, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    const blobs = [
      [0, 4.6, 0, 2.05, 1.7, 2.0],
      [-1.1, 3.75, 0.45, 1.45, 1.25, 1.4],
      [0.95, 3.7, -0.55, 1.5, 1.2, 1.42],
    ];
    for (const [bx, by, bz, sx, sy, sz] of blobs) {
      dummy.position.set(t.x + bx * s, by * s, t.z + bz * s);
      dummy.rotation.set(0, rand() * TAU, 0);
      dummy.scale.set(sx * s, sy * s, sz * s);
      dummy.updateMatrix();
      foliageInst.setMatrixAt(fi, dummy.matrix);
      color.setHSL(0.225 + rand() * 0.055, 0.23 + rand() * 0.16, 0.24 + rand() * 0.11);
      foliageInst.setColorAt(fi, color);
      fi++;
    }
  });
  trunkInst.castShadow = true;
  trunkInst.receiveShadow = true;
  foliageInst.castShadow = true;
  foliageInst.receiveShadow = false;
  trunkInst.instanceMatrix.needsUpdate = true;
  foliageInst.instanceMatrix.needsUpdate = true;
  if (foliageInst.instanceColor) foliageInst.instanceColor.needsUpdate = true;
  scene.add(trunkInst, foliageInst);

  // formal cypress rows
  const cypresses = [];
  for (let z = 126; z <= 232; z += 18) {
    cypresses.push([-55, z], [55, z]);
  }
  for (let z = 326; z <= 414; z += 18) {
    cypresses.push([-62, z], [62, z]);
  }
  const cyGeo = new THREE.ConeGeometry(1.45, 7.2, 8);
  const cyTopGeo = new THREE.ConeGeometry(0.95, 5.0, 8);
  const cyInst = new THREE.InstancedMesh(cyGeo, mats.cypress, cypresses.length);
  const cyTop = new THREE.InstancedMesh(cyTopGeo, mats.cypress, cypresses.length);
  cypresses.forEach(([x, z], i) => {
    const s = 1.12 + ((i * 7) % 5) * 0.065;
    dummy.position.set(x, 4.0, z);
    dummy.rotation.set(0, (i * 1.7) % TAU, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    cyInst.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.285, 0.26, 0.25 + (i % 4) * 0.022);
    cyInst.setColorAt(i, color);
    dummy.position.set(x, 8.7 + (i % 3) * 0.12, z);
    dummy.scale.set(s * 0.92, s, s * 0.92);
    dummy.updateMatrix();
    cyTop.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.28, 0.25, 0.29 + (i % 4) * 0.022);
    cyTop.setColorAt(i, color);
  });
  cyInst.castShadow = true;
  cyInst.receiveShadow = true;
  cyTop.castShadow = true;
  cyTop.receiveShadow = true;
  cyInst.instanceMatrix.needsUpdate = true;
  cyTop.instanceMatrix.needsUpdate = true;
  if (cyInst.instanceColor) cyInst.instanceColor.needsUpdate = true;
  if (cyTop.instanceColor) cyTop.instanceColor.needsUpdate = true;
  scene.add(cyInst, cyTop);
}

export function createLamps(ctx) {
  const { scene, mats } = ctx;
  const positions = [];
  // Chang'an Avenue
  for (let x = 110; x <= 700; x += 62) {
    for (const s of [-1, 1]) {
      positions.push([s * x, -202]);
      positions.push([s * x, -138]);
    }
  }
  // the square's east and west rim
  for (let z = -80; z <= 620; z += 68) {
    positions.push([-264, z]);
    positions.push([264, z]);
  }
  // the northern plaza, framing the gate and flag
  for (const x of [-206, -140, -76, 76, 140, 206]) {
    positions.push([x, -126]);
  }
  for (const x of [-104, 104]) {
    positions.push([x, -205]);
  }
  // Qianmen and the north forecourt
  for (const x of [-120, -40, 40, 120]) {
    positions.push([x, 646]);
    positions.push([x, 905]);
  }
  for (const x of [-206, 206]) positions.push([x, -128]);

  const count = positions.length;
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.16, 8.3, 8);
  const armGeo = new THREE.BoxGeometry(2.6, 0.11, 0.11);
  const headGeo = new THREE.SphereGeometry(0.23, 8, 6);
  const poles = new THREE.InstancedMesh(poleGeo, mats.lampPole, count);
  const arms = new THREE.InstancedMesh(armGeo, mats.lampPole, count);
  const heads = new THREE.InstancedMesh(headGeo, mats.lampGlow, count);
  const dummy = new THREE.Object3D();
  const glowPositions = new Float32Array(count * 3);
  positions.forEach(([x, z], i) => {
    dummy.position.set(x, 4.15, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 8.32, z);
    dummy.updateMatrix();
    arms.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 8.52, z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    glowPositions[i * 3] = x;
    glowPositions[i * 3 + 1] = 8.56;
    glowPositions[i * 3 + 2] = z;
  });
  poles.castShadow = true;
  arms.castShadow = false;
  heads.castShadow = false;
  scene.add(poles, arms, heads);

  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
  const glowMat = new THREE.PointsMaterial({
    map: makeGlow(ctx), color: 0xffd7a0, size: 8.5, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowPoints = new THREE.Points(glowGeo, glowMat);
  glowPoints.frustumCulled = false;
  scene.add(glowPoints);
  ctx.night.points.push({ material: glowMat, base: 0.9 });
  collectEmissive(ctx, mats.lampGlow, 0.25, 2.6);

  // small pools of actual warm light at four key places
  const keyLights = [
    [0, 2, -236, 0xffbd80, 360, 150],
    [-30, 2, -238, 0xffb573, 260, 110],
    [30, 2, -238, 0xffb573, 260, 110],
    [0, 3, -108, 0xffd6a4, 180, 100],
    [0, 24, -228, 0xffc68f, 300, 150],
    [-291, 4, 105, 0xffc48b, 210, 140],
    [293, 4, 95, 0xffc48b, 210, 140],
    [0, 4, 200, 0xffd8a8, 230, 100],
    [0, 4, 355, 0xffd8a8, 210, 100],
  ];
  for (const [x, y, z, color, intensity, distance] of keyLights) {
    const light = new THREE.PointLight(color, 0, distance, 2);
    light.position.set(x, y, z);
    scene.add(light);
    ctx.night.lights.push({ light, night: intensity });
  }
}

export function createCrowd(ctx) {
  const { scene, mats } = ctx;
  const rand = rng(4781);
  const people = [];
  const pushPerson = (x, z, move = false) => {
    people.push({
      x, z,
      rot: rand() * TAU,
      scale: 0.96 + rand() * 0.28,
      color: new THREE.Color(),
      skin: new THREE.Color(),
      move,
      phase: rand() * TAU,
      dir: rand() > 0.5 ? 1 : -1,
    });
  };
  const blocked = (x, z) => {
    if (Math.abs(x) > 245 || z < -120 || z > 630) return true;
    if (x * x + (z + 104) ** 2 < 14 ** 2) return true;
    if (Math.abs(x) < 34 && Math.abs(z - 180) < 34) return true;
    if (Math.abs(x) < 72 && Math.abs(z - 370) < 52) return true;
    return false;
  };
  // central axis and surrounding field
  for (let i = 0; i < 190; i++) {
    let x, z, tries = 0;
    do {
      x = (rand() - 0.5) * 470;
      z = -110 + rand() * 720;
      tries++;
    } while (blocked(x, z) && tries < 24);
    if (!blocked(x, z)) pushPerson(x, z, rand() > 0.72);
  }
  // visitors near the gate and bridges
  for (let i = 0; i < 45; i++) {
    const x = (rand() - 0.5) * 270;
    const z = -198 + (rand() - 0.5) * 38;
    if (x * x + (z + 104) ** 2 < 250) continue;
    pushPerson(x, z, rand() > 0.7);
  }
  // a small crowd around the flag and the north end of the square
  for (let i = 0; i < 36; i++) {
    const x = (rand() - 0.5) * 180;
    const z = -98 + rand() * 120;
    if (x * x + (z + 104) ** 2 < 250) continue;
    pushPerson(x, z, rand() > 0.82);
  }
  // orderly clusters facing the monument
  for (let i = 0; i < 30; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (48 + rand() * 34);
    const z = 108 + rand() * 110;
    pushPerson(x, z, false);
  }
  // museum / Great Hall approaches
  for (let i = 0; i < 38; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (210 + rand() * 45);
    const z = -40 + rand() * 310;
    pushPerson(x, z, rand() > 0.65);
  }
  // Qianmen tourists
  for (let i = 0; i < 32; i++) {
    const x = (rand() - 0.5) * 170;
    const z = 625 + rand() * 125;
    pushPerson(x, z, rand() > 0.6);
  }

  const bodyGeo = new THREE.CapsuleGeometry(0.29, 0.73, 3, 7);
  const headGeo = new THREE.SphereGeometry(0.155, 7, 6);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd1b095, roughness: 0.9 });
  const bodyInst = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), people.length);
  const headInst = new THREE.InstancedMesh(headGeo, skinMat, people.length);
  const palette = ['#27313b', '#3d4a55', '#6f2d27', '#85613f', '#b2a999', '#2e493c',
    '#233348', '#8e3c32', '#c9c2b2', '#4f4f4f', '#8f5a42', '#304a5f'];
  const dummy = new THREE.Object3D();
  people.forEach((p, i) => {
    const s = p.scale;
    dummy.position.set(p.x, 0.78 * s, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(1, s, 1);
    dummy.updateMatrix();
    bodyInst.setMatrixAt(i, dummy.matrix);
    p.color.set(palette[(rand() * palette.length) | 0]);
    bodyInst.setColorAt(i, p.color);
    dummy.position.set(p.x, 1.55 * s, p.z);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    headInst.setMatrixAt(i, dummy.matrix);
    p.skin.setHSL(0.065 + rand() * 0.035, 0.27 + rand() * 0.18, 0.39 + rand() * 0.22);
    headInst.setColorAt(i, p.skin);
  });
  bodyInst.instanceMatrix.needsUpdate = true;
  headInst.instanceMatrix.needsUpdate = true;
  if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
  if (headInst.instanceColor) headInst.instanceColor.needsUpdate = true;
  bodyInst.castShadow = false;
  headInst.castShadow = false;
  bodyInst.receiveShadow = false;
  headInst.receiveShadow = false;
  scene.add(bodyInst, headInst);

  // a subtle, slow drift makes the square feel alive
  ctx.updaters.push((dt, elapsed) => {
    let changed = false;
    people.forEach((p, i) => {
      if (!p.move) return;
      p.z += p.dir * dt * 0.55;
      if (p.z > 625) p.dir = -1;
      if (p.z < -115) p.dir = 1;
      const bob = Math.sin(elapsed * 1.8 + p.phase) * 0.025;
      const s = p.scale;
      dummy.position.set(p.x, 0.78 * s + bob, p.z);
      dummy.rotation.set(0, p.dir > 0 ? 0 : Math.PI, 0);
      dummy.scale.set(1, s, 1);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, 1.55 * s + bob, p.z);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      headInst.setMatrixAt(i, dummy.matrix);
      changed = true;
    });
    if (changed) {
      bodyInst.instanceMatrix.needsUpdate = true;
      headInst.instanceMatrix.needsUpdate = true;
    }
  });
}

/* ==================================================================
   Moving traffic on Chang'an Avenue
=================================================================== */

export function createTraffic(ctx) {
  const { scene, mats } = ctx;
  const rand = rng(657);
  const cars = [];
  const carColors = [0xd9d6cf, 0x252a2c, 0xab2c2b, 0x3b4d60, 0x8a8f8e, 0xddc15b, 0x2b3b31];
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff1cf, emissive: 0xffcf92, emissiveIntensity: 0.2, roughness: 0.4,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x731b18, emissive: 0xff3e25, emissiveIntensity: 0.2, roughness: 0.5,
  });
  collectEmissive(ctx, headMat, 0.2, 2.6);
  collectEmissive(ctx, tailMat, 0.1, 1.2);

  function makeCar({ bus = false, color = 0xd9d6cf } = {}) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.24 });
    const L = bus ? 11.5 : 4.6, W = bus ? 2.5 : 1.85, H = bus ? 3.0 : 1.12;
    const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), bodyMat);
    body.position.y = 0.72 + (bus ? 0.5 : 0.2);
    body.castShadow = true;
    g.add(body);
    if (bus) {
      const windows = new THREE.Mesh(new THREE.BoxGeometry(L - 0.8, 1.3, W + 0.04), mats.darkGlass);
      windows.position.y = 2.4;
      g.add(windows);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, 0.3, W + 0.06), new THREE.MeshStandardMaterial({ color: 0xa63a2f, roughness: 0.7 }));
      stripe.position.y = 1.55;
      g.add(stripe);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.48, 0.72, W * 0.88), mats.darkGlass);
      cabin.position.set(-L * 0.08, 1.58, 0);
      cabin.castShadow = true;
      g.add(cabin);
    }
    const under = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, 0.36, W * 0.94), new THREE.MeshStandardMaterial({ color: 0x181b1c, roughness: 0.9 }));
    under.position.y = 0.35;
    g.add(under);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, W * 0.7), headMat);
    front.position.set(L / 2 + 0.02, 0.72, 0);
    g.add(front);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, W * 0.62), tailMat);
    back.position.set(-L / 2 - 0.02, 0.75, 0);
    g.add(back);
    return g;
  }

  const lanes = [
    { z: -161, dir: 1, base: 26 },
    { z: -153.5, dir: 1, base: 33 },
    { z: -186.5, dir: -1, base: 31 },
    { z: -178.5, dir: -1, base: 38 },
  ];
  for (let i = 0; i < 16; i++) {
    const lane = lanes[i % lanes.length];
    const bus = i === 5 || i === 12;
    const car = makeCar({ bus, color: bus ? 0x9c3428 : carColors[(rand() * carColors.length) | 0] });
    const x = -1350 + rand() * 2700;
    const speed = lane.base * (0.75 + rand() * 0.55);
    car.position.set(x, 0, lane.z);
    car.rotation.y = lane.dir > 0 ? 0 : Math.PI;
    scene.add(car);
    cars.push({ group: car, x, z: lane.z, dir: lane.dir, speed });
  }
  // a couple of cars on the east–west cross axis at Qianmen
  for (let i = 0; i < 4; i++) {
    const car = makeCar({ color: carColors[(rand() * carColors.length) | 0] });
    const z = i % 2 ? 930 : 944;
    const x = -950 + rand() * 1900;
    car.position.set(x, 0, z);
    car.rotation.y = 0;
    scene.add(car);
    cars.push({ group: car, x, z, dir: 1, speed: 18 + rand() * 12 });
  }

  ctx.updaters.push((dt) => {
    for (const c of cars) {
      c.x += c.dir * c.speed * dt;
      if (c.dir > 0 && c.x > 1650) c.x = -1650;
      if (c.dir < 0 && c.x < -1650) c.x = 1650;
      c.group.position.x = c.x;
    }
  });
}

/* ==================================================================
   Beyond the square: Beijing rooftops and the modern skyline
=================================================================== */

function urbanFabricTexture(renderer) {
  const { c, ctx } = makeCanvas(1024, 1024);
  const rand = rng(5150);
  ctx.fillStyle = '#999286';
  ctx.fillRect(0, 0, 1024, 1024);

  // a fine street grid, kept low-contrast so it dissolves into the haze
  const cell = 128;
  ctx.fillStyle = '#847e73';
  for (let x = 0; x <= 1024; x += cell) ctx.fillRect(x - 3, 0, 6, 1024);
  for (let y = 0; y <= 1024; y += cell) ctx.fillRect(0, y - 3, 1024, 6);
  ctx.fillStyle = 'rgba(132,126,115,.8)';
  const lane = 32;
  for (let x = 0; x <= 1024; x += lane) ctx.fillRect(x - 1, 0, 2, 1024);
  for (let y = 0; y <= 1024; y += lane) ctx.fillRect(0, y - 1, 1024, 2);

  // city blocks, courtyards and parks
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      const px = bx * cell + 10;
      const py = by * cell + 10;
      const kind = rand();
      if (kind > 0.87) {
        ctx.fillStyle = '#7b846a';
        ctx.fillRect(px, py, cell - 20, cell - 20);
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = 'rgba(90,102,76,.5)';
          ctx.beginPath();
          ctx.arc(px + 8 + rand() * (cell - 36), py + 8 + rand() * (cell - 36), 4 + rand() * 9, 0, TAU);
          ctx.fill();
        }
        continue;
      }
      const tone = ['#a39b8d', '#b0a89a', '#918b7f', '#aca395'];
      const n = 2 + ((rand() * 4) | 0);
      for (let i = 0; i < n; i++) {
        const w = 18 + rand() * 52;
        const h = 14 + rand() * 42;
        const x = px + rand() * (cell - 20 - w);
        const y = py + rand() * (cell - 20 - h);
        ctx.fillStyle = tone[(rand() * tone.length) | 0];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(102,97,88,.23)';
        ctx.fillRect(x + 3, y + 3, w - 6, 4);
      }
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = 'rgba(98,108,81,.5)';
        ctx.beginPath();
        ctx.arc(px + 10 + rand() * (cell - 30), py + 10 + rand() * (cell - 30), 3 + rand() * 5, 0, TAU);
        ctx.fill();
      }
    }
  }
  // broad arterial roads
  ctx.strokeStyle = 'rgba(118,112,102,.65)';
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(0, 870); ctx.lineTo(1024, 330); ctx.stroke();

  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(240,232,213,.035)' : 'rgba(52,48,41,.045)';
    ctx.fillRect(rand() * 1024, rand() * 1024, 1 + rand() * 3, 1 + rand() * 3);
  }
  return toTexture(renderer, c, { repeat: [12, 12], anisotropy: 8 });
}

export function createCityContext(ctx) {
  const { scene, mats } = ctx;
  const root = new THREE.Group();
  root.name = 'Beijing context';
  scene.add(root);

  const fabric = urbanFabricTexture(ctx.renderer);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(16000, 16000),
    new THREE.MeshStandardMaterial({ map: fabric, color: 0xd9d1c1, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.36;
  ground.receiveShadow = true;
  root.add(ground);

  const rand = rng(90210);
  const cityMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  // A handful of low-slung civic buildings are suggested only as silhouettes.
  // The surrounding city dissolves into haze, leaving the central axis legible.

  // a sea of warm city pinpricks after dark
  const cityGlowCount = 260;
  const glowPos = new Float32Array(cityGlowCount * 3);
  const lightRand = rng(9187);
  for (let i = 0; i < cityGlowCount; i++) {
    const a = lightRand() * TAU;
    const r = 520 + lightRand() * 2100;
    glowPos[i * 3] = Math.cos(a) * r;
    glowPos[i * 3 + 1] = 3 + lightRand() * 22;
    glowPos[i * 3 + 2] = 220 + Math.sin(a) * r * 0.84;
  }
  const cityGlowGeo = new THREE.BufferGeometry();
  cityGlowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  const cityGlowMat = new THREE.PointsMaterial({
    map: makeGlow(ctx), color: 0xffc47b, size: 4.2, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const cityGlow = new THREE.Points(cityGlowGeo, cityGlowMat);
  cityGlow.frustumCulled = false;
  root.add(cityGlow);
  ctx.night.points.push({ material: cityGlowMat, base: 0.65 });

  return root;
}
