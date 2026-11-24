import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ============ Modelli procedurali (placeholder) ============ */
export function buildBanana() {
  const along = 80, around = 40;
  const R = 1.7;
  const arc = THREE.MathUtils.degToRad(75);
  const positions = [], colors = [], indices = [];
  const yellow = new THREE.Color(0xf6d12b);
  const green = new THREE.Color(0x8a8d2a);
  const brown = new THREE.Color(0x3b2a14);
  const c = new THREE.Color();

  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const a = THREE.MathUtils.lerp(-arc, arc, t);
    const cx = R * Math.sin(a), cy = R * Math.cos(a) - R * 0.75;
    const N = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
    const B = new THREE.Vector3(0, 0, 1);

    const body = 0.46 * Math.pow(Math.sin(Math.PI * t), 0.3);
    let r = t < 0.5 ? THREE.MathUtils.lerp(0.12, body, THREE.MathUtils.smoothstep(t, 0.04, 0.24)) : body;
    if (i === 0 || i === along) r = 0;

    if (t < 0.07) c.copy(green);
    else if (t < 0.2) c.copy(green).lerp(yellow, (t - 0.07) / 0.13);
    else if (t > 0.965) c.copy(brown);
    else c.copy(yellow);

    for (let j = 0; j < around; j++) {
      const th = (j / around) * Math.PI * 2;
      const rr = r * (1 - 0.09 * Math.cos(5 * th));
      const p = new THREE.Vector3(cx, cy, 0)
        .addScaledVector(N, rr * Math.cos(th))
        .addScaledVector(B, rr * Math.sin(th));
      positions.push(p.x, p.y, p.z);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + (j + 1) % around;
      const c2 = (i + 1) * around + j;
      const d = (i + 1) * around + (j + 1) % around;
      indices.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }));
}

export function buildApple() {
  const group = new THREE.Group();

  // Corpo: sfera deformata (più larga in alto, con le fossette del picciolo e della base)
  const g = new THREE.SphereGeometry(1, 72, 54);
  const pos = g.attributes.position;
  const colors = [];
  const red = new THREE.Color(0xc8141c);
  const lightRed = new THREE.Color(0xe2492f);
  const gold = new THREE.Color(0xd9b03a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r2 = x * x + z * z;
    const phi = Math.atan2(z, x);
    const rad = (1 + 0.12 * y) * (1 + 0.035 * Math.cos(5 * phi) * (1 - Math.abs(y)));
    let ny = y * 0.88;
    if (y > 0) ny -= 0.34 * Math.exp(-r2 / 0.1);   // fossetta in alto
    else ny += 0.18 * Math.exp(-r2 / 0.08);        // fossetta in basso
    pos.setXYZ(i, x * rad, ny, z * rad);

    c.copy(red).lerp(lightRed, THREE.MathUtils.clamp(0.5 + 0.5 * Math.sin(phi * 3 + y * 2), 0, 1) * 0.5);
    if (y > 0.75) c.lerp(gold, (y - 0.75) / 0.25 * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 })));

  // Picciolo
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, 0.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.8 })
  );
  stem.position.set(0.04, 0.82, 0);
  stem.rotation.z = -0.18;
  group.add(stem);

  // Foglia
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x3f8f2e, roughness: 0.6 })
  );
  leaf.scale.set(0.3, 0.03, 0.13);
  leaf.position.set(0.28, 0.98, 0);
  leaf.rotation.z = 0.35;
  group.add(leaf);

  group.scale.setScalar(1.45);
  group.position.y = -0.1;
  return group;
}



/* Modelli "builtin" disponibili per nome */
export const BUILTIN = { banana: buildBanana, apple: buildApple };

/* ============ Caricamento di un modello da una specifica del content.json ============
   { kind: 'builtin', name: 'banana' }  oppure  { kind: 'glb', src: 'assets/models/file.glb' }
   Restituisce sempre un Object3D centrato in (0,0,0) e di dimensioni confrontabili (max ~3.2 unità). */
export async function loadModel(spec) {
  if (spec && spec.kind === 'glb' && spec.src) {
    const gltf = await new GLTFLoader().loadAsync(spec.src);
    const inner = gltf.scene;
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const k = 3.2 / Math.max(size.x, size.y, size.z || 1, 1e-6);
    inner.position.sub(center);                 // centra
    const holder = new THREE.Group();
    holder.add(inner);
    holder.scale.setScalar(k);                   // scala
    const root = new THREE.Group();
    root.add(holder);
    return root;
  }
  const name = (spec && spec.name) || 'banana';
  return (BUILTIN[name] || buildBanana)();
}
