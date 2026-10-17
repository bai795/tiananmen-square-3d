import * as THREE from 'three';

/* ------------------------------------------------------------------
   Reusable architectural builders. All dimensions are in metres.
------------------------------------------------------------------- */

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function addBox(parent, w, h, d, material, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.name = opts.name || '';
  parent.add(mesh);
  return mesh;
}

export function addCylinder(parent, rTop, rBottom, h, material, x = 0, y = 0, z = 0, opts = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, opts.segments || 20, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}

export function addSphere(parent, r, material, x, y, z, scale = [1, 1, 1], segments = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segments, Math.max(8, segments * 0.6)), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function addPlane(parent, w, h, material, x, y, z, rx = -Math.PI / 2, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, 0);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function signPlane(parent, texture, { w, h, x, y, z, ry = 0, basic = true, opacity = 1 }) {
  const mat = basic
    ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.7 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.renderOrder = 3;
  parent.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------
   Curved Chinese roof
------------------------------------------------------------------- */

function surfaceGeometry(buildFn, uSegs, vSegs, centerRef) {
  const pos = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= vSegs; j++) {
    for (let i = 0; i <= uSegs; i++) {
      const p = buildFn(i / uSegs, j / vSegs);
      pos.push(p.x, p.y, p.z);
      uvs.push(p.u !== undefined ? p.u : i / uSegs, p.v !== undefined ? p.v : j / vSegs);
    }
  }
  const row = uSegs + 1;
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row + 1;
      const d = a + row;
      indices.push(a, b, d, b, c, d);
    }
  }
  // Make all surface windings point away from the roof body.
  const p0 = new THREE.Vector3().fromArray(pos, 0);
  const p1 = new THREE.Vector3().fromArray(pos, 3);
  const p2 = new THREE.Vector3().fromArray(pos, 3 * (uSegs + 1));
  const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  const centroid = p0.clone().add(p1).add(p2).divideScalar(3).sub(centerRef);
  if (n.dot(centroid) < 0) {
    for (let k = 0; k < indices.length; k += 3) {
      const tmp = indices[k + 1];
      indices[k + 1] = indices[k + 2];
      indices[k + 2] = tmp;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const easeRoof = (v) => Math.pow(v, 1.38);

function hipGeometry(width, depth, height, lift, ridgeRatio, uSegs = 28, vSegs = 10) {
  const ridgeHalf = Math.max(1.2, width * ridgeRatio * 0.5);
  const halfW = width / 2;
  const halfD = depth / 2;
  const ref = new THREE.Vector3(0, height * 0.36, 0);
  const geos = [];
  const cornerLift = (u, v) => lift * Math.pow(1 - v, 3) * Math.pow(Math.abs(2 * u - 1), 6);

  function face(signZ) {
    return surfaceGeometry((u, v) => {
      const hx = halfW - (halfW - ridgeHalf) * v;
      return {
        x: -hx + 2 * hx * u,
        y: height * easeRoof(v) + cornerLift(u, v),
        z: signZ * halfD * (1 - v),
        u: u * width,
        v: v * depth,
      };
    }, uSegs, vSegs, ref);
  }
  geos.push(face(1), face(-1));

  function side(signX) {
    return surfaceGeometry((u, v) => {
      const xx = signX * (halfW - (halfW - ridgeHalf) * v);
      return {
        x: xx,
        y: height * easeRoof(v) + cornerLift(u, v),
        z: -halfD * (1 - v) + 2 * halfD * (1 - v) * u,
        u: u * depth,
        v: v * width,
      };
    }, 18, vSegs, ref);
  }
  geos.push(side(1), side(-1));

  const merged = mergeSimple(geos);
  return { geometry: merged, ridgeHalf };
}

function skirtGeometry(wOuter, dOuter, wInner, dInner, height, lift, uSegs = 26, vSegs = 6) {
  const hwO = wOuter / 2, hdO = dOuter / 2;
  const hwI = wInner / 2, hdI = dInner / 2;
  const ref = new THREE.Vector3(0, height * 0.42, 0);
  const geos = [];
  const cornerLift = (u, v) => lift * Math.pow(1 - v, 2.6) * Math.pow(Math.abs(2 * u - 1), 6);

  function face(signZ) {
    return surfaceGeometry((u, v) => {
      const hw = hwO + (hwI - hwO) * v;
      return {
        x: -hw + 2 * hw * u,
        y: height * easeRoof(v) + cornerLift(u, v),
        z: signZ * (hdO + (hdI - hdO) * v),
        u: u * wOuter,
        v: v * dOuter,
      };
    }, uSegs, vSegs, ref);
  }
  geos.push(face(1), face(-1));
  function side(signX) {
    return surfaceGeometry((u, v) => {
      const hd = hdO + (hdI - hdO) * v;
      return {
        x: signX * (hwO + (hwI - hwO) * v),
        y: height * easeRoof(v) + cornerLift(u, v),
        z: -hd + 2 * hd * u,
        u: u * dOuter,
        v: v * wOuter,
      };
    }, 18, vSegs, ref);
  }
  geos.push(side(1), side(-1));
  return mergeSimple(geos);
}

function mergeSimple(geometries) {
  // small local merge utility (positions, normals, uvs, indices)
  let vCount = 0, iCount = 0;
  for (const g of geometries) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geometries) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const t = g.attributes.uv.array;
    const ix = g.index.array;
    pos.set(p, vo * 3);
    nor.set(n, vo * 3);
    uv.set(t, vo * 2);
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += g.attributes.position.count;
    io += ix.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

function eaveEdgeCurve(width, depth, lift, signZ) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push(V3(-width / 2 + width * u, lift * Math.pow(Math.abs(2 * u - 1), 6), signZ * depth / 2));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function sideEaveCurve(width, depth, lift, signX) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push(V3(signX * width / 2, lift * Math.pow(Math.abs(2 * u - 1), 6), -depth / 2 + depth * u));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function addRidgeTail(parent, ridgeHalf, height, z, dir, mat) {
  const pts = [
    V3(ridgeHalf + dir * 0.15, height + 0.35, z),
    V3(ridgeHalf + dir * 0.7, height + 1.15, z),
    V3(ridgeHalf + dir * 1.15, height + 1.55, z),
    V3(ridgeHalf + dir * 0.55, height + 1.5, z),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.25, 5, false), mat);
  mesh.castShadow = true;
  parent.add(mesh);
}

function addTinyBeast(parent, x, y, z, mat, s = 1) {
  const beast = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * s, 0), mat);
  beast.scale.set(1.6, 1.0, 1.0);
  beast.position.set(x, y, z);
  beast.castShadow = true;
  parent.add(beast);
}

export function createRoof({
  width, depth, height, lift = 1.8, ridgeRatio = 0.58,
  material, ridgeMaterial, fasciaMaterial,
  ridge = true, beasts = false, details = true, uSegs = 26, vSegs = 10,
}) {
  const group = new THREE.Group();
  const { geometry, ridgeHalf } = hipGeometry(width, depth, height, lift, ridgeRatio, uSegs, vSegs);
  const roof = new THREE.Mesh(geometry, material);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const ridgeMat = ridgeMaterial || material;
  const trimMat = fasciaMaterial || ridgeMat;
  if (details) {
    // eave edge trims (the long, gently upturned line)
    for (const s of [1, -1]) {
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(eaveEdgeCurve(width, depth, lift, s), 40, 0.16, 4, false),
        trimMat,
      );
      tube.position.y = -0.12;
      tube.castShadow = true;
      group.add(tube);
    }
    for (const s of [1, -1]) {
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(sideEaveCurve(width, depth, lift, s), 26, 0.16, 4, false),
        trimMat,
      );
      tube.position.y = -0.12;
      tube.castShadow = true;
      group.add(tube);
    }
    // four hip ridges
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const v = i / 6;
          const hx = width / 2 - (width / 2 - ridgeHalf) * v;
          const yy = height * easeRoof(v) + lift * Math.pow(1 - v, 3);
          pts.push(V3(sx * hx, yy + 0.22, sz * (depth / 2) * (1 - v)));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.22, 5, false), ridgeMat);
        tube.castShadow = true;
        group.add(tube);
      }
    }
  }
  if (ridge) {
    const ridgeBox = new THREE.Mesh(new THREE.BoxGeometry(ridgeHalf * 2 + 1.1, 0.75, 1.05), ridgeMat);
    ridgeBox.position.set(0, height + 0.38, 0);
    ridgeBox.castShadow = true;
    group.add(ridgeBox);
    if (details) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(ridgeHalf * 2 + 0.6, 0.32, 0.55), trimMat);
      cap.position.set(0, height + 0.87, 0);
      cap.castShadow = true;
      group.add(cap);
      addRidgeTail(group, ridgeHalf, height, 0, 1, ridgeMat);
      addRidgeTail(group, ridgeHalf, height, 0, -1, ridgeMat);
    }
    if (beasts) {
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          for (let k = 0; k < 2; k++) {
            const t = 0.24 + k * 0.12;
            const hx = width / 2 - (width / 2 - ridgeHalf) * t;
            addTinyBeast(group, sx * hx, height * easeRoof(t) + lift * Math.pow(1 - t, 3) + 0.25,
              sz * (depth / 2) * (1 - t), ridgeMat, 0.8);
          }
        }
      }
    }
  }
  group.userData.ridgeHalf = ridgeHalf;
  group.userData.height = height;
  return group;
}

export function createSkirtRoof({
  width, depth, innerWidth, innerDepth, height, lift = 1.2,
  material, ridgeMaterial, fasciaMaterial, capped = true,
}) {
  const group = new THREE.Group();
  const geometry = skirtGeometry(width, depth, innerWidth, innerDepth, height, lift);
  const roof = new THREE.Mesh(geometry, material);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  const ridgeMat = ridgeMaterial || material;
  const trimMat = fasciaMaterial || ridgeMat;
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(new THREE.TubeGeometry(eaveEdgeCurve(width, depth, lift, s), 40, 0.14, 4, false), trimMat);
    a.position.y = -0.1;
    group.add(a);
    const b = new THREE.Mesh(new THREE.TubeGeometry(sideEaveCurve(width, depth, lift, s), 26, 0.14, 4, false), trimMat);
    b.position.y = -0.1;
    group.add(b);
  }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const v = i / 5;
        const hx = width / 2 + (innerWidth / 2 - width / 2) * v;
        const hz = depth / 2 + (innerDepth / 2 - depth / 2) * v;
        const yy = height * easeRoof(v) + lift * Math.pow(1 - v, 3);
        pts.push(V3(sx * hx, yy + 0.2, sz * hz));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.2, 5, false), ridgeMat);
      group.add(tube);
    }
  }
  if (capped) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(innerWidth - 0.4, 0.35, innerDepth - 0.4), trimMat);
    cap.position.y = height - 0.25;
    group.add(cap);
  }
  return group;
}

/* ------------------------------------------------------------------
   Balustrades, stairs, columns
------------------------------------------------------------------- */

function railLine(parent, length, material, { x = 0, z = 0, axis = 'x', height = 1.05, spacing = 3.2 }) {
  const group = new THREE.Group();
  const n = Math.max(2, Math.round(length / spacing));
  const postW = 0.3;
  // bottom curb
  const curb = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? length : 0.4, 0.28, axis === 'x' ? 0.4 : length), material);
  curb.position.y = 0.14;
  curb.castShadow = true; curb.receiveShadow = true;
  group.add(curb);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? length : 0.17, 0.46, axis === 'x' ? 0.17 : length), material);
  panel.position.y = 0.49;
  panel.castShadow = true; panel.receiveShadow = true;
  group.add(panel);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? length : 0.29, 0.16, axis === 'x' ? 0.29 : length), material);
  rail.position.y = 0.99;
  rail.castShadow = true; rail.receiveShadow = true;
  group.add(rail);

  // Posts and their small spherical caps are instanced to keep the scene light.
  const postGeo = new THREE.BoxGeometry(postW, height, postW);
  const capGeo = new THREE.SphereGeometry(postW * 0.58, 7, 5);
  const posts = new THREE.InstancedMesh(postGeo, material, n + 1);
  const caps = new THREE.InstancedMesh(capGeo, material, n + 1);
  const dummy = new THREE.Object3D();
  for (let i = 0; i <= n; i++) {
    const t = -length / 2 + (length * i) / n;
    dummy.position.set(axis === 'x' ? t : 0, height / 2, axis === 'x' ? 0 : t);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    dummy.position.set(axis === 'x' ? t : 0, height + 0.12, axis === 'x' ? 0 : t);
    dummy.scale.set(1, 0.78, 1);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
  }
  posts.castShadow = true; posts.receiveShadow = true;
  caps.castShadow = true;
  group.add(posts, caps);
  group.position.set(x, 0, z);
  parent.add(group);
  return group;
}

export function createBalustrade({
  width, depth, material, height = 1.05, spacing = 3.4,
  sides = ['front', 'back', 'left', 'right'], y = 0,
}) {
  const g = new THREE.Group();
  if (sides.includes('front')) railLine(g, width, material, { z: depth / 2, axis: 'x', height, spacing });
  if (sides.includes('back')) railLine(g, width, material, { z: -depth / 2, axis: 'x', height, spacing });
  if (sides.includes('left')) railLine(g, depth, material, { x: -width / 2, axis: 'z', height, spacing });
  if (sides.includes('right')) railLine(g, depth, material, { x: width / 2, axis: 'z', height, spacing });
  g.position.y = y;
  return g;
}

export function createStairs({
  width, height, depth, steps = 9, material, x = 0, y = 0, z = 0,
  direction = 'south', rails = false,
}) {
  const g = new THREE.Group();
  const dir = direction === 'south' ? 1 : -1;
  const rise = height / steps;
  const run = depth / steps;
  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, h, run), material);
    step.position.set(0, h / 2, dir * (depth / 2 - run * (i + 0.5)));
    step.castShadow = true;
    step.receiveShadow = true;
    g.add(step);
  }
  if (rails) {
    const rampLength = Math.hypot(height, depth);
    const angle = Math.atan2(height, depth) * dir;
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, rampLength), material);
      cheek.position.set(s * (width / 2 + 0.1), height / 2 + 0.45, 0);
      cheek.rotation.x = angle;
      cheek.castShadow = true;
      g.add(cheek);
    }
  }
  g.position.set(x, y, z);
  return g;
}

export function createColumn({
  radius = 0.55, height = 8, material, baseMaterial, capMaterial,
  x = 0, y = 0, z = 0, segments = 16, capital = true,
}) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.45, radius * 1.55, 0.45, 8), baseMaterial || material);
  base.position.y = 0.225;
  base.castShadow = true; base.receiveShadow = true;
  g.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.89, radius, height, segments, 1), material);
  shaft.position.y = 0.45 + height / 2;
  shaft.castShadow = true; shaft.receiveShadow = true;
  g.add(shaft);
  if (capital) {
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.28, radius * 0.98, 0.28, 8), capMaterial || baseMaterial || material);
    c1.position.y = 0.45 + height + 0.14;
    c1.castShadow = true;
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.22, radius * 2.4), capMaterial || material);
    c2.position.y = 0.45 + height + 0.38;
    c2.castShadow = true;
    g.add(c2);
  }
  g.position.set(x, y, z);
  return g;
}

export function addBracketBand(parent, {
  width, depth, y, material, spacing = 2.4, thickness = 0.65,
}) {
  const matrices = [];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const addAt = (x, z, rot) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(1.5, 0.22, 0.5);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
    dummy.position.set(x, y - 0.38, z);
    dummy.scale.set(0.34, 0.72, 0.45);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
    dummy.position.set(x, y - 0.72, z);
    dummy.scale.set(0.85, 0.22, 0.58);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
  };
  const nx = Math.max(2, Math.round(width / spacing));
  for (let i = 0; i <= nx; i++) {
    const x = -width / 2 + (width * i) / nx;
    addAt(x, depth / 2 + thickness / 2, 0);
    addAt(x, -depth / 2 - thickness / 2, 0);
  }
  const nz = Math.max(2, Math.round(depth / spacing));
  for (let i = 1; i < nz; i++) {
    const z = -depth / 2 + (depth * i) / nz;
    addAt(width / 2 + thickness / 2, z, Math.PI / 2);
    addAt(-width / 2 - thickness / 2, z, Math.PI / 2);
  }
  const inst = new THREE.InstancedMesh(geo, material, matrices.length);
  for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.instanceMatrix.needsUpdate = true;
  parent.add(inst);
  return inst;
}

/* ------------------------------------------------------------------
   Fence + lantern + trees
------------------------------------------------------------------- */

export function createLantern({ scale = 1, material, capMaterial, glowMaterial, glowTexture, light = false }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55 * scale, 12, 10), material);
  body.scale.set(1, 0.82, 1);
  body.castShadow = true;
  g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 0.16, 8), capMaterial);
  top.position.y = 0.5 * scale;
  g.add(top);
  const bottom = top.clone();
  bottom.position.y = -0.5 * scale;
  g.add(bottom);
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55 * scale, 6), capMaterial);
  tassel.position.y = -0.86 * scale;
  g.add(tassel);
  if (glowTexture) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture, color: 0xffa45b, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4.4 * scale, 4.4 * scale, 1);
    g.add(sprite);
    g.userData.glow = sprite;
  }
  return g;
}

export function createStreetLamp({ height = 8, glowTexture, count = 2, arm = 1.5, poleMaterial = null, glowColor = 0xffd39a }) {
  const g = new THREE.Group();
  const poleMat = poleMaterial || new THREE.MeshStandardMaterial({ color: 0x313a3b, roughness: 0.55, metalness: 0.45 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, height, 8), poleMat);
  pole.position.y = height / 2;
  pole.castShadow = true;
  g.add(pole);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffe9c2, emissive: 0xffc36d, emissiveIntensity: 0.2, roughness: 0.35,
  });
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture, color: glowColor, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const heads = [];
  for (let i = 0; i < count; i++) {
    const side = count === 1 ? 1 : i === 0 ? -1 : 1;
    const x = side * arm;
    const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, arm * 2, 6), poleMat);
    armMesh.rotation.z = Math.PI / 2;
    armMesh.position.set(0, height - 0.4, 0);
    g.add(armMesh);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.28, 8), headMat);
    head.position.set(x, height - 0.35, 0);
    g.add(head);
    const spr = new THREE.Sprite(glowMat.clone());
    spr.position.set(x, height - 0.4, 0);
    spr.scale.set(3.2, 3.2, 1);
    g.add(spr);
    heads.push({ mesh: head, glow: spr, mat: headMat });
  }
  return { group: g, heads, height };
}

/**
 * Instanced colonnade — one draw call for shafts, bases and capitals.
 * positions: [{x, z, rotation?}]
 */
export function addInstancedColumns(parent, positions, {
  radius = 0.5, height = 8, material, baseMaterial, capMaterial, segments = 12,
}) {
  if (!positions.length) return null;
  const baseMat = baseMaterial || material;
  const capMat = capMaterial || material;
  const shaftGeo = new THREE.CylinderGeometry(radius * 0.9, radius, height, segments, 1);
  const baseGeo = new THREE.CylinderGeometry(radius * 1.4, radius * 1.5, 0.45, 8);
  const capGeo = new THREE.BoxGeometry(radius * 2.4, 0.25, radius * 2.4);
  const shaft = new THREE.InstancedMesh(shaftGeo, material, positions.length);
  const base = new THREE.InstancedMesh(baseGeo, baseMat, positions.length);
  const cap = new THREE.InstancedMesh(capGeo, capMat, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((p, i) => {
    dummy.rotation.set(0, p.rotation || 0, 0);
    dummy.position.set(p.x, height / 2 + 0.45, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    shaft.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 0.225, p.z);
    dummy.updateMatrix();
    base.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, height + 0.58, p.z);
    dummy.updateMatrix();
    cap.setMatrixAt(i, dummy.matrix);
  });
  shaft.castShadow = true; shaft.receiveShadow = true;
  base.castShadow = true; cap.castShadow = true;
  shaft.instanceMatrix.needsUpdate = true;
  base.instanceMatrix.needsUpdate = true;
  cap.instanceMatrix.needsUpdate = true;
  parent.add(base, shaft, cap);
  return { shaft, base, cap };
}

// set by world to avoid circular imports
let lanternPoleMaterial = null;
export function setLampMaterial(mat) { lanternPoleMaterial = mat; }

export function createTreeGeometrySet() {
  return {
    trunk: new THREE.CylinderGeometry(0.16, 0.3, 3.8, 6),
    blob: new THREE.IcosahedronGeometry(1, 0),
    blob2: new THREE.IcosahedronGeometry(0.72, 0),
  };
}

/* ------------------------------------------------------------------
   Simple pavilion used for the Forbidden City backdrop and gates
------------------------------------------------------------------- */

export function createSimpleHall({
  width, depth, height, roofHeight, material, roofMaterial, ridgeMaterial,
  redWallMaterial, platformMaterial, latticeMaterial, roofType = 'hip',
  columns = true, platformHeight = 1.4, lift = 1.6, doubleRoof = false,
}) {
  const g = new THREE.Group();
  if (platformHeight > 0) {
    addBox(g, width + 5, platformHeight, depth + 5, platformMaterial, 0, platformHeight / 2, 0);
    addBox(g, width + 7, 0.28, depth + 7, platformMaterial, 0, 0.14, 0);
  }
  const baseY = platformHeight;
  // body
  addBox(g, width, height, depth, redWallMaterial, 0, baseY + height / 2, 0);
  // column rhythm on the facade
  if (columns) {
    const n = Math.max(3, Math.round(width / 5));
    for (let i = 0; i <= n; i++) {
      const x = -width / 2 + 1.2 + (width - 2.4) * (i / n);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, height * 0.92, 8), material);
      c.position.set(x, baseY + height * 0.46, depth / 2 + 0.45);
      c.castShadow = true;
      g.add(c);
    }
  }
  // frieze band
  addBox(g, width + 1.2, 0.7, depth + 1.2, latticeMaterial || material, 0, baseY + height + 0.35, 0);
  if (doubleRoof) {
    const lower = createSkirtRoof({
      width: width + 8, depth: depth + 8, innerWidth: width - 2, innerDepth: depth - 2,
      height: roofHeight * 0.44, lift, material: roofMaterial, ridgeMaterial,
    });
    lower.position.y = baseY + height + 0.7;
    g.add(lower);
    const upper = createRoof({
      width: width + 2, depth: depth + 2, height: roofHeight * 0.76, lift,
      material: roofMaterial, ridgeMaterial,
    });
    upper.position.y = baseY + height + roofHeight * 0.38 + 1.2;
    g.add(upper);
  } else {
    const r = createRoof({
      width: width + 8, depth: depth + 8, height: roofHeight, lift,
      material: roofMaterial, ridgeMaterial,
    });
    r.position.y = baseY + height + 0.7;
    g.add(r);
  }
  return g;
}

/* ------------------------------------------------------------------
   Material helpers
------------------------------------------------------------------- */

export function makeRoofMaterialFrom(base, color) {
  const m = base.clone();
  if (color !== undefined) m.color.set(color);
  return m;
}

export function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}
