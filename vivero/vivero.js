// Vivero en 3D — Amazonía Emprende
// El modelo (vivero.glb) y la posición de mesas y camas (disposicion.json) salen de
// fuente-3d/vivero_blender.py. Aquí se ponen texturas, bandejas, plántulas, luz y controles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

const $ = (id) => document.getElementById(id);
const movil = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

// ───────────────────────── render, escena, cámara ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, movil ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('lienzo').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d3cf, 90, 420);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 2000);
camera.position.set(62, 36, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(16, 0, -18);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.6;
controls.maxDistance = 220;

// ───────────────────────── cielo, sol y hora del día ─────────────────────────
const sky = new Sky();
sky.scale.setScalar(4000);
scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 7;
su.rayleigh.value = 1.4;
su.mieCoefficient.value = 0.004;
su.mieDirectionalG.value = 0.82;

const CENTRO = new THREE.Vector3(16, 0, -18);
const sol = new THREE.DirectionalLight(0xffffff, 3);
sol.castShadow = true;
sol.shadow.mapSize.setScalar(movil ? 2048 : 4096);
Object.assign(sol.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 260 });
sol.shadow.bias = -0.0003;
sol.shadow.normalBias = 0.03;
sol.target.position.copy(CENTRO);
scene.add(sol, sol.target);
const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x6b5a42, 1);
scene.add(hemi);

const pmrem = new THREE.PMREMGenerator(renderer);
const escenaCielo = new THREE.Scene();
let envRT = null;
const dirSol = new THREE.Vector3();
const cTibio = new THREE.Color(0xffb36b), cDia = new THREE.Color(0xfff6ea);

function ponerHora(h, conEntorno = true) {
  const t = THREE.MathUtils.clamp((h - 6) / 12, 0, 1);
  // Florencia está casi en el ecuador: el sol pasa alto. Sale por +x (oriente).
  dirSol.set(Math.cos(t * Math.PI), Math.max(0.03, Math.sin(t * Math.PI)), 0.22).normalize();
  su.sunPosition.value.copy(dirSol);
  sol.position.copy(dirSol).multiplyScalar(120).add(CENTRO);
  const alto = Math.sin(t * Math.PI);
  sol.intensity = 0.4 + 2.9 * Math.min(1, alto * 1.6);
  sol.color.copy(cTibio).lerp(cDia, Math.min(1, alto * 1.8));
  hemi.intensity = 0.35 + 0.75 * Math.min(1, alto * 1.5);
  renderer.toneMappingExposure = 0.62 + 0.28 * Math.min(1, alto * 2);
  scene.fog.color.setHSL(0.36, 0.08, 0.45 + 0.35 * Math.min(1, alto * 1.5));
  if (conEntorno) {
    scene.remove(sky); escenaCielo.add(sky);
    const nuevo = pmrem.fromScene(escenaCielo, 0.02);
    escenaCielo.remove(sky); scene.add(sky);
    if (envRT) envRT.dispose();
    envRT = nuevo;
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.45 + 0.4 * alto;
  }
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  $('horaTxt').textContent = `${hh}:${String(mm).padStart(2, '0')}`;
}
$('hora').addEventListener('input', (e) => ponerHora(+e.target.value, false));
$('hora').addEventListener('change', (e) => ponerHora(+e.target.value, true));

// ───────────────────────── texturas dibujadas (sin imágenes) ─────────────────────────
let semilla = 7;
const rnd = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; };
const sembrar = (s) => { semilla = ((s * 2654435761) % 2147483646) + 1; for (let i = 0; i < 4; i++) rnd(); };
const entre = (a, b) => a + (b - a) * rnd();
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];
const aniso = renderer.capabilities.getMaxAnisotropy();

function tex(w, h, dibujar, { metros = 1, color = true, repetir = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  dibujar(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / metros, 1 / metros); }
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function motas(g, w, h, n, colores, rmin, rmax, alfa = 1) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alfa;
    g.fillStyle = elegir(colores);
    const x = rnd() * w, y = rnd() * h, r = entre(rmin, rmax);
    for (const dx of [0, -w, w]) for (const dy of [0, -h, h]) {
      g.beginPath(); g.ellipse(x + dx, y + dy, r, r * entre(0.6, 1), rnd() * 3, 0, 7); g.fill();
    }
  }
  g.globalAlpha = 1;
}
function hebras(g, w, h, n, colores, largo, grosor) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    g.strokeStyle = elegir(colores); g.lineWidth = grosor * entre(0.6, 1.2);
    const x = rnd() * w, y = rnd() * h, a = -Math.PI / 2 + entre(-0.6, 0.6), l = largo * entre(0.5, 1.2);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

const TEX = {
  Grava: tex(512, 512, (g, w, h) => {
    g.fillStyle = '#7d6250'; g.fillRect(0, 0, w, h);
    motas(g, w, h, 900, ['#5a4537', '#4e3b2f'], 4, 9, 0.6);
    motas(g, w, h, 2600, ['#a3826a', '#8b6c57', '#b8987d', '#6e5444', '#c6aa8d', '#94735c', '#a48d78'], 3, 7);
  }, { metros: 1.1 }),
  Pasto: tex(512, 512, (g, w, h) => {
    g.fillStyle = '#4a6a28'; g.fillRect(0, 0, w, h);
    motas(g, w, h, 60, ['#3d5c20', '#58792f', '#4f7027'], 30, 70, 0.35);
    hebras(g, w, h, 7000, ['#3f6020', '#5b7f2e', '#6a8d36', '#35531b', '#7a9a40'], 9, 1.6);
  }, { metros: 2.5 }),
  Tierra_seca: tex(512, 512, (g, w, h) => {
    g.fillStyle = '#8c7553'; g.fillRect(0, 0, w, h);
    motas(g, w, h, 80, ['#7a6447', '#9c8560'], 25, 60, 0.4);
    hebras(g, w, h, 5000, ['#b39d72', '#6d5a3c', '#a48c62', '#c2ad83', '#7e6a49'], 10, 1.4);
  }, { metros: 3 }),
  Via: tex(512, 512, (g, w, h) => {
    g.fillStyle = '#9a7558'; g.fillRect(0, 0, w, h);
    motas(g, w, h, 3000, ['#8a6649', '#a98466', '#7c5c42', '#b59478'], 1.5, 4);
  }, { metros: 3 }),
  Barro: tex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a2f20'; g.fillRect(0, 0, w, h);
    motas(g, w, h, 300, ['#2f2619', '#4a3c28', '#3d4a24'], 4, 14, 0.6);
  }, { metros: 3 }),
  Madera: tex(256, 256, (g, w, h) => {
    g.fillStyle = '#b08458'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = `rgba(${90 + rnd() * 40},${55 + rnd() * 25},${30 + rnd() * 15},${0.08 + rnd() * 0.18})`;
      g.fillRect(0, y, w, 1 + rnd() * 2);
    }
    for (let y = 0; y < h; y += 64) { g.fillStyle = 'rgba(40,25,12,.55)'; g.fillRect(0, y, w, 2); }
    motas(g, w, h, 6, ['rgba(70,45,22,.6)'], 3, 6);
  }, { metros: 1 }),
  Sustrato: tex(256, 256, (g, w, h) => {
    g.fillStyle = '#35281c'; g.fillRect(0, 0, w, h);
    motas(g, w, h, 900, ['#2a1f15', '#46362a', '#3f3022'], 1, 3);
    motas(g, w, h, 220, ['#4f6b2c', '#6b8a3a', '#5a7a2f', '#3f5a22'], 3, 11, 0.85);
  }, { metros: 0.9 }),
  Lamina_oxidada: tex(256, 64, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const s = 0.5 + 0.5 * Math.sin(x / w * Math.PI * 2 * 12);
      g.fillStyle = `rgb(${70 + 45 * s},${38 + 22 * s},${24 + 12 * s})`; g.fillRect(x, 0, 1, h);
    }
    motas(g, w, h, 60, ['rgba(140,70,30,.5)', 'rgba(50,30,20,.5)'], 2, 8);
  }, { metros: 2 }),
  Polisombra_negra: tex(128, 128, (g, w, h) => {
    g.fillStyle = '#1a1b1b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 4) { g.fillStyle = 'rgba(80,82,82,.45)'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
  }, { metros: 0.25 }),
  Polisombra_arco: tex(128, 128, (g, w, h) => {
    g.fillStyle = '#8e9192'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 4) { g.fillStyle = 'rgba(40,42,42,.35)'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
  }, { metros: 0.25 }),
};

// Agujeros de la malla para la sombra: deja pasar parte del sol, como la polisombra real.
function agujeros(paso) {
  return tex(64, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (rnd() > paso) g.fillRect(x, y, 2, 2);
  }, { metros: 0.35, color: false });
}

function materialDe(nombre, original) {
  const m = new THREE.MeshStandardMaterial({
    color: original.color, roughness: original.roughness, metalness: original.metalness,
  });
  m.name = nombre;
  if (TEX[nombre]) { m.map = TEX[nombre]; m.color.set(0xffffff); }
  switch (nombre) {
    case 'Polisombra_negra':
      Object.assign(m, { transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false });
      break;
    case 'Polisombra_arco':
      Object.assign(m, { transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
      break;
    case 'Agua':
      m.color.set(0x24332d); m.roughness = 0.06; m.metalness = 0.1; m.envMapIntensity = 1.4;
      break;
    case 'Hoja_platano': case 'Follaje': case 'Follaje_claro':
      m.side = THREE.DoubleSide; m.flatShading = true;
      break;
    case 'Lamina_oxidada': case 'Techo_rojo':
      m.side = THREE.DoubleSide;
      break;
  }
  return m;
}

// ───────────────────────── carga ─────────────────────────
const carga = $('carga');
function progreso(f) { $('cargaBarra').style.width = `${Math.round(f * 100)}%`; }
function fallo(msg) { carga.classList.add('error'); $('cargaTxt').textContent = msg; }

const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);

const [gltf, D] = await Promise.all([
  loader.loadAsync('vivero.glb', (e) => e.total && progreso(0.9 * e.loaded / e.total)),
  fetch('disposicion.json').then((r) => r.json()),
]).catch((e) => { console.error(e); fallo('No se pudo cargar el modelo. Recarga la página.'); throw e; });

const cache = {};
const colisiones = [];
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const n = o.material.name;
  o.material = cache[n] || (cache[n] = materialDe(n, o.material));
  const esMalla = n.startsWith('Polisombra');
  o.castShadow = !['Pasto', 'Piso_grava', 'Via', 'Agua', 'Barro', 'Tierra_seca'].includes(n) && !esMalla;
  o.receiveShadow = !esMalla;
  if (esMalla) {
    // la malla da sombra parcial: profundidad con agujeros
    o.castShadow = true;
    o.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, alphaMap: agujeros(n === 'Polisombra_arco' ? 0.6 : 0.55),
      alphaTest: 0.5, side: THREE.DoubleSide,
    });
    o.renderOrder = n === 'Polisombra_arco' ? 2 : 1;
  }
});
scene.add(gltf.scene);

// ───────────────────────── bandejas y plántulas ─────────────────────────
const BANDEJA = { x: 0.4, z: 0.6, alto: 0.12, cx: 5, cz: 8 };
const texTapa = tex(160, 240, (g, w, h) => {
  g.fillStyle = '#262626'; g.fillRect(0, 0, w, h);
  const sx = w / BANDEJA.cx, sz = h / BANDEJA.cz;
  for (let i = 0; i < BANDEJA.cx; i++) for (let j = 0; j < BANDEJA.cz; j++) {
    g.fillStyle = '#0d0d0d'; g.beginPath(); g.arc((i + 0.5) * sx, (j + 0.5) * sz, sx * 0.38, 0, 7); g.fill();
    g.fillStyle = '#3b2b1e'; g.beginPath(); g.arc((i + 0.5) * sx, (j + 0.5) * sz, sx * 0.27, 0, 7); g.fill();
  }
}, { repetir: false });
const texLado = tex(256, 64, (g, w, h) => {
  g.fillStyle = '#202020'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 4; i++) {           // las "patas" de la bandeja
    const x = 18 + i * 60;
    g.beginPath(); g.moveTo(x, h); g.lineTo(x, h * 0.55); g.arc(x + 20, h * 0.55, 20, Math.PI, 0); g.lineTo(x + 40, h); g.fill();
  }
}, { repetir: false });
const matLado = new THREE.MeshStandardMaterial({ map: texLado, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
const matTapa = new THREE.MeshStandardMaterial({ map: texTapa, roughness: 0.75 });
const geoBandeja = new THREE.BoxGeometry(BANDEJA.x, BANDEJA.alto, BANDEJA.z);

// hoja: textura en escala de gris claro; el color lo da cada plántula
const texHoja = tex(64, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, '#d9e4c4'); grad.addColorStop(1, '#f4f8ea');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(w / 2, h); g.bezierCurveTo(-w * 0.05, h * 0.6, w * 0.12, h * 0.15, w / 2, 0);
  g.bezierCurveTo(w * 0.88, h * 0.15, w * 1.05, h * 0.6, w / 2, h); g.fill();
  g.strokeStyle = 'rgba(120,140,90,.8)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 4); g.stroke();
  g.lineWidth = 1;
  for (let k = 1; k < 6; k++) {
    const y = h - k * h / 6.5;
    g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w * 0.2, y - 10); g.moveTo(w / 2, y); g.lineTo(w * 0.8, y - 10); g.stroke();
  }
}, { repetir: false });

// planta normalizada a 1 m de alto; hojas en espiral que miran hacia arriba
function geoPlanta(nHojas, anchoHoja, largoHoja, inclin) {
  const pos = [], uv = [], idx = [];
  const quad = (base, dir, lado, l, w) => {
    const i0 = pos.length / 3;
    const p = [base.clone().addScaledVector(lado, -w / 2), base.clone().addScaledVector(lado, w / 2),
               base.clone().addScaledVector(dir, l).addScaledVector(lado, w / 2), base.clone().addScaledVector(dir, l).addScaledVector(lado, -w / 2)];
    p.forEach((v) => pos.push(v.x, v.y, v.z));
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  // tallo: dos cintas cruzadas
  quad(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 0.75, 0.025);
  for (let k = 0; k < nHojas; k++) {
    const a = k * 2.4 + 0.3;
    const y = 0.35 + 0.65 * (k / Math.max(1, nHojas - 1));
    const sale = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const inc = inclin * (1 - 0.6 * k / nHojas);
    const dir = sale.clone().multiplyScalar(Math.cos(inc)).add(new THREE.Vector3(0, Math.sin(inc), 0)).normalize();
    const lado = new THREE.Vector3(-sale.z, 0, sale.x);
    quad(new THREE.Vector3(0, y * 0.75, 0), dir, lado, largoHoja, anchoHoja);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // normales hacia arriba: las hojas se iluminan parejo por ambas caras
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  return geo;
}

const TIPOS = [
  { nombre: 'joven', h: [0.10, 0.17], geo: geoPlanta(movil ? 4 : 5, 0.2, 0.36, 0.55),
    colores: ['#2f5a1e', '#3b6b25', '#2a4f1a', '#46752a'] },
  { nombre: 'media', h: [0.18, 0.28], geo: geoPlanta(movil ? 5 : 6, 0.2, 0.36, 0.6),
    colores: ['#4a7a2a', '#5b8a30', '#3f6d22', '#527f2c'] },
  { nombre: 'crecida', h: [0.28, 0.45], geo: geoPlanta(movil ? 5 : 7, 0.26, 0.36, 0.45),
    colores: ['#8fae3a', '#a6bf4a', '#6f9a33', '#c2c860', '#7da83a', '#b5b84e'] },
];
const matPlanta = new THREE.MeshStandardMaterial({ map: texHoja, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });

const bandejas = [];
const plantas = TIPOS.map(() => []);
for (const [i, m] of D.mesas.entries()) {
  sembrar(1000 + i * 31);
  const tipo = (m.nave + m.col * 2 + Math.floor((-m.z) / 9)) % 3;
  const vacia = rnd() < 0.07;           // algunas mesas recién desocupadas
  const llenado = entre(0.86, 0.98);
  const nx = Math.round(m.ancho / BANDEJA.x), nz = Math.round(m.largo / BANDEJA.z);
  const yTapa = m.alto + 0.045;
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
    const bx = m.x - m.ancho / 2 + BANDEJA.x * (a + 0.5);
    const bz = m.z - m.largo / 2 + BANDEJA.z * (b + 0.5);
    bandejas.push([bx, yTapa - BANDEJA.alto / 2, bz]);
    if (vacia || rnd() < 0.04) continue;
    for (let ci = 0; ci < BANDEJA.cx; ci++) for (let cj = 0; cj < BANDEJA.cz; cj++) {
      if (rnd() > llenado) continue;
      const px = bx - BANDEJA.x / 2 + (ci + 0.5) * BANDEJA.x / BANDEJA.cx + entre(-0.008, 0.008);
      const pz = bz - BANDEJA.z / 2 + (cj + 0.5) * BANDEJA.z / BANDEJA.cz + entre(-0.008, 0.008);
      const T = TIPOS[tipo];
      plantas[tipo].push([px, yTapa, pz, entre(...T.h), rnd() * 6.28, elegir(T.colores)]);
    }
  }
}

const tmp = new THREE.Object3D();
const im = new THREE.InstancedMesh(geoBandeja, [matLado, matLado, matTapa, matLado, matLado, matLado], bandejas.length);
bandejas.forEach((p, i) => { tmp.position.set(...p); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
im.castShadow = true; im.receiveShadow = true;
scene.add(im);

let totalPlantas = 0;
const col = new THREE.Color();
plantas.forEach((lista, t) => {
  if (!lista.length) return;
  const mesh = new THREE.InstancedMesh(TIPOS[t].geo, matPlanta, lista.length);
  lista.forEach(([x, y, z, h, r, c], i) => {
    tmp.position.set(x, y, z); tmp.rotation.set(0, r, 0); tmp.scale.set(h, h, h); tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
    mesh.setColorAt(i, col.set(c).offsetHSL(0, 0, (rnd() - 0.5) * 0.06));
  });
  mesh.receiveShadow = true;
  mesh.castShadow = !movil;
  mesh.frustumCulled = false;
  scene.add(mesh);
  totalPlantas += lista.length;
});

// brotes en las camas de germinación
const brotes = [];
for (const c of D.camas) {
  sembrar(5000 + c.numero * 17);
  const densidad = [900, 650, 420, 260, 140, 60][(c.numero - 1) % 6];
  for (let i = 0; i < densidad; i++) {
    const fx = entre(-0.5, 0.5), fz = (rnd() + rnd() + rnd()) / 3 - 0.5;
    brotes.push([c.x + fx * (c.ancho - 0.12), c.alto, c.z + fz * (c.largo - 0.12), entre(0.03, 0.07), rnd() * 6.28,
                 elegir(['#5f8f2f', '#78a03a', '#4c7a26', '#93b04a'])]);
  }
}
if (brotes.length) {
  const mb = new THREE.InstancedMesh(geoPlanta(3, 0.35, 0.5, 0.35), matPlanta, brotes.length);
  brotes.forEach(([x, y, z, h, r, c], i) => {
    tmp.position.set(x, y, z); tmp.rotation.set(0, r, 0); tmp.scale.setScalar(h); tmp.updateMatrix();
    mb.setMatrixAt(i, tmp.matrix); mb.setColorAt(i, col.set(c));
  });
  mb.receiveShadow = true;
  scene.add(mb);
}

// letreros de las camas
for (const c of D.camas) {
  const L = c.letrero;
  const t = tex(256, 112, (g, w, h) => {
    g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f3f32'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#1c1c1c'; g.textAlign = 'center';
    g.font = '600 26px Poppins, sans-serif'; g.fillText('CAMA DE', w / 2 - 22, 38);
    g.fillText('GERMINACIÓN', w / 2 - 22, 72);
    g.font = '700 54px Poppins, sans-serif'; g.fillText(String(c.numero), w - 32, 74);
  }, { repetir: false });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(L.ancho, L.alto), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
  p.position.set(L.x, L.y, L.z + 0.004);
  scene.add(p);
}

// ───────────────────────── cifras ─────────────────────────
const fmt = (n) => n.toLocaleString('es-CO');
const redondo = (n, a) => Math.round(n / a) * a;
const cifras = [
  [D.naves, `naves de ${D.ancho_nave} × ${D.largo} m`],
  [`${fmt(D.naves * D.ancho_nave * D.largo)} m²`, 'bajo polisombra'],
  [fmt(D.mesas.length), 'mesas de crecimiento'],
  [D.camas.length, 'camas de germinación'],
  [`~${fmt(redondo(bandejas.length, 50))}`, 'bandejas de alvéolos'],
  [`~${fmt(redondo(totalPlantas, 1000))}`, 'plántulas en mesa'],
];
$('cifras').innerHTML = cifras.map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
$('btnInfo').addEventListener('click', () => {
  const ab = $('panel').classList.toggle('oculto');
  $('btnInfo').setAttribute('aria-expanded', String(!ab));
});
if (!movil) { $('panel').classList.remove('oculto'); $('btnInfo').setAttribute('aria-expanded', 'true'); }

// ───────────────────────── puntos de información ─────────────────────────
const AN = D.ancho_nave, LG = D.largo;
const PUNTOS = [
  { p: [AN * 1.5, D.h_cumbre + 0.15, -LG * 0.35], t: 'Polisombra',
    d: 'Dos capas: la malla en arco por fuera y una malla plana por dentro. Bajan la luz directa para que las plántulas no se quemen.' },
  { p: [AN * 0.5 + 1.2, 1.35, -8], t: 'Mesas de crecimiento',
    d: 'Mesas metálicas a unos 80 cm del suelo con bandejas de alvéolos. La raíz queda al aire por debajo y no se enrolla.' },
  { p: [AN * 3 + 6.1, 1.3, -6], t: 'Camas de germinación',
    d: 'Cajones de madera con sustrato donde germina la semilla. Con las primeras hojas, la plántula pasa a las bandejas.' },
  { p: [AN + 1.0, 0.65, -1.2], t: 'Riego',
    d: 'Tubo PVC al pie de cada hilera, con su llave a la entrada, y manguera para regar a mano.' },
  { p: [8, 3.9, -(LG + 5)], t: 'Zona de trabajo',
    d: 'Bodegas y cobertizos detrás de las naves, junto a la casa.' },
];
const ficha = $('ficha');
let puntoActivo = null;
const elPuntos = PUNTOS.map((pt, i) => {
  const b = document.createElement('button');
  b.className = 'punto'; b.textContent = i + 1; b.title = pt.t;
  b.addEventListener('click', (e) => { e.stopPropagation(); abrirFicha(i); });
  $('puntos').appendChild(b);
  pt.v = new THREE.Vector3(...pt.p);
  return b;
});
function abrirFicha(i) {
  puntoActivo = i;
  elPuntos.forEach((b, k) => b.classList.toggle('activo', k === i));
  $('fichaT').textContent = PUNTOS[i].t; $('fichaP').textContent = PUNTOS[i].d;
  ficha.hidden = false;
}
function cerrarFicha() { puntoActivo = null; ficha.hidden = true; elPuntos.forEach((b) => b.classList.remove('activo')); }
$('fichaCerrar').addEventListener('click', cerrarFicha);

const vtmp = new THREE.Vector3();
function moverPuntos() {
  const w = innerWidth, h = innerHeight;
  PUNTOS.forEach((pt, i) => {
    vtmp.copy(pt.v).project(camera);
    const dist = camera.position.distanceTo(pt.v);
    const fuera = vtmp.z > 1 || Math.abs(vtmp.x) > 1.05 || Math.abs(vtmp.y) > 1.05 || dist > 140 || dist < 0.8;
    const el = elPuntos[i];
    el.classList.toggle('lejos', fuera);
    if (fuera) return;
    const x = (vtmp.x + 1) / 2 * w, y = (1 - vtmp.y) / 2 * h;
    el.style.transform = `translate(${x}px, ${y}px)`;
    if (i === puntoActivo && innerWidth > 760) {
      ficha.style.left = `${Math.min(w - 290, x + 22)}px`; ficha.style.top = `${Math.max(70, y - 30)}px`;
    }
  });
}

// ───────────────────────── vistas ─────────────────────────
const xc = (n) => AN * (n - 0.5);   // centro de la nave n
const VISTAS = {
  aerea: { pos: [64, 34, 26], obj: [16, 0, -18] },
  entrada: { pos: [xc(2) + 2.5, 1.7, 7], obj: [xc(2), 1.6, -6] },
  mesas: { pos: [xc(1), 1.65, -2.0], obj: [xc(1) + 0.3, 1.0, -18] },
  camas: { pos: [xc(4) + 0.2, 1.75, -0.6], obj: [xc(4) + 2.4, 0.7, -9] },
  planta: { pos: [16, 78, -17.99], obj: [16, 0, -18] },
};
let anim = null;
function irA(nombre) {
  salirCaminar();
  const v = VISTAS[nombre];
  document.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === nombre)));
  anim = { t0: performance.now(), dur: 1400,
    p0: camera.position.clone(), p1: new THREE.Vector3(...v.pos),
    o0: controls.target.clone(), o1: new THREE.Vector3(...v.obj) };
  ayuda();
}
document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));
controls.addEventListener('start', () => { anim = null; });

// ───────────────────────── caminar ─────────────────────────
const cajas = [];      // obstáculos [x0, z0, x1, z1]
for (const m of [...D.mesas, ...D.camas]) cajas.push([m.x - m.ancho / 2, m.z - m.largo / 2, m.x + m.ancho / 2, m.z + m.largo / 2]);
const W = D.naves * AN, puerta = 0.8, e = 0.06;
cajas.push([-e, -LG, e, 0], [W - e, -LG, W + e, 0]);
for (let n = 0; n < D.naves; n++) {
  const x0 = n * AN, c = x0 + AN / 2;
  for (const z of [0, -LG]) cajas.push([x0, z - e, c - puerta, z + e], [c + puerta, z - e, x0 + AN, z + e]);
}
for (let k = 0; k <= D.naves; k++) for (let z = 0; z <= LG; z += 4) cajas.push([k * AN - 0.06, -z - 0.06, k * AN + 0.06, -z + 0.06]);

let caminando = false;
const jugador = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
const teclas = new Set();
const palanca = { x: 0, y: 0, id: null };
const ALTURA_OJOS = 1.6, R = 0.28;

function entrarCaminar() {
  caminando = true; anim = null; controls.enabled = false;
  const v = VISTAS.entrada;
  const dentro = camera.position.y < 4 && camera.position.x > -10 && camera.position.x < W + 10 && camera.position.z > -LG - 12 && camera.position.z < 14;
  jugador.pos.set(...(dentro ? [camera.position.x, 0, camera.position.z] : [xc(2), 0, 5]));
  const dir = dentro ? controls.target.clone().sub(camera.position) : new THREE.Vector3(v.obj[0] - xc(2), 0, -1);
  jugador.yaw = Math.atan2(-dir.x, -dir.z); jugador.pitch = dentro ? -0.12 : -0.05;
  $('btnCaminar').setAttribute('aria-pressed', 'true');
  document.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  $('palanca').classList.toggle('on', movil);
  if (movil) cerrarFicha();
  ayuda();
}
function salirCaminar() {
  if (!caminando) return;
  caminando = false; controls.enabled = true;
  const f = new THREE.Vector3(-Math.sin(jugador.yaw), 0, -Math.cos(jugador.yaw));
  controls.target.copy(camera.position).addScaledVector(f, 3).setY(1.2);
  $('btnCaminar').setAttribute('aria-pressed', 'false');
  $('palanca').classList.remove('on');
  ayuda();
}
$('btnCaminar').addEventListener('click', () => (caminando ? salirCaminar() : entrarCaminar()));
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  teclas.add(e.key.toLowerCase());
  if (caminando && e.key.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
addEventListener('blur', () => teclas.clear());

// mirar arrastrando
let arrastre = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!caminando) return;
  arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!caminando || !arrastre || arrastre.id !== e.pointerId) return;
  const k = movil ? 0.006 : 0.004;
  jugador.yaw -= (e.clientX - arrastre.x) * k;
  jugador.pitch = THREE.MathUtils.clamp(jugador.pitch - (e.clientY - arrastre.y) * k, -1.3, 1.3);
  arrastre.x = e.clientX; arrastre.y = e.clientY;
});
renderer.domElement.addEventListener('pointerup', () => { arrastre = null; });
renderer.domElement.addEventListener('pointercancel', () => { arrastre = null; });

// palanca táctil
const elP = $('palanca'), bolita = elP.querySelector('i');
function moverPalanca(e) {
  const r = elP.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  palanca.x = x; palanca.y = y;
  bolita.style.transform = `translate(${x * 33}px, ${y * 33}px)`;
}
elP.addEventListener('pointerdown', (e) => { palanca.id = e.pointerId; elP.setPointerCapture(e.pointerId); moverPalanca(e); });
elP.addEventListener('pointermove', (e) => { if (palanca.id === e.pointerId) moverPalanca(e); });
const soltar = () => { palanca.id = null; palanca.x = palanca.y = 0; bolita.style.transform = ''; };
elP.addEventListener('pointerup', soltar); elP.addEventListener('pointercancel', soltar);

function pasoCaminar(dt) {
  let ad = 0, la = 0;
  if (teclas.has('w') || teclas.has('arrowup')) ad += 1;
  if (teclas.has('s') || teclas.has('arrowdown')) ad -= 1;
  if (teclas.has('a') || teclas.has('arrowleft')) la -= 1;
  if (teclas.has('d') || teclas.has('arrowright')) la += 1;
  ad -= palanca.y; la += palanca.x;
  const vel = (teclas.has('shift') ? 4.2 : 2.0) * dt;
  const f = new THREE.Vector3(-Math.sin(jugador.yaw), 0, -Math.cos(jugador.yaw));
  const d = new THREE.Vector3(-f.z, 0, f.x);
  const mov = f.multiplyScalar(ad).add(d.multiplyScalar(la));
  if (mov.lengthSq() > 1) mov.normalize();
  jugador.pos.addScaledVector(mov, vel);
  for (let it = 0; it < 2; it++) for (const [x0, z0, x1, z1] of cajas) {
    const px = THREE.MathUtils.clamp(jugador.pos.x, x0, x1), pz = THREE.MathUtils.clamp(jugador.pos.z, z0, z1);
    const dx = jugador.pos.x - px, dz = jugador.pos.z - pz, dd = dx * dx + dz * dz;
    if (dd < R * R) {
      if (dd > 1e-8) { const l = Math.sqrt(dd); jugador.pos.x = px + dx / l * R; jugador.pos.z = pz + dz / l * R; }
      else jugador.pos.z = z1 + R;
    }
  }
  jugador.pos.x = THREE.MathUtils.clamp(jugador.pos.x, -140, 140);
  jugador.pos.z = THREE.MathUtils.clamp(jugador.pos.z, -140, 140);
  camera.position.set(jugador.pos.x, ALTURA_OJOS, jugador.pos.z);
  camera.rotation.set(jugador.pitch, jugador.yaw, 0, 'YXZ');
}

function ayuda() {
  $('ayuda').textContent = caminando
    ? (movil ? 'Mueve el círculo para caminar · arrastra para mirar' : 'W A S D o flechas para caminar · Shift corre · arrastra para mirar')
    : (movil ? 'Un dedo gira · dos dedos acercan y mueven · toca los números' : 'Arrastra para girar · rueda para acercar · clic derecho para mover · clic en los números');
}

// ───────────────────────── ciclo ─────────────────────────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const suave = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const reloj = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, reloj.getDelta());
  if (caminando) pasoCaminar(dt);
  else {
    if (anim) {
      const t = Math.min(1, (performance.now() - anim.t0) / anim.dur), s = suave(t);
      camera.position.lerpVectors(anim.p0, anim.p1, s);
      controls.target.lerpVectors(anim.o0, anim.o1, s);
      if (t >= 1) anim = null;
    }
    controls.update();
  }
  moverPuntos();
  renderer.render(scene, camera);
});

ponerHora(+$('hora').value);
ayuda();
progreso(1);
setTimeout(() => { carga.classList.add('fin'); setTimeout(() => carga.remove(), 700); }, 60);
window.__vivero = { scene, camera, controls, irA, D, totalPlantas, bandejas: bandejas.length, pasoCaminar, teclas, jugador };
