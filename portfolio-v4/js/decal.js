import * as THREE from 'three';

/* ====================================================================
   addClickForMore(model, options)

   Aggiunge al modello 3D una scritta ("CLICKME") rosso sangue che LO SEGUE SEMPRE
   (è figlia del modello: ruota e scala con lui) ma resta SOLLEVATA dalla superficie, come un'etichetta che fluttua.

   - funziona con QUALSIASI Object3D (modelli procedurali o .glb caricati in futuro)
   - dimensione: l'etichetta ha un'area di circa il 20% della superficie del modello (limitata alla sagoma del modello)
   - posizione casuale, ma scelta solo dove si vede: superficie rivolta verso l'esterno, nessuna parte del modello davanti,
     e distanza dalla superficie sufficiente perché l'etichetta non la attraversi
   ==================================================================== */
export function addClickForMore(model, options = {}) {
  const {
    text = 'CLICKME',
    color = '#b30000',        // rosso sangue pieno
    areaRatio = 0.2,
    aspect = 3.6,             // larghezza / altezza
    tries = 40,               // tentativi per ogni dimensione provata
    budgetMs = 1200,
  } = options;

  const saved = { p: model.position.clone(), q: model.quaternion.clone(), s: model.scale.clone() };
  model.position.set(0, 0, 0); model.quaternion.identity(); model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);
  try {
    const parts = [];
    let totalArea = 0;
    model.traverse((o) => {
      if (!o.isMesh || o.userData.isLabel || !o.geometry || !o.geometry.attributes.position) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      const part = analyseMesh(o);
      if (part.total > 0) { parts.push(part); totalArea += part.total; }
    });
    if (!parts.length) return null;
    const dim = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const maxDim = Math.max(dim.x, dim.y, dim.z);
    const far = maxDim * 2 + 1;
    const raycaster = new THREE.Raycaster();
    const t0 = performance.now();
    const probes = [[0, 0], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]];

    let best = null;
    const ladder = [1, 0.8, 0.64, 0.5, 0.4];
    search:
    for (const f of ladder) {
      const w = Math.min(Math.sqrt(areaRatio * f * totalArea * aspect), maxDim * 0.75);
      const h = w / aspect;
      const lift = Math.max(h * 0.45, maxDim * 0.05);               // altezza minima dell'etichetta sopra la superficie
      for (let i = 0; i < tries; i++) {
        if (best && performance.now() - t0 > budgetMs) break search;
        const s = samplePoint(parts, totalArea);
        if (Math.abs(s.normal.y) > 0.4) continue;                    // solo sui fianchi: ruotando attorno all'asse verticale l'etichetta passa davanti all'osservatore
        const o = orientationFor(s.normal);
        // sulla superficie sotto l'etichetta: 5 raggi che arrivano da fuori lungo -normale
        let violation = -Infinity, ok = true;
        for (const [fx, fy] of probes) {
          const q = s.position.clone().addScaledVector(o.x, fx * w).addScaledVector(o.y, fy * h);
          raycaster.set(q.clone().addScaledVector(s.normal, far), s.normal.clone().negate());
          const hit = raycaster.intersectObject(model, true)[0];
          if (!hit) { ok = false; break; }                          // l'etichetta sporgerebbe oltre la sagoma
          if (fx === 0 && fy === 0 && hit.object !== s.part.mesh) { ok = false; break; }   // il centro è coperto da un'altra parte
          violation = Math.max(violation, hit.point.clone().sub(s.position).dot(s.normal) - lift * 0.6);
        }
        if (!ok) continue;
        const cand = { s, o, w, h, lift, violation, f };
        if (!best || violation < best.violation) best = cand;
        if (violation <= 0) break search;                           // posizione perfetta
      }
    }
    if (!best) return null;
    const lift = best.lift + Math.max(0, best.violation) + best.h * 0.1;

    const material = new THREE.MeshBasicMaterial({
      map: makeTextTexture(text, color, aspect), transparent: true, side: THREE.FrontSide,
      depthWrite: false, toneMapped: false,
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(best.w, best.h), material);
    label.userData.isLabel = true;
    label.renderOrder = 3;
    label.position.copy(best.s.position).addScaledVector(best.s.normal, lift);
    label.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(best.o.x, best.o.y, best.s.normal));
    model.add(label);
    return { mesh: label, coveredRatio: (best.w * best.h) / totalArea };
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
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, uvAttr = g.attributes.uv;
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
  return { part, position, normal };
}

/* Orientamento dell'etichetta: +Z lungo la normale, "su" = asse Y del modello (con una piccola rotazione casuale) */
function orientationFor(normal) {
  const z = normal.clone().normalize();
  let up = new THREE.Vector3(0, 1, 0);
  let y = up.clone().sub(z.clone().multiplyScalar(up.dot(z)));
  if (y.length() < 0.25) { up = new THREE.Vector3(1, 0, 0); y = up.clone().sub(z.clone().multiplyScalar(up.dot(z))); }
  y.normalize();
  y.applyAxisAngle(z, (Math.random() - 0.5) * THREE.MathUtils.degToRad(30));
  const x = y.clone().cross(z).normalize();
  return { x, y, z };
}

function makeTextTexture(text, color, aspect) {
  const W = 1024, H = Math.round(W / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const family = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  let px = H * 0.78;
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

