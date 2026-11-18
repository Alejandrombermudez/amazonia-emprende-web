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
let horaActual = +$('hora').value;
$('hora').addEventListener('input', (e) => { horaActual = +e.target.value; ponerHora(horaActual, false); });
$('hora').addEventListener('change', (e) => { horaActual = +e.target.value; ponerHora(horaActual, true); });

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

// ───────────────────────── cifras (en una línea, se pueden esconder) ─────────────────────────
const fmt = (n) => n.toLocaleString('es-CO');
const redondo = (n, a) => Math.round(n / a) * a;
const cifras = [
  [D.naves, `naves de ${D.ancho_nave} × ${D.largo} m`],
  [`${fmt(D.naves * D.ancho_nave * D.largo)} m²`, 'bajo polisombra'],
  [fmt(D.mesas.length), 'mesas'],
  [D.camas.length, 'camas de germinación'],
  [`~${fmt(redondo(bandejas.length, 50))}`, 'bandejas'],
  [`~${fmt(redondo(totalPlantas, 1000))}`, 'plántulas'],
];
$('tira').insertAdjacentHTML('afterbegin', cifras.map(([v, k]) => `<span><b>${v}</b> ${k}</span>`).join(''));
const angosto = () => innerWidth <= 820;
function mostrarTira(on) {
  $('tira').classList.toggle('oculta', !on);
  $('btnCifras').setAttribute('aria-expanded', String(on));
}
mostrarTira(!angosto());
$('btnCifras').addEventListener('click', () => mostrarTira($('tira').classList.contains('oculta')));
$('tiraCerrar').addEventListener('click', () => mostrarTira(false));

// ───────────────────────── hora: corre sola, 10 s por hora ─────────────────────────
let reproduciendo = false, ultimoCuarto = -1;
function ponerPlay(on) {
  reproduciendo = on;
  $('play').setAttribute('aria-pressed', String(on));
  $('play').setAttribute('aria-label', on ? 'Pausar' : 'Reproducir el paso de las horas');
  $('icoPlay').hidden = on; $('icoPausa').hidden = !on;
}
$('play').addEventListener('click', () => ponerPlay(!reproduciendo));
function avanzarHora(dt) {
  let h = horaActual + dt / 10;
  if (h > 18) h = 6;
  horaActual = h;
  $('hora').value = h;
  const cuarto = Math.floor(h * 4);          // el reflejo del cielo se recalcula cada 15 min
  ponerHora(h, cuarto !== ultimoCuarto);
  ultimoCuarto = cuarto;
}

// ───────────────────────── puntos (en el orden del recorrido) ─────────────────────────
const AN = D.ancho_nave, LG = D.largo;
const xc = (n) => AN * (n - 0.5);   // centro de la nave n
// p: dónde está el número · faro: baliza en el piso (allí se "llega") · cam: vista "Ver de cerca"
// previa: toma que muestra dónde queda antes de ir · foco: toma de cerca de lo que se explica
const PUNTOS = [
  { p: [xc(2) + 1.2, 0.65, -1.2], faro: [xc(2) + 0.6, -0.6], t: 'Riego',
    d: 'Esta llave abre el agua de la hilera. El tubo blanco (PVC) va por el piso, debajo de las mesas. Para regar a mano se usa la manguera.',
    cam: [AN + 2.6, 1.5, 1.6],
    previa: [[xc(2) - 0.4, 2.1, 4.5], [xc(2) + 0.8, 0.4, -1.0]],
    foco: [[xc(2) + 0.1, 1.3, 0.4], [xc(2) + 1.45, -0.45, -2.3]] },
  { p: [xc(2) + 1.2, 1.35, -7], faro: [xc(2), -7], t: 'Mesas de crecimiento',
    d: 'Mesas metálicas a unos 80 cm del suelo. Encima van bandejas negras con huecos (alvéolos): una plántula en cada hueco. La raíz queda al aire por debajo y así no se enrolla.',
    cam: [xc(2) - 0.1, 1.75, -2.5],
    previa: [[xc(2), 2.4, -1.2], [xc(2) + 0.2, 0.5, -7]],
    foco: [[xc(2) + 0.3, 1.55, -6.2], [xc(2) + 1.45, 0.3, -7.7]] },
  { p: [xc(2), D.h_cumbre + 0.15, -13], faro: [xc(2), -13], t: 'Polisombra',
    d: 'Mira el techo: son dos mallas. La de arco va por fuera y la plana cuelga por dentro. Juntas dan sombra para que el sol directo no queme las plántulas.',
    cam: [xc(2) + 10, 9, -1],
    previa: [[xc(2), 2.4, -7.5], [xc(2), 0.5, -13]],
    foco: [[xc(2) - 0.4, 1.9, -12], [xc(2) + 0.6, 4.4, -15.5]] },
  { p: [xc(4) + 2.1, 1.3, -12], faro: [xc(4), -12], t: 'Camas de germinación',
    d: 'Cajones de madera llenos de tierra (sustrato). Aquí se siembra la semilla y germina. Cuando la plántula saca sus primeras hojas, se pasa a una bandeja de las mesas.',
    cam: [xc(4) + 0.2, 1.8, -6.5],
    previa: [[20, 2.5, -16], [xc(4), 0.4, -12]],
    foco: [[xc(4) + 0.5, 1.8, -10.4], [xc(4) + 2.7, 0.25, -12.9]] },
  { p: [21, 2.4, -(LG + 4.5)], faro: [21, -(LG + 3)], t: 'Zona de trabajo',
    d: 'Detrás de las naves están las bodegas y los cobertizos de lámina, junto a la casa.',
    cam: [34, 7, -(LG - 6)],
    previa: [[31, 3.0, -(LG + 9)], [23, 0.6, -(LG + 1)]],
    foco: [[29.5, 2.5, -(LG + 5.5)], [16, 0.2, -(LG + 6.5)]] },
];
PUNTOS.forEach((pt) => { pt.v = new THREE.Vector3(...pt.p); });
const elPuntos = PUNTOS.map((pt, i) => {
  const b = document.createElement('button');
  b.className = 'punto'; b.textContent = i + 1; b.title = pt.t;
  b.addEventListener('click', (e) => { e.stopPropagation(); abrirInfo(i); });
  $('puntos').appendChild(b);
  return b;
});
$('indice').innerHTML = PUNTOS.map((pt, i) => `<li><button data-i="${i}"><i>${i + 1}</i>${pt.t}</button></li>`).join('');
$('indice').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) abrirInfo(+b.dataset.i); });

// barra izquierda (vistas libres)
let puntoInfo = null;
function abrirInfo(i) {
  puntoInfo = i;
  const pt = PUNTOS[i];
  $('infoN').textContent = `Punto ${i + 1} de ${PUNTOS.length}`;
  $('infoT').textContent = pt.t; $('infoP').textContent = pt.d;
  $('info').classList.remove('cerrada'); $('info').setAttribute('aria-hidden', 'false');
  elPuntos.forEach((b, k) => b.classList.toggle('activo', k === i));
  $('indice').querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
}
function cerrarInfo() {
  puntoInfo = null;
  $('info').classList.add('cerrada'); $('info').setAttribute('aria-hidden', 'true');
  elPuntos.forEach((b) => b.classList.remove('activo'));
}
$('infoCerrar').addEventListener('click', cerrarInfo);
$('infoAcercar').addEventListener('click', () => {
  if (puntoInfo === null) return;
  marcarVista(null);
  volar(PUNTOS[puntoInfo].cam, PUNTOS[puntoInfo].p);
});

// ───────────────────────── recorrido guiado (modo caminar) ─────────────────────────
// En orden. Para cada punto: la cámara muestra dónde queda y vuelve al cuerpo; la persona
// camina hasta la luz; al llegar se bloquea el movimiento, la cámara se acerca a lo que se
// explica y espera el botón; luego vuelve despacio al cuerpo y se desbloquea.
const vistos = new Set();
const siguiente = () => (vistos.size < PUNTOS.length ? vistos.size : null);
const LLEGADA = 0.9;

// baliza: anillo pulsante en el piso y columna de luz
const texColumna = tex(8, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { repetir: false, color: false });
const faro = new THREE.Group();
const anillo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 48),
  new THREE.MeshBasicMaterial({ color: 0xe1a644, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.04;
const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xe1a644, alphaMap: texColumna, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
columna.position.y = 2.5;
faro.add(anillo, columna);
faro.visible = false;
scene.add(faro);
let enFoco = false;
function ponerFaro() {
  const s = siguiente();
  faro.visible = caminando && s !== null && !enFoco && !tuto;
  if (s !== null) faro.position.set(PUNTOS[s].faro[0], 0, PUNTOS[s].faro[1]);
}

// ── tomas de cámara ──
const camAux = new THREE.PerspectiveCamera();
function poseMirando([pos, obj]) {
  camAux.position.set(...pos); camAux.lookAt(...obj);
  return { p: camAux.position.clone(), q: camAux.quaternion.clone() };
}
function poseCuerpo() {
  camAux.position.set(jugador.pos.x, ALTURA_OJOS, jugador.pos.z);
  camAux.rotation.set(jugador.pitch, jugador.yaw, 0, 'YXZ');
  return { p: camAux.position.clone(), q: camAux.quaternion.clone() };
}
// cine: lista de pasos { hacia(), dur (ms), quieto (ms), alEmpezar(), alLlegar(), esperar }
let cine = null;
function correr(pasos, alFinal) {
  cine = { pasos, i: 0, t0: performance.now(), desde: { p: camera.position.clone(), q: camera.quaternion.clone() }, alFinal };
  cine.meta = pasos[0].hacia();
  pasos[0].alEmpezar?.();
  document.body.classList.add('cine');
  ayuda();
}
function pasoCine() {
  const c = cine, paso = c.pasos[c.i], t = performance.now() - c.t0;
  const s = suave(Math.min(1, t / paso.dur));
  camera.position.lerpVectors(c.desde.p, c.meta.p, s);
  camera.quaternion.slerpQuaternions(c.desde.q, c.meta.q, s);
  if (t < paso.dur) return;
  if (!paso.llego) { paso.llego = true; paso.alLlegar?.(); }
  if (paso.esperar ? !c.seguir : t < paso.dur + (paso.quieto || 0)) return;
  c.seguir = false;
  c.i++;
  if (c.i >= c.pasos.length) {
    cine = null;
    document.body.classList.remove('cine');
    camera.rotation.set(jugador.pitch, jugador.yaw, 0, 'YXZ');
    ayuda();
    c.alFinal?.();
    return;
  }
  c.desde = c.meta; c.t0 = performance.now();
  c.meta = c.pasos[c.i].hacia();
  c.pasos[c.i].alEmpezar?.();
}

// ── tarjeta ──
const tarjeta = $('tarjeta');
function mostrarTarjeta(n, t, d, conBoton) {
  $('tarjetaN').textContent = n; $('tarjetaT').textContent = t; $('tarjetaP').textContent = d;
  $('tarjetaPie').hidden = !conBoton;
  tarjeta.hidden = false;
  if (conBoton && !movil) setTimeout(() => $('tarjetaOk').focus({ preventScroll: true }), 50);
}
function ocultarTarjeta() { tarjeta.hidden = true; }

// 1) mostrar dónde queda el siguiente punto
function pasosPrevia(i) {
  const pt = PUNTOS[i];
  return [
    { hacia: () => poseMirando(pt.previa), dur: 1700, quieto: 2600,
      alEmpezar: () => { ponerFaro(); mostrarTarjeta(`Siguiente: punto ${i + 1} de ${PUNTOS.length}`, pt.t, 'Camina hasta la luz. La flecha de arriba te indica el camino.', false); } },
    { hacia: poseCuerpo, dur: 1500, alEmpezar: ocultarTarjeta },
  ];
}
function vistaPrevia() {
  const s = siguiente();
  if (!caminando || s === null || cine || tuto || pausaGiro) return;
  correr(pasosPrevia(s));
}
// 2) al llegar: bloquear, acercar a lo que se explica y esperar el botón
function llegar(i) {
  const pt = PUNTOS[i];
  enFoco = true; ponerFaro();
  if (mouseAtrapado()) document.exitPointerLock();   // para poder hacer clic en el botón
  teclas.clear(); soltar();
  const pasos = [
    { hacia: () => poseMirando(pt.foco), dur: 1900, esperar: true,
      alLlegar: () => mostrarTarjeta(`Punto ${i + 1} de ${PUNTOS.length}`, pt.t, pt.d, true) },
    { hacia: poseCuerpo, dur: 2600, quieto: siguiente() === null ? 0 : 500,
      alEmpezar: () => {
        ocultarTarjeta();
        vistos.add(i); elPuntos[i].classList.add('visto');
        enFoco = false; guiaPrevia = '';
      } },
  ];
  // 3) de vuelta en el cuerpo: si quedan puntos, mostrar dónde queda el siguiente
  if (i + 1 < PUNTOS.length) pasos.push(...pasosPrevia(i + 1));
  correr(pasos, ponerFaro);
}
function confirmar() {
  if (!cine || !cine.pasos[cine.i].esperar || !cine.pasos[cine.i].llego) return;
  atraparMouse();               // el clic o el Enter vuelven a tomar el mouse
  cine.seguir = true;
}
$('tarjetaOk').addEventListener('click', confirmar);
$('guiaDonde').addEventListener('click', () => { $('guiaDonde').blur(); atraparMouse(); vistaPrevia(); });
$('guiaOtra').addEventListener('click', () => {
  vistos.clear();
  elPuntos.forEach((b) => b.classList.remove('visto'));
  guiaPrevia = '';
  atraparMouse();
  vistaPrevia();
});

let guiaPrevia = '';
function actualizarGuia(t) {
  const s = siguiente();
  let titulo, sub, ang = 0;
  if (s === null) {
    titulo = 'Recorrido completo';
    sub = `Visitaste los ${PUNTOS.length} puntos`;
  } else {
    const pt = PUNTOS[s];
    const dx = pt.faro[0] - jugador.pos.x, dz = pt.faro[1] - jugador.pos.z;
    const y = jugador.yaw;
    ang = Math.atan2(dx * Math.cos(y) - dz * Math.sin(y), -dx * Math.sin(y) - dz * Math.cos(y));
    const m = Math.hypot(dx, dz);
    titulo = `Punto ${s + 1} de ${PUNTOS.length}: ${pt.t}`;
    sub = enFoco ? 'Llegaste' : `A ${Math.max(1, Math.round(m))} m · camina hasta la luz`;
    anillo.scale.setScalar(1 + 0.18 * Math.sin(t * 3.2));
    columna.material.opacity = 0.32 + 0.16 * Math.sin(t * 3.2);
    if (!cine && !tuto && !pausaGiro && m < LLEGADA) llegar(s);
  }
  $('flecha').style.transform = `rotate(${ang}rad)`;
  $('flecha2').style.transform = `rotate(${ang}rad)`;
  const clave = titulo + sub;
  if (clave !== guiaPrevia) {
    guiaPrevia = clave;
    $('guiaT').textContent = titulo; $('guiaS').textContent = sub;
    $('guia').classList.toggle('completo', s === null);
    $('guiaOtra').hidden = s !== null;
    $('guiaDonde').hidden = s === null;
    $('brujula').classList.toggle('completo', s === null);
  }
  const bm = s === null ? 'Completo' : `${Math.max(1, Math.round(Math.hypot(PUNTOS[s].faro[0] - jugador.pos.x, PUNTOS[s].faro[1] - jugador.pos.z)))} m`;
  if ($('brujulaM').textContent !== bm) $('brujulaM').textContent = bm;
}

const vtmp = new THREE.Vector3();
function moverPuntos() {
  const w = innerWidth, h = innerHeight;
  const s = siguiente();
  PUNTOS.forEach((pt, i) => {
    vtmp.copy(pt.v).project(camera);
    const dist = camera.position.distanceTo(pt.v);
    const visible = caminando
      ? (vistos.has(i) || i === s) && (dist < 11 || (cine && i === s))
      : dist <= 140 && dist >= 0.8;
    const fuera = vtmp.z > 1 || Math.abs(vtmp.x) > 1.05 || Math.abs(vtmp.y) > 1.05 || !visible;
    const el = elPuntos[i];
    el.classList.toggle('lejos', fuera);
    el.classList.toggle('activo', caminando && enFoco && i === s);
    if (fuera) return;
    el.style.transform = `translate(${(vtmp.x + 1) / 2 * w}px, ${(1 - vtmp.y) / 2 * h}px)`;
  });
}

// ───────────────────────── vistas ─────────────────────────
const VISTAS = {
  aerea: { pos: [64, 34, 26], obj: [16, 0, -18] },
  entrada: { pos: [xc(2) + 2.5, 1.7, 7], obj: [xc(2), 1.6, -6] },
  mesas: { pos: [xc(1), 1.65, -2.0], obj: [xc(1) + 0.3, 1.0, -18] },
  camas: { pos: [xc(4) + 0.2, 1.75, -0.6], obj: [xc(4) + 2.4, 0.7, -9] },
  planta: { pos: [16, 78, -17.99], obj: [16, 0, -18] },
};
let anim = null;
function marcarVista(nombre) {
  document.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === nombre)));
}
function volar(pos, obj) {
  salirCaminar();
  anim = { t0: performance.now(), dur: 1400,
    p0: camera.position.clone(), p1: new THREE.Vector3(...pos),
    o0: controls.target.clone(), o1: new THREE.Vector3(...obj) };
}
function irA(nombre) {
  const v = VISTAS[nombre];
  volar(v.pos, v.obj);
  marcarVista(nombre);
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
const palanca = { x: 0, y: 0, id: null };       // mando izquierdo: caminar
const palancaMirar = { x: 0, y: 0, id: null };  // mando derecho: mirar
const ALTURA_OJOS = 1.6, R = 0.28;
const lienzo = renderer.domElement;
const mouseAtrapado = () => document.pointerLockElement === lienzo;
if (movil) document.body.classList.add('tactil');

// el mouse pasa a ser la vista (pointer lock); Esc lo suelta y un clic lo vuelve a tomar
function atraparMouse() {
  if (movil || !caminando || mouseAtrapado() || !lienzo.requestPointerLock) return;
  try { const r = lienzo.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* sin pointer lock */ }
}
document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('mouse-libre', caminando && !movil && !mouseAtrapado());
  ayuda();
});
document.addEventListener('mousemove', (ev) => {
  if (!caminando || !mouseAtrapado() || cine) return;
  if (tuto && tuto.paso === 2) tuto.mouse += Math.abs(ev.movementX) + Math.abs(ev.movementY);
  jugador.yaw -= ev.movementX * 0.0022;
  jugador.pitch = THREE.MathUtils.clamp(jugador.pitch - ev.movementY * 0.0022, -1.35, 1.35);
});
lienzo.addEventListener('click', atraparMouse);

let tiraAntes = false;
function entrarCaminar() {
  caminando = true; anim = null; controls.enabled = false;
  const v = VISTAS.entrada;
  const dentro = camera.position.y < 4 && camera.position.x > -10 && camera.position.x < W + 10 && camera.position.z > -LG - 12 && camera.position.z < 14;
  jugador.pos.set(...(dentro ? [camera.position.x, 0, camera.position.z] : [xc(2), 0, 5]));
  const dir = dentro ? controls.target.clone().sub(camera.position) : new THREE.Vector3(v.obj[0] - xc(2), 0, -1);
  jugador.yaw = Math.atan2(-dir.x, -dir.z); jugador.pitch = dentro ? -0.12 : -0.05;
  $('btnCaminar').setAttribute('aria-pressed', 'true');
  $('btnCaminar').blur();
  marcarVista(null);
  cerrarInfo();
  tiraAntes = !$('tira').classList.contains('oculta');
  document.body.classList.add('caminando');
  $('guia').hidden = false;
  guiaPrevia = '';
  enFoco = false;
  camera.position.set(jugador.pos.x, ALTURA_OJOS, jugador.pos.z);
  camera.rotation.set(jugador.pitch, jugador.yaw, 0, 'YXZ');
  ponerFaro();
  atraparMouse();
  ayuda();
  arrancarRecorrido();
}
function salirCaminar() {
  if (!caminando) return;
  caminando = false; controls.enabled = true;
  const f = new THREE.Vector3(-Math.sin(jugador.yaw), 0, -Math.cos(jugador.yaw));
  controls.target.copy(camera.position).addScaledVector(f, 3).setY(1.2);
  $('btnCaminar').setAttribute('aria-pressed', 'false');
  mostrarPalancas(false);
  if (mouseAtrapado()) document.exitPointerLock();
  cine = null; enFoco = false; ocultarTarjeta();
  tuto = null; $('tuto').hidden = true;
  pausaGiro = false; $('girar').hidden = true;
  if (movil) soltarHorizontal();
  document.body.classList.remove('caminando', 'mouse-libre', 'cine');
  $('guia').hidden = true;
  faro.visible = false;
  mostrarTira(tiraAntes);
  ayuda();
}
$('btnCaminar').addEventListener('click', () => (caminando ? salirCaminar() : entrarCaminar()));
addEventListener('keydown', (ev) => {
  if (ev.target.closest?.('input')) return;
  if (caminando && cine && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); confirmar(); return; }
  if (caminando && !cine && ev.key.toLowerCase() === 'r') { vistaPrevia(); return; }
  teclas.add(ev.key.toLowerCase());
  if (caminando && (ev.key.startsWith('Arrow') || ev.key === ' ')) ev.preventDefault();
});
addEventListener('keyup', (ev) => teclas.delete(ev.key.toLowerCase()));
addEventListener('blur', () => teclas.clear());

// en celular (o si el navegador no deja tomar el mouse) se mira arrastrando
let arrastre = null;
lienzo.addEventListener('pointerdown', (ev) => {
  if (!caminando || mouseAtrapado()) return;
  arrastre = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
});
lienzo.addEventListener('pointermove', (ev) => {
  if (!caminando || cine || mouseAtrapado() || !arrastre || arrastre.id !== ev.pointerId) return;
  const k = movil ? 0.006 : 0.004;
  if (tuto && tuto.paso === 2) tuto.mouse += Math.abs(ev.clientX - arrastre.x) + Math.abs(ev.clientY - arrastre.y);
  jugador.yaw -= (ev.clientX - arrastre.x) * k;
  jugador.pitch = THREE.MathUtils.clamp(jugador.pitch - (ev.clientY - arrastre.y) * k, -1.3, 1.3);
  arrastre.x = ev.clientX; arrastre.y = ev.clientY;
});
lienzo.addEventListener('pointerup', () => { arrastre = null; });
lienzo.addEventListener('pointercancel', () => { arrastre = null; });

// mandos táctiles: izquierdo camina, derecho mira
function crearPalanca(el, estado) {
  const bol = el.querySelector('i');
  const mover = (ev) => {
    const r = el.getBoundingClientRect();
    let x = (ev.clientX - r.left - r.width / 2) / (r.width / 2), y = (ev.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    estado.x = x; estado.y = y;
    bol.style.transform = `translate(${x * r.width * 0.3}px, ${y * r.width * 0.3}px)`;
  };
  const suelta = () => { estado.id = null; estado.x = estado.y = 0; bol.style.transform = ''; };
  el.addEventListener('pointerdown', (ev) => { estado.id = ev.pointerId; el.setPointerCapture(ev.pointerId); mover(ev); });
  el.addEventListener('pointermove', (ev) => { if (estado.id === ev.pointerId) mover(ev); });
  el.addEventListener('pointerup', suelta); el.addEventListener('pointercancel', suelta);
  return suelta;
}
const soltarMover = crearPalanca($('palanca'), palanca), soltarMirar = crearPalanca($('palancaMirar'), palancaMirar);
const soltar = () => { soltarMover(); soltarMirar(); };
function mostrarPalancas(on) {
  $('palanca').classList.toggle('on', on); $('palancaMirar').classList.toggle('on', on);
  if (!on) soltar();
}

// celular: pantalla completa y horizontal; si no se puede girar solo, se le pide a la persona
let pausaGiro = false, arrancado = false;
function pedirHorizontal() {
  const el = document.documentElement;
  try {
    const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    if (r && r.then) r.then(() => screen.orientation?.lock?.('landscape')).then(revisarOrientacion, () => {}).catch(() => {});
  } catch (err) { /* sin pantalla completa */ }
}
function soltarHorizontal() {
  try { screen.orientation?.unlock?.(); } catch (err) { /* nada */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
function revisarOrientacion() {
  if (!caminando || !movil) return;
  const vertical = innerHeight > innerWidth;
  pausaGiro = vertical;
  $('girar').hidden = !vertical;
  mostrarPalancas(!vertical);
  if (!vertical && !arrancado) { arrancado = true; setTimeout(vistaPrevia, 700); }
}
addEventListener('resize', revisarOrientacion);
screen.orientation?.addEventListener?.('change', () => setTimeout(revisarOrientacion, 150));
$('girarCancelar').addEventListener('click', salirCaminar);
$('salir').addEventListener('click', salirCaminar);
$('brujula').addEventListener('click', () => {
  if (siguiente() === null) { vistos.clear(); elPuntos.forEach((b) => b.classList.remove('visto')); guiaPrevia = ''; }
  vistaPrevia();
});

// computador: tutorial de dos pasos que avanza solo cuando la persona lo hace
let tutorialHecho = false, tuto = null;
const FLECHAS = { w: 'arrowup', a: 'arrowleft', s: 'arrowdown', d: 'arrowright' };
function arrancarRecorrido() {
  if (movil) { arrancado = false; pedirHorizontal(); revisorOrientacionDiferida(); }
  else if (!tutorialHecho) iniciarTutorial();
  else setTimeout(vistaPrevia, 500);
}
function revisorOrientacionDiferida() { revisarOrientacion(); setTimeout(revisarOrientacion, 400); }
function iniciarTutorial() {
  tuto = { paso: 1, desde: jugador.pos.clone(), mouse: 0, listo: false };
  $('tutoN').textContent = 'Paso 1 de 2';
  $('tuto1').hidden = false; $('tuto2').hidden = true;
  $('tuto').classList.remove('hecho');
  $('tuto').hidden = false;
  $('guia').hidden = true;
  ponerFaro();
  ayuda();
}
function pasoTutorial() {
  if (!tuto) return;
  document.querySelectorAll('#tuto kbd').forEach((k) => k.classList.toggle('on', teclas.has(k.dataset.k) || teclas.has(FLECHAS[k.dataset.k])));
  if (tuto.listo) return;
  if (tuto.paso === 1 && Math.hypot(jugador.pos.x - tuto.desde.x, jugador.pos.z - tuto.desde.z) > 2) completarPasoTuto();
  if (tuto.paso === 2) {
    const txt = mouseAtrapado() ? 'Mira a tu alrededor, sin hacer clic.' : 'Primero haz clic en la escena para usar el mouse.';
    if ($('tuto2p').textContent !== txt) $('tuto2p').textContent = txt;
    if (tuto.mouse > 700) completarPasoTuto();
  }
}
function completarPasoTuto() {
  tuto.listo = true;
  $('tuto').classList.add('hecho');
  setTimeout(() => {
    if (!tuto) return;
    tuto.listo = false;
    $('tuto').classList.remove('hecho');
    if (tuto.paso === 1) {
      tuto.paso = 2; tuto.mouse = 0;
      $('tuto1').hidden = true; $('tuto2').hidden = false; $('tutoN').textContent = 'Paso 2 de 2';
    } else {
      tuto = null; tutorialHecho = true;
      $('tuto').hidden = true; $('guia').hidden = false; guiaPrevia = '';
      ayuda();
      vistaPrevia();
    }
  }, 1000);
}

function pasoCaminar(dt) {
  if (pausaGiro) return;
  let ad = 0, la = 0;
  if (teclas.has('w') || teclas.has('arrowup')) ad += 1;
  if (teclas.has('s') || teclas.has('arrowdown')) ad -= 1;
  if (teclas.has('a') || teclas.has('arrowleft')) la -= 1;
  if (teclas.has('d') || teclas.has('arrowright')) la += 1;
  ad -= palanca.y; la += palanca.x;
  jugador.yaw -= palancaMirar.x * 2.4 * dt;
  jugador.pitch = THREE.MathUtils.clamp(jugador.pitch - palancaMirar.y * 1.5 * dt, -1.3, 1.3);
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
  let txt;
  if (!caminando) txt = movil ? 'Un dedo gira · dos dedos acercan y mueven · toca los números' : 'Arrastra para girar · rueda para acercar · clic derecho para mover · clic en los números';
  else if (cine || tuto) txt = '';
  else if (movil) txt = '';
  else if (mouseAtrapado()) txt = 'Mueve el mouse para mirar · W A S D para caminar · Shift corre · R muestra dónde ir · Esc suelta el mouse';
  else txt = 'Haz clic en la escena para mirar con el mouse';
  $('ayuda').textContent = txt;
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
  if (reproduciendo) avanzarHora(dt);
  if (caminando) {
    if (cine) pasoCine(); else pasoCaminar(dt);
    pasoTutorial();
    actualizarGuia(reloj.elapsedTime);
  } else {
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

ponerHora(horaActual);
ponerPlay(true);
ayuda();
progreso(1);
setTimeout(() => { carga.classList.add('fin'); setTimeout(() => carga.remove(), 700); }, 60);
window.__vivero = { scene, camera, controls, irA, D, totalPlantas, bandejas: bandejas.length, pasoCaminar, teclas, jugador,
  avanzarHora, moverPuntos, actualizarGuia, PUNTOS, ponerPlay, vistos, confirmar, pasoCine, pasoTutorial, palancaMirar,
  get cine() { return cine; }, get tuto() { return tuto; } };
