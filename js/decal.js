import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

/* ====================================================================
   addClickForMore(model, options)

   Applica al modello 3D una scritta ("Click for more") che ne segue la superficie
   e ne fa parte (è un figlio del modello, quindi ruota e scala con lui).

   - funziona con QUALSIASI Object3D (modelli procedurali o .glb caricati in futuro)
   - la posizione è casuale (punto scelto a caso sulla superficie, pesato per area)
   - la superficie coperta non supera mai `maxRatio` (20%) dell'area totale del modello
   - il colore del testo (nero/bianco) si adatta al colore della superficie sotto
   ==================================================================== */
export function addClickForMore(model, options = {}) {
  const {
    text = 'Click for more',
    areaRatio = 0.05,   // area che si cerca di coprire
    maxRatio = 0.2,     // limite massimo assoluto (20%)
    aspect = 4,         // larghezza / altezza del testo
    tries = 16,         // tentativi di posizionamento (si riducono sui modelli molto pesanti)
  } = options;

  // 1. lavoro con il modello "a riposo" (identità), così la geometria del decal
  //    è espressa nello spazio locale del modello e ruota con lui.
  const saved = { p: model.position.clone(), q: model.quaternion.clone(), s: model.scale.clone() };
  model.position.set(0, 0, 0); model.quaternion.identity(); model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);

  try {
    // 2. raccolgo le mesh e le aree dei loro triangoli (nello spazio del modello)
    const parts = [];
    let totalArea = 0;
    const box = new THREE.Box3();
    model.traverse((o) => {
      if (!o.isMesh || o.userData.isDecal || !o.geometry || !o.geometry.attributes.position) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      const part = analyseMesh(o);
      if (part.total > 0) { parts.push(part); totalArea += part.total; }
    });
    if (!parts.length) return null;
    box.setFromObject(model);
    const dim = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(dim.x, dim.y, dim.z);

    // 3. dimensioni del decal: area = areaRatio * area totale (mai oltre maxRatio)
    const ratio = Math.min(areaRatio, maxRatio * 0.6);
    const target = ratio * totalArea;
    let w = Math.sqrt(target * aspect);
    w = Math.min(w, maxDim * 0.6);
    const h = w / aspect;
    const depth = Math.max(w, h) * 0.5;
    const size = new THREE.Vector3(w, h, depth);

    // 4. provo posizioni casuali finché la scritta aderisce bene alla superficie
    const heavy = parts.reduce((n, p) => n + p.triCount, 0) > 200000;
    const maxTries = heavy ? Math.min(tries, 5) : tries;
    let best = null;
    for (let i = 0; i < maxTries; i++) {
      const sample = samplePoint(parts, totalArea);
      const orientation = orientationFor(sample.normal);
      let geo;
      try { geo = new DecalGeometry(sample.part.mesh, sample.position, orientation, size); }
      catch (e) { continue; }
      if (!geo.attributes.position || geo.attributes.position.count < 3) { geo.dispose(); continue; }
      const covered = geometryArea(geo);
      const fits = covered <= maxRatio * totalArea;
      const good = covered >= 0.8 * w * h;       // la scritta non deve uscire dal bordo della superficie
      const cand = { geo, sample, covered, fits, good };
      if (fits && good) { if (best) best.geo.dispose(); best = cand; break; }
      if (fits && (!best || covered > best.covered)) { if (best) best.geo.dispose(); best = cand; }
      else geo.dispose();
    }
    if (!best) return null;

    // 5. materiale con la scritta (Helvetica) del colore che contrasta con la superficie
    const dark = luminance(best.sample.color) < 0.35;
    const texture = makeTextTexture(text, dark ? '#ffffff' : '#000000', aspect);
    const material = new THREE.MeshStandardMaterial({
      map: texture, transparent: true, roughness: 0.6, metalness: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const decal = new THREE.Mesh(best.geo, material);
    decal.userData.isDecal = true;
    decal.renderOrder = 2;
    model.add(decal);
    return { mesh: decal, coveredRatio: best.covered / totalArea };
  } finally {
    model.position.copy(saved.p); model.quaternion.copy(saved.q); model.scale.copy(saved.s);
    model.updateMatrixWorld(true);
  }
}

/* ---------- utilità ---------- */

function analyseMesh(mesh) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const cum = new Float32Array(triCount);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const [i0, i1, i2] = triIndices(idx, t);
    a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
    total += b.clone().sub(a).cross(c.clone().sub(a)).length() * 0.5;
    cum[t] = total;
  }
  return { mesh, cum, total, triCount, normalMatrix: new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld) };
}

function triIndices(idx, t) {
  return idx ? [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)] : [t * 3, t * 3 + 1, t * 3 + 2];
}

function samplePoint(parts, totalArea) {
  // mesh scelta in proporzione alla sua area
  let r = Math.random() * totalArea;
  let part = parts[parts.length - 1];
  for (const p of parts) { if (r <= p.total) { part = p; break; } r -= p.total; }
  // triangolo scelto in proporzione alla sua area (ricerca binaria)
  const target = Math.random() * part.total;
  let lo = 0, hi = part.triCount - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (part.cum[mid] < target) lo = mid + 1; else hi = mid; }
  const g = part.mesh.geometry;
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
  const [i0, i1, i2] = triIndices(g.index, lo);
  // coordinate baricentriche casuali
  let u = Math.random(), v = Math.random();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  const w = 1 - u - v;
  const mix = (attr, size) => {
    const out = [];
    for (let k = 0; k < size; k++) out.push(attr.getComponent(i0, k) * w + attr.getComponent(i1, k) * u + attr.getComponent(i2, k) * v);
    return out;
  };
  const p = mix(pos, 3);
  const position = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(part.mesh.matrixWorld);
  const n = mix(nor, 3);
  const normal = new THREE.Vector3(n[0], n[1], n[2]).applyMatrix3(part.normalMatrix).normalize();
  let color;
  if (col) { const cc = mix(col, 3); color = new THREE.Color(cc[0], cc[1], cc[2]); }
  else {
    const m = Array.isArray(part.mesh.material) ? part.mesh.material[0] : part.mesh.material;
    color = m && m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
  }
  return { part, position, normal, color };
}

/* Orientamento del decal: +Z lungo la normale, "su" = asse Y del modello (con una piccola rotazione casuale) */
function orientationFor(normal) {
  const z = normal.clone().normalize();
  let up = new THREE.Vector3(0, 1, 0);
  let y = up.clone().sub(z.clone().multiplyScalar(up.dot(z)));
  if (y.length() < 0.25) { up = new THREE.Vector3(1, 0, 0); y = up.clone().sub(z.clone().multiplyScalar(up.dot(z))); }
  y.normalize();
  const roll = (Math.random() - 0.5) * THREE.MathUtils.degToRad(50);
  y.applyAxisAngle(z, roll);
  const x = y.clone().cross(z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Euler().setFromRotationMatrix(m);
}

function geometryArea(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  return area;
}

function luminance(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

function makeTextTexture(text, color, aspect) {
  const W = 1024, H = Math.round(W / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const family = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  let px = H * 0.62;
  ctx.font = `700 ${px}px ${family}`;
  const maxW = W * 0.92;
  const m = ctx.measureText(text).width;
  if (m > maxW) px *= maxW / m;
  ctx.font = `700 ${px}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + px * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
