/* ============================================================
   BEST WISHES — main.js
   1) helpers & flags      2) loader          3) lenis + gsap
   4) three.js scene       5) scroll choreo   6) interactions
   Comments explain the 3D setup so it's easy to extend.
   ============================================================ */

import * as THREE from 'three';
import initThenNow from './thennow.js?v=7';
import initCakeStudio from './cakemaker.js?v=19';

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);

/* ---------- 1 · flags ---------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch   = matchMedia('(pointer: coarse)').matches;
const small   = matchMedia('(max-width: 640px)').matches;
const lowEnd  = (navigator.hardwareConcurrency || 8) <= 4;
if (reduced) document.documentElement.classList.add('reduced');

const WEBGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
})();
if (!WEBGL) document.documentElement.classList.add('no-webgl');

/* quality tiers — drop particle counts on weak devices */
const TIER = reduced || !WEBGL ? 'off' : (small || lowEnd ? 'low' : 'high');
const Q = {
  off : { dust: 0,   ember: 0,   flames: 0 },
  low : { dust: 220, ember: 160, flames: 2 },
  high: { dust: 520, ember: 380, flames: 3 },
}[TIER];

/* THEN & NOW module (null-safe: silently skips if init fails) */
const TN_MODULE = initThenNow({ gsap, ScrollTrigger, reduced, touch, small, toast: m => toast(m) });

/* CAKE STUDIO — build, cut & eat game. toast/confettiBurst are hoisted
   function declarations, so passing them here is safe. */
initCakeStudio({ gsap, reduced, touch, toast: m => toast(m), confettiBurst: (n, x, y) => confettiBurst(n, x, y) });

gsap.registerPlugin(ScrollTrigger);

/* ---------- 2 · loader ---------- */
const loader = $('#loader');
let loaderDone = false;
let progress = 0;
const progressTimer = setInterval(() => {          // gentle fake progress while fonts/CDN settle
  progress = Math.min(progress + rand(4, 11), 92);
  $('#loaderFill').style.width = progress + '%';
  $('#loaderPct').textContent = Math.round(progress) + '%';
}, 220);

function finishLoader() {
  if (loaderDone) return;
  loaderDone = true;
  clearInterval(progressTimer);
  $('#loaderFill').style.width = '100%';
  $('#loaderPct').textContent = '100%';
  setTimeout(() => {
    loader.classList.add('done');
    if (!reduced) document.documentElement.classList.add('gsap');  // arms CSS-driven card entrances
    startEntrance();
    ScrollTrigger.refresh();
  }, 350);
}

/* ---------- 3 · smooth scroll ---------- */
let lenis = null;
if (!reduced && window.Lenis) {
  lenis = new Lenis({ duration: 1.25, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  window.__lenis = lenis;                             // debug/testing hook
  /* late images & pin spacers grow the page — re-measure Lenis on every ScrollTrigger refresh,
     otherwise its cached scroll limit strands the page short of the footer */
  ScrollTrigger.addEventListener('refresh', () => lenis.resize?.());
  gsap.ticker.lagSmoothing(0);
}
function scrollToTarget(el) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -60, duration: 1.6 });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
$$('[data-scroll]').forEach(a => a.addEventListener('click', e => {
  const target = $(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  closeMenu();
  scrollToTarget(target);
}));

/* ============================================================
   4 · THREE.JS SCENE — "the birthday table"
   Fixed camera, objects scroll/scale via ScrollTrigger.
   Groups: table, cake (3 tiers + 6 candles + flames),
   gift boxes, dust particles, ember particles, ribbon.
   ============================================================ */
let renderer, scene, camera, tableGroup, cakeGroup, giftGroup, ribbon, heartTopper;
let flames = [], dustPts, emberPts, haloLight, keyLight, rimLight;
let craneFlock = [], petalField = null, auroraMesh = null;
let glOK = false, blowing = false;

const targetLook  = new THREE.Vector3(0, 1.4, 0);   // camera focus point (animated on scroll)
const mouse       = { x: 0, y: 0, tx: 0, ty: 0 };   // smoothed mouse for parallax

function initThree() {
  if (TIER === 'off') return false;
  const holder = $('#gl');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  holder.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0910, 0.028);
  camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 60);
  camera.position.set(0, 2.6, 9.5);
  camera.lookAt(targetLook);

  /* --- lights: warm key + rose fill + gold rim + halo --- */
  scene.add(new THREE.AmbientLight(0x2a1f30, 1.6));

  keyLight = new THREE.DirectionalLight(0xffe6c4, 2.2);
  keyLight.position.set(4, 7, 4);
  keyLight.castShadow = !small;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -7;
  keyLight.shadow.camera.right = keyLight.shadow.camera.top = 7;
  scene.add(keyLight);

  rimLight = new THREE.DirectionalLight(0xd97d96, 1.1);
  rimLight.position.set(-5, 3.5, -4);
  scene.add(rimLight);

  haloLight = new THREE.PointLight(0xffb35c, 0, 10, 2);  // candle glow, intensity ∝ lit flames
  haloLight.position.set(0, 3.95, 0);
  scene.add(haloLight);

  buildTable();
  buildCake();
  buildGifts();
  buildDust();
  if (Q.ember) buildEmbers();

  /* background life: aurora glow, paper-crane flock, falling petals */
  buildAurora();
  buildCranes();
  buildPetals();
  window.__BW = { scene, camera };   // debug handle for console inspection

  addEventListener('resize', onResize);
  addEventListener('pointermove', e => {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  glOK = true;
  renderer.setAnimationLoop(tick);
  return true;
}

/* materials reused across meshes */
const MAT = {
  cloth : () => new THREE.MeshStandardMaterial({ color: 0x241628, roughness: .92 }),
  sponge: () => new THREE.MeshStandardMaterial({ color: 0x5a3a4a, roughness: .9 }),
  cream : () => new THREE.MeshStandardMaterial({ color: 0xf3e0e6, roughness: .55 }),
  icing : c => new THREE.MeshStandardMaterial({ color: c, roughness: .42, metalness: .08 }),
  candle: () => new THREE.MeshStandardMaterial({ color: 0xf6d8e0, roughness: .5 }),
  gold  : () => new THREE.MeshStandardMaterial({ color: 0xe8c58c, roughness: .3, metalness: .65 }),
  paper : () => new THREE.MeshStandardMaterial({ color: 0xefe2d8, roughness: .85 }),
};

function buildTable() {
  tableGroup = new THREE.Group();
  const cloth = new THREE.Mesh(
    new THREE.CylinderGeometry(6.6, 6.6, .22, 72),
    MAT.cloth()
  );
  cloth.position.y = -0.11;
  cloth.receiveShadow = !small;
  tableGroup.add(cloth);

  const runner = new THREE.Mesh(                    // blush runner across the table
    new THREE.BoxGeometry(11, .03, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x6e3a4c, roughness: .85 })
  );
  runner.position.y = .03;
  runner.receiveShadow = !small;
  tableGroup.add(runner);
  scene.add(tableGroup);
}

/* ---------- procedural cake-surface textures (canvas → texture) ---------- */
function makeStripesTexture(colA, colB, stripes = 10) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  const w = c.width / stripes;
  for (let i = 0; i < stripes; i++) {
    x.fillStyle = i % 2 ? colA : colB;
    x.fillRect(i * w, 0, w + 1, c.height);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSprinklesTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4e3d7';
  x.fillRect(0, 0, c.width, c.height);
  const cols = ['#e58ba2', '#e8c58c', '#fdf6f0', '#d97d96', '#b95c78', '#c99b5f', '#f6a9bd'];
  for (let i = 0; i < 240; i++) {
    x.save();
    x.translate(Math.random() * c.width, Math.random() * c.height);
    x.rotate(Math.random() * Math.PI);
    x.fillStyle = cols[(Math.random() * cols.length) | 0];
    x.globalAlpha = .9;
    x.fillRect(-5, -1.5, 10, 3);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildCake() {
  cakeGroup = new THREE.Group();
  const DET = small ? .55 : 1;            // detail dial for weaker devices
  const SEG = small ? 44 : 72;            // lathe segment count
  const SH = .16;                         // shoulder rounding radius

  /* PBR environment — a tiny hand-built "studio" that metals reflect */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const card = (col, x, y, z, s) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 16), new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(x, y, z);
    env.add(m);
  };
  card(0xffd9b0,  5, 7,  4, 6);   // warm key card
  card(0xf0a3b7, -6, 4, -5, 5);   // rose fill card
  card(0xe8c58c,  0, 2,  7, 4);   // gold front card
  scene.environment = pmrem.fromScene(env, 0).texture;
  pmrem.dispose();

  /* materials */
  const gold      = new THREE.MeshStandardMaterial({ color: 0xe8c58c, metalness: 1, roughness: .22, envMapIntensity: 1.5 });
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xfbf4f6, roughness: .16, envMapIntensity: 1.1 });
  const pearl     = new THREE.MeshPhysicalMaterial({ color: 0xf8eef1, roughness: .3, clearcoat: .9, clearcoatRoughness: .2 });
  const roseIce   = new THREE.MeshPhysicalMaterial({ color: 0xe39aab, roughness: .38, clearcoat: .6, clearcoatRoughness: .35 });
  const sprinkle  = new THREE.MeshPhysicalMaterial({ map: makeSprinklesTexture(), roughness: .42, clearcoat: .45, clearcoatRoughness: .4 });
  const berry     = new THREE.MeshPhysicalMaterial({ color: 0x9c2f52, roughness: .22, clearcoat: 1, clearcoatRoughness: .12 });
  const pearlGeo  = new THREE.SphereGeometry(.052, 10, 10);   // shared by every pearl
  const berryGeo  = new THREE.SphereGeometry(.08, 12, 12);    // shared by every berry
  const candleTex = makeStripesTexture('#f6d8e0', '#d97d96', 10);

  /* --- cake stand: porcelain base + gold turned stem + plate + gold lip --- */
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.42, 2.66, .16, SEG), porcelain);
  base.position.y = .08;
  const stemPts = [
    new THREE.Vector2(1.05, .16), new THREE.Vector2(.72, .22), new THREE.Vector2(.55, .34),
    new THREE.Vector2(.8, .46), new THREE.Vector2(1.45, .56), new THREE.Vector2(1.6, .62),
  ];
  const stem = new THREE.Mesh(new THREE.LatheGeometry(stemPts, SEG), gold);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.42, .1, SEG), porcelain);
  plate.position.y = .68;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(2.56, .04, 12, SEG), gold);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = .73;
  cakeGroup.add(base, stem, plate, lip);

  const TABLE_Y = .73;                    // plate surface height

  /* --- tiers: lathe profile with rounded shoulders, hanging glaze drips,
         piped bottom borders and pearl borders along each top edge --- */
  const tiers = [
    { r: 2.0,  h: .78, mat: roseIce,  drips: 18, roses: 7 },
    { r: 1.45, h: .7,  mat: sprinkle, drips: 14, roses: 0 },   // funfetti tier
    { r: .95,  h: .62, mat: roseIce,  drips: 10, roses: 3 },
  ];
  let ty = TABLE_Y;
  tiers.forEach(t => {
    const prof = [
      new THREE.Vector2(t.r * .8, 0),
      new THREE.Vector2(t.r * .995, .03),
      new THREE.Vector2(t.r, t.h - SH),
    ];
    for (let i = 1; i <= 5; i++) {        // quarter-round shoulder into the top
      const a = (i / 5) * Math.PI / 2;
      prof.push(new THREE.Vector2(t.r - (1 - Math.cos(a)) * SH, t.h - SH + Math.sin(a) * SH));
    }
    prof.push(new THREE.Vector2(.001, t.h));
    const tier = new THREE.Mesh(new THREE.LatheGeometry(prof, SEG), t.mat);
    tier.position.y = ty;
    cakeGroup.add(tier);

    /* glaze drips hanging from the shoulder */
    const dn = Math.round(t.drips * DET);
    for (let i = 0; i < dn; i++) {
      const len = rand(.12, .3) + (i % 3 === 0 ? .1 : 0);
      const drip = new THREE.Mesh(new THREE.CapsuleGeometry(.055, len, 3, 8), t.mat);
      const a = (i / dn) * Math.PI * 2 + rand(-.1, .1);
      drip.position.set(Math.cos(a) * (t.r - .01), ty + t.h - .05 - len / 2, Math.sin(a) * (t.r - .01));
      cakeGroup.add(drip);
    }

    /* piped bottom border */
    const border = new THREE.Mesh(new THREE.TorusGeometry(t.r - .06, .045, 8, SEG), roseIce);
    border.rotation.x = Math.PI / 2;
    border.position.y = ty + .05;
    cakeGroup.add(border);

    /* pearl border along the top edge */
    const pn = Math.max(8, Math.round(((Math.PI * 2 * (t.r - .12)) / .17) * DET));
    for (let i = 0; i < pn; i++) {
      const a = (i / pn) * Math.PI * 2;
      const p = new THREE.Mesh(pearlGeo, pearl);
      p.position.set(Math.cos(a) * (t.r - .12), ty + t.h + .03, Math.sin(a) * (t.r - .12));
      cakeGroup.add(p);
    }
    t._y = ty;                            // remembered for the decorations pass
    ty += t.h;
  });
  const TOP_Y = ty;                       // top tier surface

  /* rosettes & sugared berries on the exposed rings of each tier top */
  const rosette = () => {
    const g = new THREE.Group();
    const s1 = new THREE.Mesh(new THREE.TorusGeometry(.11, .045, 8, 18, 4.9), roseIce);
    const s2 = new THREE.Mesh(new THREE.TorusGeometry(.065, .04, 8, 14, 4.9), roseIce);
    s1.rotation.x = s2.rotation.x = Math.PI / 2;
    s2.position.y = .045; s2.rotation.z = 1.2;
    g.add(s1, s2);
    return g;
  };
  tiers.forEach((t, ti) => {
    const nextR = tiers[ti + 1] ? tiers[ti + 1].r : 0;
    const rMin = nextR + .24, rMax = t.r - .18;
    const rMid = (rMin + rMax) / 2;
    for (let i = 0; i < t.roses; i++) {
      const a = (i / t.roses) * Math.PI * 2 + .4;
      const rose = rosette();
      rose.position.set(Math.cos(a) * rMid, t._y + t.h + .015, Math.sin(a) * rMid);
      rose.rotation.y = rand(0, 6);
      cakeGroup.add(rose);
    }
    const bn = ti === 0 ? 4 : ti === 1 ? 3 : 2;
    for (let i = 0; i < bn; i++) {
      const a = rand(0, Math.PI * 2);
      const rr = ti === 2 ? rand(.26, .42) : rand(rMin + .04, Math.max(rMin + .08, rMax - .04));
      const b = new THREE.Mesh(berryGeo, berry);
      b.scale.y = .8;
      b.position.set(Math.cos(a) * rr, t._y + t.h + .055, Math.sin(a) * rr);
      cakeGroup.add(b);
    }
  });

  /* --- six striped candles with gold caps --- */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + .3;
    const cr = .64;
    const x = Math.cos(a) * cr, z = Math.sin(a) * cr;
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(.048, .052, .8, 14),
      new THREE.MeshStandardMaterial({ map: candleTex, roughness: .45 })
    );
    candle.position.set(x, TOP_Y + .4, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.054, .054, .045, 14), gold);
    cap.position.set(x, TOP_Y + .82, z);
    const wick = new THREE.Mesh(
      new THREE.CylinderGeometry(.008, .008, .08, 6),
      new THREE.MeshBasicMaterial({ color: 0x2a1c22 })
    );
    wick.position.set(x, TOP_Y + .87, z);
    const flame = makeFlame();
    flame.position.set(x, TOP_Y + .99, z);
    Object.assign(flame.userData, {
      lit: true,
      seed: Math.random() * 100,
      base: flame.position.clone(),
      smokeTimer: 0,
    });
    cakeGroup.add(candle, cap, wick, flame);
    flames.push(flame);
  }

  /* --- gold heart topper on a stem (sways in the render loop) --- */
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -.16);
  heartShape.bezierCurveTo(.2, .02, .16, .2, 0, .1);
  heartShape.bezierCurveTo(-.16, .2, -.2, .02, 0, -.16);
  const heart = new THREE.Mesh(
    new THREE.ExtrudeGeometry(heartShape, {
      depth: .05, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 3, curveSegments: 16,
    }),
    gold
  );
  heart.geometry.center();
  const heartStem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .42, 8), gold);
  heartStem.position.y = TOP_Y + .21;
  heart.position.y = TOP_Y + .5;
  heartTopper = new THREE.Group();
  heartTopper.add(heartStem, heart);
  heartTopper.userData.baseY = heart.position.y;
  cakeGroup.add(heartTopper);

  /* --- rose petals scattered on the table + two on the stand --- */
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.quadraticCurveTo(.09, .05, .1, .14);
  petalShape.quadraticCurveTo(.06, .22, 0, .24);
  petalShape.quadraticCurveTo(-.06, .22, -.1, .14);
  petalShape.quadraticCurveTo(-.09, .05, 0, 0);
  const petalGeo = new THREE.ShapeGeometry(petalShape, 10);
  const petalMats = [0xe08fa4, 0xd97d96, 0xc96a85, 0xeeb3c2].map(col =>
    new THREE.MeshPhysicalMaterial({ color: col, roughness: .5, clearcoat: .5, side: THREE.DoubleSide }));
  const petals = [];
  const dropPetal = (px, py, pz, s) => {
    const p = new THREE.Mesh(petalGeo, petalMats[(Math.random() * 4) | 0]);
    p.position.set(px, py, pz);
    p.rotation.set(-Math.PI / 2 + rand(-.25, .25), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    p.scale.setScalar(s);
    petals.push(p);
    cakeGroup.add(p);
  };
  const np = Math.round(30 * DET);
  for (let i = 0; i < np; i++) {
    const a = rand(0, Math.PI * 2), r = rand(2.9, 5.6);
    let px = Math.cos(a) * r, pz = Math.sin(a) * r;
    if (Math.abs(pz) < .95) pz += Math.sign(pz || 1) * 1.1;   // keep the runner clear
    dropPetal(px, .015 + rand(0, .012), pz, rand(.8, 1.5));
  }
  for (let i = 0; i < 2; i++) {
    const a = rand(0, Math.PI * 2), r = rand(2.2, 2.42);
    dropPetal(Math.cos(a) * r, .745, Math.sin(a) * r, rand(.7, .95));
  }

  cakeGroup.traverse(m => {
    if (m.isMesh && !petals.includes(m)) { m.castShadow = !small; m.receiveShadow = !small; }
  });
  scene.add(cakeGroup);
}

/* ============================================================
   BACKGROUND LIFE — the "thousand cranes" sky
   Japanese lore: whoever folds a thousand paper cranes is
   granted a wish. A flock of them circles the cake, petals
   drift down, and a quiet aurora breathes behind everything.
   ============================================================ */

/* aurora = big shader plane, value-noise bands, whisper-quiet alpha */
function buildAurora() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main(){
        vec2 uv = vUv;
        float t = uTime * 0.03;
        float n  = noise(uv * 3.0 + vec2(t, -t * 0.6));
        n += 0.5 * noise(uv * 6.0 - vec2(t * 1.3, t * 0.4));
        n /= 1.5;
        vec3 violet = vec3(0.36, 0.22, 0.45);
        vec3 rose   = vec3(0.85, 0.49, 0.60);
        vec3 gold   = vec3(0.91, 0.77, 0.55);
        vec3 col = mix(violet, rose, smoothstep(0.15, 0.75, uv.y + n * 0.25));
        col = mix(col, gold, smoothstep(0.55, 1.0, n) * 0.5);
        float vig = smoothstep(1.0, 0.35, distance(uv, vec2(0.5)));
        gl_FragColor = vec4(col, n * 0.15 * vig);   // keep it a whisper
      }`,
  });
  auroraMesh = new THREE.Mesh(new THREE.PlaneGeometry(48, 26), mat);
  auroraMesh.position.set(0, 5.5, -17);
  scene.add(auroraMesh);
}

/* one crane = folded-triangle body + neck + tail + two flapping wings */
function makeCrane(mat) {
  const crane = new THREE.Group();
  const tri = (verts) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  /* folded body: two shallow triangles meeting at the spine */
  crane.add(tri([.3, 0, 0,  -.3, .03, 0,  0, 0, .1]));
  crane.add(tri([.3, 0, 0,  -.3, .03, 0,  0, 0, -.1]));
  /* neck rising to a head tip */
  crane.add(tri([.3, .02, 0,  .26, .02, .04,  .5, .34, 0]));
  crane.add(tri([.5, .34, 0,  .58, .27, .01,  .5, .25, 0]));
  /* tail */
  crane.add(tri([-.3, .02, 0,  -.26, .02, .04,  -.52, .32, 0]));
  /* wings pivot on the spine (x-axis) so they can flap */
  const wingGeoL = new THREE.BufferGeometry();
  wingGeoL.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    .15, 0, .02,  -.28, 0, .02,  -.02, -.06, .95
  ]), 3));
  wingGeoL.computeVertexNormals();
  const wingGeoR = wingGeoL.clone();
  wingGeoR.scale(1, 1, -1);                       // mirrored wing
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  wingL.add(new THREE.Mesh(wingGeoL, mat));
  wingR.add(new THREE.Mesh(wingGeoR, mat));
  wingL.position.y = wingR.position.y = .04;
  crane.add(wingL, wingR);
  crane.userData = { wingL, wingR };
  return crane;
}

function buildCranes() {
  craneFlock = [];
  const paper     = new THREE.MeshStandardMaterial({ color: 0xf7eff2, roughness: .6, side: THREE.DoubleSide });
  const paperRose = new THREE.MeshStandardMaterial({ color: 0xefc3cf, roughness: .6, side: THREE.DoubleSide });
  const n = small ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const crane = makeCrane(i % 3 === 0 ? paperRose : paper);
    crane.scale.setScalar(rand(.5, .85));
    craneFlock.push({
      g: crane,
      radius: rand(2.8, 7),
      height: rand(3.7, 5.9),   // kept inside the hero camera's sky band
      speed: rand(.05, .11) * (i % 2 ? 1 : -1),   // two lanes, opposite directions
      phase: rand(0, Math.PI * 2),
      flapSpeed: rand(5, 7.5),
      flapPhase: rand(0, Math.PI * 2),
    });
    scene.add(crane);
  }
}

/* falling petals — one InstancedMesh, per-instance drift + tumble */
function buildPetals() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(.09, .05, .1, .14);
  shape.quadraticCurveTo(.06, .22, 0, .24);
  shape.quadraticCurveTo(-.06, .22, -.1, .14);
  shape.quadraticCurveTo(-.09, .05, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .55, side: THREE.DoubleSide });
  const n = small ? 26 : 64;
  petalField = new THREE.InstancedMesh(geo, mat, n);
  const cols = [0xe08fa4, 0xd97d96, 0xeeb3c2, 0xf3cdd7];
  const c = new THREE.Color();
  petalField.userData.drops = [];
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = rand(2.2, 9.5);
    petalField.userData.drops.push({
      x: Math.cos(a) * r,
      y: rand(-.5, 9.5),
      z: Math.sin(a) * r - 1.5,
      fall: rand(.35, .8),
      swayA: rand(0, Math.PI * 2),
      swayF: rand(.6, 1.3),
      tumble: rand(.5, 2),
      scale: rand(.8, 1.6),
    });
    petalField.setColorAt(i, c.setHex(cols[i % cols.length]));
  }
  petalField.instanceColor.needsUpdate = true;
  scene.add(petalField);
}

function updateAmbient(dt, t) {
  if (auroraMesh) auroraMesh.material.uniforms.uTime.value = t;

  /* cranes: circle above the cake, bank inward, flap — with glide phases */
  for (const k of craneFlock) {
    const a = k.phase + t * k.speed;
    k.g.position.set(
      Math.cos(a) * k.radius,
      k.height + Math.sin(t * .7 + k.phase) * .35,
      Math.sin(a) * k.radius - 2
    );
    k.g.rotation.y = -a - Math.PI / 2;
    k.g.rotation.z = .22 * Math.sign(k.speed);       // bank into the turn
    const glide = .25 + .75 * Math.max(0, Math.sin(t * .31 + k.phase * 2));
    const f = clamp(.28 + Math.sin(t * k.flapSpeed + k.flapPhase) * .3, .05, .7) * glide;
    k.g.userData.wingL.rotation.x = -f;
    k.g.userData.wingR.rotation.x =  f;
  }

  /* petals: fall, sway, tumble, respawn at the top */
  if (petalField) {
    petalField.userData.drops.forEach((d, i) => {
      d.y -= d.fall * dt;
      if (d.y < .1) d.y = rand(8.5, 10);
      _dummy.position.set(
        d.x + Math.sin(t * d.swayF + d.swayA) * .55,
        d.y,
        d.z + Math.cos(t * d.swayF * .8 + d.swayA) * .4
      );
      _dummy.rotation.set(t * d.tumble * .7 + d.swayA, t * d.tumble, d.swayA);
      _dummy.scale.setScalar(d.scale);
      _dummy.updateMatrix();
      petalField.setMatrixAt(i, _dummy.matrix);
    });
    petalField.instanceMatrix.needsUpdate = true;
  }
}

/* a flame = layered sprites (core + glow), gently flickering */
function makeFlame() {
  const g = new THREE.Group();
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flameTexture('#fff6dd', '#ffcf7a'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  core.scale.set(.16, .34, 1);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flameTexture('#ffcf9a', 'rgba(255,150,70,0)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .8,
  }));
  glow.scale.set(.42, .6, 1);
  g.add(core, glow);
  g.userData.core = core; g.userData.glow = glow;
  return g;
}

function flameTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 40, 2, 32, 38, 30);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  x.fillStyle = grd;
  x.beginPath(); x.ellipse(32, 38, 14, 22, 0, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

function buildGifts() {
  giftGroup = new THREE.Group();
  const spots = [[-3.4, .9], [3.3, .75], [-1.9, -2.4]];
  const palette = [
    { box: 0x3a2444, rib: 0xe8c58c },
    { box: 0x4c2536, rib: 0xe894ab },
    { box: 0x2b2033, rib: 0xf6eef1 },
  ];
  spots.forEach((s, i) => {
    const g = new THREE.Group();
    const p = palette[i];
    const size = .8 + i * .12;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size, size * .8, size),
      new THREE.MeshStandardMaterial({ color: p.box, roughness: .6 })
    );
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(size * 1.12, size * .18, size * 1.12),
      new THREE.MeshStandardMaterial({ color: p.box, roughness: .5 })
    );
    lid.position.y = size * .49;
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(size * 1.14, size * .19, size * .16),
      new THREE.MeshStandardMaterial({ color: p.rib, roughness: .35, metalness: .4 })
    );
    ribbon.position.y = size * .49;
    const ribbon2 = ribbon.clone();
    ribbon2.rotation.y = Math.PI / 2;
    g.add(body, lid, ribbon, ribbon2);
    g.position.set(s[0], size * .4, s[1]);
    g.rotation.y = rand(-.5, .5);
    g.traverse(m => { if (m.isMesh) { m.castShadow = !small; m.receiveShadow = !small; } });
    g.userData = { lid, baseY: g.position.y, lidY: lid.position.y, phase: rand(0, 6) };
    giftGroup.add(g);
  });
  scene.add(giftGroup);
}

function buildDust() {
  const n = Q.dust;
  const pos = new Float32Array(n * 3);
  const spd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rand(3, 12), a = rand(0, Math.PI * 2);
    pos[i * 3]     = Math.cos(a) * r;
    pos[i * 3 + 1] = rand(-1, 9);
    pos[i * 3 + 2] = Math.cos(a) * rand(3, 10) - 2;
    spd[i] = rand(.06, .3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe8c58c, size: .035, transparent: true, opacity: .5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  dustPts = new THREE.Points(geo, mat);
  dustPts.userData.spd = spd;
  scene.add(dustPts);
}

/* embers rise from the candles while they burn */
function buildEmbers() {
  const n = Q.ember;
  const pos = new Float32Array(n * 3);
  const life = new Float32Array(n);
  const reset = (i, init = false) => {
    const a = rand(0, Math.PI * 2), r = rand(0, .85);
    pos[i * 3]     = Math.cos(a) * r;
    pos[i * 3 + 1] = init ? rand(3.9, 5.6) : rand(3.85, 4.1);
    pos[i * 3 + 2] = Math.sin(a) * r;
    life[i] = 0;
  };
  for (let i = 0; i < n; i++) reset(i, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffb35c, size: .05, transparent: true, opacity: .65,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  emberPts = new THREE.Points(geo, mat);
  emberPts.userData = { life, reset };
  scene.add(emberPts);
}

/* ---------- render loop ---------- */
const clock = new THREE.Clock();
const flameCountEl = $('#flameCount');
const _dummy = new THREE.Object3D();               // shared matrix scratch for instancing
function tick() {
  const dt = Math.min(clock.getDelta(), .05);
  const t  = clock.elapsedTime;

  mouse.x = lerp(mouse.x, mouse.tx, .045);
  mouse.y = lerp(mouse.y, mouse.ty, .045);

  /* candle flames flicker; dead flames shrink out + puff smoke */
  let lit = 0;
  for (const f of flames) {
    const u = f.userData;
    if (u.lit) {
      lit++;
      const s = 1 + Math.sin(t * 11 + u.seed) * .14 + Math.sin(t * 23 + u.seed * 2) * .07;
      f.scale.set(1, s, 1);
      f.position.x = u.base.x + Math.sin(t * 7 + u.seed) * .006;
      f.position.z = u.base.z + Math.cos(t * 6 + u.seed) * .006;
      if (f.userData.core) f.userData.core.material.rotation = Math.sin(t * 9 + u.seed) * .1;
    } else if (f.scale.y > .01) {
      f.scale.multiplyScalar(1 - dt * 9);
      u.smokeTimer += dt;
    }
  }
  if (haloLight) haloLight.intensity = lerp(haloLight.intensity, lit * 1.15, .1);
  litFlames = lit;
  if (flameCountEl && +flameCountEl.textContent !== lit) flameCountEl.textContent = lit;

  if (emberPts) {
    const { life, reset } = emberPts.userData;
    const pos = emberPts.geometry.attributes.position;
    for (let i = 0; i < life.length; i++) {
      life[i] += dt;
      pos.array[i * 3 + 1] += dt * .8;
      pos.array[i * 3]     += Math.sin(t * 2 + i) * dt * .12;
      if (life[i] > rand(1.4, 2.2)) reset(i);
    }
    pos.needsUpdate = true;
    emberPts.material.opacity = lit ? .6 : 0;
  }

  if (dustPts) {
    const pos = dustPts.geometry.attributes.position, spd = dustPts.userData.spd;
    for (let i = 0; i < spd.length; i++) {
      pos.array[i * 3 + 1] += spd[i] * dt;
      if (pos.array[i * 3 + 1] > 9) pos.array[i * 3 + 1] = -1;
    }
    pos.needsUpdate = true;
  }

  /* gift bobbing (unless mid pop) */
  if (giftGroup && !giftPop) {
    giftGroup.children.forEach((g, i) => {
      g.position.y = g.userData.baseY + Math.sin(t * 1.4 + g.userData.phase) * .05;
      g.rotation.y += dt * .12;
    });
  }

  /* gold heart topper sways gently */
  if (heartTopper) {
    heartTopper.rotation.z = Math.sin(t * 1.6) * .06;
    heartTopper.rotation.x = Math.cos(t * 1.15) * .045;
  }

  /* camera parallax from mouse + scroll-driven framing (set by ScrollTrigger) */
  if (camera) {
    camera.position.x = lerp(camera.position.x, camGoal.x + mouse.x * .55, .06);
    camera.position.y = lerp(camera.position.y, camGoal.y + mouse.y * -.3, .06);
    camera.position.z = lerp(camera.position.z, camGoal.z, .06);
    targetLook.lerp(lookGoal, .06);
    camera.lookAt(targetLook);
    cakeGroup.rotation.y += dt * .1;
    ribbon.rotation.z += dt * .2;
  }

  updateAmbient(dt, t);
  renderer.render(scene, camera);
}

/* ---------- 5 · scroll choreography ---------- */
const camGoal  = new THREE.Vector3(0, 2.6, 9.5);   // current scroll targets
const lookGoal = new THREE.Vector3(0, 1.4, 0);
let stage = '';
let litFlames = 6;

function setStage(name) {
  if (stage === name) return;
  stage = name;
  document.body.classList.toggle('stage-hero', name === 'hero');
  document.body.classList.toggle('stage-cta', name === 'cta');
  const pointer = name === 'hero' || name === 'cta';
  $('#gl').style.pointerEvents = pointer ? 'auto' : 'none';
  if (pointer && !flamePickAdded) addFlamePick();
}

function initScrollChoreo() {
  /* nav state + progress bar */
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: self => {
      $('#nav').classList.toggle('scrolled', self.scroll() > 40);
      $('#progress').style.transform = `scaleX(${self.progress})`;
    },
  });

  /* hero → letter: cake drifts right & shrinks slightly, camera rises */
  ScrollTrigger.create({
    trigger: '#letter', start: 'top 85%', end: 'top 20%', scrub: .6,
    onEnter:  () => setStage('letter'),
    onEnterBack: () => setStage('hero'),
    onUpdate: self => {
      if (reduced) return;                      // no scroll-driven camera under reduced motion
      const p = self.progress;
      camGoal.set(lerp(0, 2.6, p), lerp(2.6, 3.4, p), lerp(9.5, 11.5, p));
      lookGoal.set(lerp(0, -1.6, p), lerp(1.4, 1.2, p), 0);
    },
  });

  /* story: camera dives toward table level, cake larger on the left */
  ScrollTrigger.create({
    trigger: '#story', start: 'top 80%', end: 'bottom 30%', scrub: .6,
    onEnter:  () => setStage('story'),
    onLeaveBack: () => setStage('letter'),
    onUpdate: self => {
      if (reduced) return;
      const p = self.progress;
      camGoal.set(lerp(-1.8, 1.2, p), lerp(1.7, 2.4, p), lerp(6.4, 7.6, p));
      lookGoal.set(lerp(1.2, -1.4, p), 1.3, 0);
    },
  });

  /* cta: return to the original hero framing */
  ScrollTrigger.create({
    trigger: '#cta', start: 'top 80%', end: 'top 15%', scrub: .6,
    onEnter:      () => setStage('cta'),
    onEnterBack:  () => setStage('cta'),
    onLeaveBack:  () => setStage('story'),
    onUpdate: self => {
      if (reduced) return;
      const p = self.progress;
      camGoal.set(lerp(1.2, 0, p), lerp(2.4, 2.6, p), lerp(7.6, 9.5, p));
      lookGoal.set(lerp(-1.4, 0, p), lerp(1.3, 1.4, p), 0);
    },
  });

  /* generic reveals — one config, staggered per section */
  $$('[data-reveal]').forEach(el => {
    gsap.fromTo(el,
      { opacity: 0, y: 46 },
      {
        opacity: 1, y: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
      });
  });

  /* ============ richer motion layer ============ */
  if (reduced) return;

  /* 1 · hero content drifts up and dissolves as the scroll takes over */
  gsap.to('.hero-inner', {
    y: -90, opacity: 0, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: '85% top', scrub: true },
  });

  /* 2 · letter panel rises from a tilt; seal stamps in and signature spreads */
  gsap.timeline({
    scrollTrigger: { trigger: '[data-letter]', start: 'top 80%' },
  })
    .from('.letter-panel', { opacity: 0, y: 90, rotateX: 14, transformPerspective: 900, duration: 1.1, ease: 'power3.out' })
    .from('.seal', { scale: 2.2, opacity: 0, rotate: -30, duration: .55, ease: 'back.out(1.7)' }, '-=.5')
    .from('.letter-sign .hand', { letterSpacing: '.4em', opacity: 0, duration: .8, ease: 'power2.out' }, '-=.3')
    .from('.letter-ps', { opacity: 0, y: 14, duration: .6 }, '-=.4');

  /* 3 · reason cards cascade in batches (a wave, not a wall) */
  ScrollTrigger.batch('.reason-card', {
    interval: .12, batchMax: 7, start: 'top 92%',
    onEnter: batch => {
      batch.forEach((el, i) => {
        el.style.transitionDelay = (i * .06) + 's';
        requestAnimationFrame(() => el.classList.add('in'));   // .in → CSS transition
        setTimeout(() => { el.style.transitionDelay = '0s'; }, 900 + i * 60);
      });
    },
  });

  /* 4 · gifts drop in with a bounce; wishes settle with alternating rotation */
  gsap.from('.gift', { y: 70, opacity: 0, stagger: .14, duration: .9, ease: 'back.out(1.5)',
    scrollTrigger: { trigger: '.gifts-row', start: 'top 82%' } });
  gsap.from('.wish', { y: 56, opacity: 0, rotate: i => (i % 2 ? 2.4 : -2.4), stagger: .12, duration: .9, ease: 'power3.out',
    scrollTrigger: { trigger: '.wishes-grid', start: 'top 82%' } });

  /* 5 · timeline nodes ignite chapter by chapter (and dim when re-approached) */
  $$('.tl-item').forEach(item => {
    ScrollTrigger.create({
      trigger: item, start: 'top 66%',
      onEnter:     () => item.classList.add('lit'),
      onLeaveBack: () => item.classList.remove('lit'),
    });
  });

  /* 6 · stat values rise on their own layer */
  gsap.from('.stat .stat-value', { yPercent: 40, opacity: 0, stagger: .1, duration: .9, ease: 'power3.out',
    scrollTrigger: { trigger: '.stats-grid', start: 'top 80%' } });

  /* 7 · footer tagline parallax; marquee hurries while on screen */
  gsap.to('.footer-tag', { y: -26, ease: 'none',
    scrollTrigger: { trigger: '#footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  const mTrack = $('.marquee-track');
  if (mTrack) {
    ScrollTrigger.create({
      trigger: '.marquee', start: 'top bottom', end: 'bottom top',
      onToggle: self => { mTrack.style.animationDuration = self.isActive ? '26s' : '42s'; },
    });
  }

  /* 7.5 · eyebrow rules draw in when each section head arrives */
  $$('.section-head').forEach(h => {
    ScrollTrigger.create({ trigger: h, start: 'top 85%', once: true, onEnter: () => h.classList.add('in') });
  });

  /* 8 · active nav link tracking */
  $$('.nav-link').forEach(link => {
    const sec = document.getElementById(link.dataset.section);
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec, start: 'top 55%', end: 'bottom 45%',
      onToggle: self => link.classList.toggle('active', self.isActive),
    });
  });

  /* 9 · shared pointer-tilt for letter panel, wishes and stats */
  if (!touch) {
    ['[data-letter]', '.wish', '.stat'].forEach(sel => {
      $$(sel).forEach(card => {
        card.addEventListener('pointermove', e => {
          const b = card.getBoundingClientRect();
          const px = (e.clientX - b.left) / b.width - .5;
          const py = (e.clientY - b.top) / b.height - .5;
          gsap.to(card, { rotateY: px * 6, rotateX: -py * 6, transformPerspective: 800, duration: .5, ease: 'power2.out' });
        });
        card.addEventListener('pointerleave', () =>
          gsap.to(card, { rotateX: 0, rotateY: 0, duration: .8, ease: 'power2.out' }));
      });
    });
  }

  /* THEN & NOW section choreography + sparkle field */
  if (TN_MODULE) {
    TN_MODULE.choreo();
    TN_MODULE.sparks();
  }

  /* letter paragraphs cascade */
  gsap.fromTo('[data-lp]',
    { opacity: 0, y: 30 },
    {
      opacity: 1, y: 0, duration: .9, stagger: .18, ease: 'power2.out',
      scrollTrigger: { trigger: '[data-letter]', start: 'top 72%' },
    });

  /* stat counters */
  $$('[data-count]').forEach(el => {
    const end = +el.dataset.count, suf = el.dataset.suffix || '';
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 85%', once: true,
      onEnter: () => gsap.to(obj, {
        v: end, duration: reduced ? .01 : 2, ease: 'power2.out',
        onUpdate: () => { el.textContent = Math.round(obj.v) + suf; },
      }),
    });
  });

  /* timeline spine grows as chapters pass */
  ScrollTrigger.create({
    trigger: '#timeline', start: 'top 70%', end: 'bottom 55%', scrub: .5,
    onUpdate: self => { $('#tlSpine').style.transform = `scaleY(${self.progress})`; },
  });

  /* apply initial state (nav + stage) on load / mid-page reloads */
  $('#nav').classList.toggle('scrolled', scrollY > 40);
  setStage('hero');
}

/* ---------- 6 · interactions ---------- */

/* entrance after loader */
function startEntrance() {
  const words = $$('#heroTitle .word');
  if (reduced) { gsap.set(words, { y: 0 }); gsap.set('[data-hero]', { opacity: 1 }); return; }
  gsap.timeline({ defaults: { ease: 'power4.out' } })
    .to('#heroTitle .word', { y: 0, duration: 1.2, stagger: .1 })
    .to('[data-hero]', { opacity: 1, y: 0, duration: .9, stagger: .12 }, '-=.7');
}

/* once the entrance settles, re-measure everything: the loader unlock and
   the first Lenis frame shift real scroll geometry, and reveal triggers
   created before that hold stale positions (sections stuck at opacity 0). */
setTimeout(() => ScrollTrigger.refresh(), 1600);
gsap.set('[data-hero]', { opacity: 0, y: 26 });

/* --- blow the candles: hold the button (progress ring), or click a flame --- */
const blowState = { hold: 0, raf: 0 };
function beginBlow(btn) {
  if (blowing || litFlames === 0) { if (litFlames === 0) toast('the candles are already out — wish granted ✦'); return; }
  blowing = true;
  btn.classList.add('holding');
  const start = performance.now();
  const DUR = 1500;
  (function step(now) {
    const p = clamp((now - start) / DUR, 0, 1);
    btn.style.setProperty('--p', (p * 100) + '%');
    /* flames lean away while blowing */
    flames.forEach(f => { if (f.userData.lit) f.position.x = f.userData.base.x - p * .18 * Math.random(); });
    if (p < 1 && blowing) { blowState.raf = requestAnimationFrame(step); }
    else if (p >= 1) {
      btn.style.setProperty('--p', '0%');
      btn.classList.remove('holding');
      extinguishAll();
      blowing = false;
    }
  })(start);
}
function endBlow(btn) {
  blowing = false;
  btn.classList.remove('holding');
  cancelAnimationFrame(blowState.raf);
  btn.style.setProperty('--p', '0%');
}

function extinguishAll() {
  let i = 0;
  flames.forEach(f => { if (f.userData.lit) setTimeout(() => puff(f), i++ * 110); });
  setTimeout(() => {
    confettiBurst(160);
    toast('candles out. wish locked in ✦');
    $('#navCta .btn-label').textContent = 'Relight';
  }, 700);
}

/* click an individual flame to blow just that one */
let flamePickAdded = false;
function addFlamePick() {
  if (flamePickAdded || !renderer) return;
  flamePickAdded = true;
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const dom = renderer.domElement;
  dom.style.cursor = 'pointer';
  dom.addEventListener('pointerdown', e => {
    if (!flames.some(f => f.userData.lit)) return;
    ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(flames.map(f => f.userData.core));
    if (hits.length) {
      const f = flames.find(f => f.userData.core === hits[0].object);
      puff(f);
      if (!flames.some(f => f.userData.lit)) {
        setTimeout(() => { confettiBurst(160); toast('all out — nice aim ✦'); }, 400);
      }
    }
  });
}
function puff(f) {
  if (!f.userData.lit) return;
  f.userData.lit = false;
  gsap.to(f.scale, { x: .01, y: .01, duration: .25, ease: 'power2.in' });
  smokeAt(f.position);
}

/* relight (nav CTA toggles) */
function toggleRelight() {
  if (litFlames === 0) {
    flames.forEach(f => {
      f.userData.lit = true;
      gsap.to(f.scale, { x: 1, y: 1, duration: .5, ease: 'back.out(2)' });
    });
    $('#navCta .btn-label').textContent = 'Blow the candles';
    toast('relit. wish responsibly this time ✦');
  } else {
    const hero = $('#hero');
    scrollToTarget(hero);
    setTimeout(() => beginBlow($('#blowBtn')), reduced ? 0 : 1200);
  }
}
$('#navCta').addEventListener('click', e => { e.preventDefault(); toggleRelight(); });
[['#blowBtn', true], ['#blowBtn2', false]].forEach(([sel]) => {
  const b = $(sel); if (!b) return;
  b.addEventListener('pointerdown', () => beginBlow(b));
  b.addEventListener('pointerup',   () => endBlow(b));
  b.addEventListener('pointerleave', () => endBlow(b));
  b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); beginBlow(b); } });
  b.addEventListener('keyup',   e => { if (e.key === ' ' || e.key === 'Enter') endBlow(b); });
});

/* --- smoke puffs (DOM sprites, cheap) --- */
function smokeAt(worldPos) {
  if (reduced || small) return;
  const v = worldPos.clone().project(camera);
  const x = (v.x * .5 + .5) * innerWidth;
  const y = (-v.y * .5 + .5) * innerHeight;
  for (let i = 0; i < 4; i++) {
    const s = document.createElement('span');
    s.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:10px;height:10px;border-radius:50%;
      background:radial-gradient(circle,rgba(200,190,200,.5),transparent 70%);pointer-events:none;z-index:104;`;
    document.body.appendChild(s);
    gsap.to(s, {
      x: rand(-26, 26), y: -rand(40, 80), scale: rand(1.6, 2.6), opacity: 0,
      duration: rand(1, 1.6), ease: 'power1.out', onComplete: () => s.remove(),
    });
  }
}

/* --- confetti canvas --- */
const confCanvas = $('#confetti'), confCtx = confCanvas.getContext('2d');
let confBits = [], confRunning = false;
function sizeConfetti() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  confCanvas.width = innerWidth * dpr;
  confCanvas.height = innerHeight * dpr;
  confCtx.setTransform(dpr, 0, 0, dpr, 0, 0);   // crisp on retina, no cumulative scaling
}
sizeConfetti(); addEventListener('resize', sizeConfetti);
const CONF_COLORS = ['#f0a3b7', '#e8c58c', '#f6eef1', '#d97d96', '#c99b5f'];
function confettiBurst(n = 120, x = innerWidth / 2, y = innerHeight * .35) {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    confBits.push({
      x, y, w: rand(5, 10), h: rand(3, 6),
      vx: rand(-4, 4), vy: rand(-7, -2), r: rand(0, Math.PI), vr: rand(-.2, .2),
      c: CONF_COLORS[i % CONF_COLORS.length], life: 1,
    });
  }
  if (!confRunning) { confRunning = true; requestAnimationFrame(confTick); }
}
function confTick() {
  confCtx.clearRect(0, 0, innerWidth, innerHeight);
  confBits = confBits.filter(b => b.life > 0 && b.y < innerHeight + 20);
  for (const b of confBits) {
    b.vy += .12; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.life -= .004;
    confCtx.save();
    confCtx.translate(b.x, b.y); confCtx.rotate(b.r);
    confCtx.globalAlpha = Math.max(b.life, 0);
    confCtx.fillStyle = b.c;
    confCtx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    confCtx.restore();
  }
  if (confBits.length) requestAnimationFrame(confTick);
  else { confRunning = false; confCtx.clearRect(0, 0, innerWidth, innerHeight); }
}

/* --- 30 reasons --- */
const REASONS = [
  ['You laugh with your whole face — eyes first, everything else follows.'],
  ['You remember the tiny things everyone else forgets by Friday.'],
  ['Talking to you feels like the interesting part of the day.'],
  ['You make terrible playlists and defend them like a lawyer.'],
  ['You text “ok but listen—” and it is ALWAYS worth listening.'],
  ['You notice when a room feels off, and quietly fix it.'],
  ['You ask the second question — the one people actually mean.'],
  ['Your competitive streak at board games is honestly impressive.'],
  ['You give advice like you have already lived the outcome.'],
  ['You always root for the underdog, even in movies.'],
  ['You have a laugh that makes strangers in cafés smile.'],
  ['You know exactly which song a moment needs.'],
  ['You never make anyone feel small for not knowing something.'],
  ['You show up. Early, even. With snacks.'],
  ['You make ordinary plans sound like an event worth dressing for.'],
  ['You remember my coffee order better than I do.'],
  ['You treat waiters, drivers and cats with equal respect.'],
  ['Your “one more episode” resolve is a force of nature.'],
  ['You say what you mean, kindly — a rare build.'],
  ['You get excited about small wins like they are championships.'],
  ['You never let a good moment pass without saying so out loud.'],
  ['You are the person people text when it matters.'],
  ['You can make a Monday feel like a Friday. Scientifically unexplained.'],
  ['You have strong opinions about clouds, and they are correct.'],
  ['You give the kind of hugs that recalibrate a whole week.'],
  ['You notice new haircuts, new books, new anything — instantly.'],
  ['You keep your promises, even the silly ones.'],
  ['You make silence comfortable, which is harder than talking.'],
  ['You are brave in ways you never take credit for.'],
  ['You are you. That was always going to make the list.'],
];
const reasonsGrid = $('#reasonsGrid');
REASONS.forEach((r, i) => {
  const card = document.createElement('button');
  card.className = 'reason-card';
  card.type = 'button';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `Reason ${i + 1} of 30. Activate to reveal.`);
  card.dataset.cursor = 'flip';
  card.innerHTML = `
    <span class="face front" aria-hidden="true">
      <span class="idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="hint">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        tap to reveal
      </span>
    </span>
    <span class="face back">
      <span class="num">reason ${String(i + 1).padStart(2, '0')} / 30</span>
      <span class="txt">${r[0]}</span>
    </span>`;
  card.addEventListener('click', () => {
    const open = card.classList.toggle('open');
    card.setAttribute('aria-pressed', open);
    card.setAttribute('aria-label', open ? `Reason ${i + 1}: ${r[0]}. Activate to hide.` : `Reason ${i + 1} of 30. Activate to reveal.`);
    if (open && !card.classList.contains('found')) {
      card.classList.add('found');
      found++;
      $('#foundCount').textContent = found;
      $('#foundBar').style.transform = `scaleX(${found / 30})`;
      if (found === 10) toast('10 down — you read fast ✦');
      if (found === 30) setTimeout(openFinale, 600);
    }
  });
  card.addEventListener('pointermove', e => {      // subtle 3D tilt toward the pointer
    if (touch || reduced) return;
    const b = card.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - .5;
    const py = (e.clientY - b.top) / b.height - .5;
    card.style.transform = `rotateY(${px * 10}deg) rotateX(${py * -10}deg) translateZ(6px)`;
  });
  card.addEventListener('pointerleave', () => {
    card.style.transform = card.classList.contains('open') ? 'rotateY(180deg)' : '';
  });
  reasonsGrid.appendChild(card);
});
let found = 0;

function openFinale() {
  $('#finaleModal').classList.add('open');
  $('#finaleModal').setAttribute('aria-hidden', 'false');
  confettiBurst(220);
  $('.modal-close').focus();
}
$$('[data-close-modal]').forEach(el => el.addEventListener('click', () => {
  $('#finaleModal').classList.remove('open');
  $('#finaleModal').setAttribute('aria-hidden', 'true');
}));
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    $('#finaleModal').classList.remove('open');
    $('#finaleModal').setAttribute('aria-hidden', 'true');
    closeMenu();
  }
});

/* --- gifts --- */
$$('.gift-scene').forEach(scene => {
  const open = () => {
    const g = scene.closest('.gift');
    const isOpen = g.classList.toggle('open');
    scene.setAttribute('aria-pressed', isOpen);
    scene.querySelector('.gift-note').setAttribute('aria-hidden', !isOpen);
    $('.g-sub', g).textContent = isOpen ? 'opened ✓' : 'tap to open';
    if (isOpen) {
      const b = scene.getBoundingClientRect();
      confettiBurst(70, b.left + b.width / 2, b.top + b.height / 3);
    }
  };
  scene.addEventListener('click', open);
  scene.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); open(); }
  });
});

/* --- mobile menu --- */
const burger = $('#burger'), menu = $('#mobileMenu');
function closeMenu() {
  menu.classList.remove('open');
  burger.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-hidden', 'true');
}
burger.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  burger.classList.toggle('open', open);
  burger.setAttribute('aria-expanded', open);
  menu.setAttribute('aria-hidden', !open);
  if (open) menu.querySelectorAll('a').forEach((a, i) =>
    a.style.transitionDelay = `${.08 + i * .06}s`);
  else menu.querySelectorAll('a').forEach(a => a.style.transitionDelay = '0s');
});

/* --- toast --- */
let toastTimer;
function toast(msg) {
  $('#toastMsg').textContent = msg;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
}

/* --- custom cursor (desktop only) --- */
if (!touch && !reduced) {
  const dot = $('#cursorDot'), ring = $('#cursorRing'), label = $('#cursorLabel');
  let cx = -100, cy = -100, rx = -100, ry = -100;
  addEventListener('pointermove', e => { cx = e.clientX; cy = e.clientY; }, { passive: true });
  gsap.ticker.add(() => {
    rx = lerp(rx, cx, .16); ry = lerp(ry, cy, .16);
    dot.style.transform  = `translate(${cx - 3.5}px,${cy - 3.5}px)`;
    ring.style.transform = `translate(${rx - ring.offsetWidth / 2}px,${ry - ring.offsetHeight / 2}px)`;
  });
  const LABELS = { hold: 'hold', open: 'open', flip: 'flip', spin: 'spin' };
  document.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-cursor], a, button, .gift-scene');
    if (!el) { ring.classList.remove('hovering', 'labeled'); label.textContent = ''; return; }
    const kind = el.dataset && el.dataset.cursor;
    if (kind && LABELS[kind]) {
      label.textContent = LABELS[kind];
      ring.classList.add('labeled'); ring.classList.remove('hovering');
    } else {
      ring.classList.add('hovering'); ring.classList.remove('labeled');
      label.textContent = '';
    }
  }, { passive: true });
}

/* --- magnetic buttons --- */
if (!touch && !reduced) $$('.btn').forEach(b => {
  b.addEventListener('pointermove', e => {
    const r = b.getBoundingClientRect();
    gsap.to(b, {
      x: (e.clientX - r.left - r.width / 2) * .18,
      y: (e.clientY - r.top - r.height / 2) * .3,
      duration: .5, ease: 'power3.out',
    });
  });
  b.addEventListener('pointerleave', () =>
    gsap.to(b, { x: 0, y: 0, duration: .7, ease: 'elastic.out(1,.4)' }));
});

/* --- social placeholders behave like real links --- */
$$('[data-social]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  toast('this one leads to me. someday it leads to you ✦');
}));

/* --- gift pop sync with 3D boxes (first DOM gift toggles 3D lid too) --- */
let giftPop = false;
$$('.gift-scene').forEach((scene, i) => scene.addEventListener('click', () => {
  if (!giftGroup || !giftGroup.children[i]) return;
  const g3d = giftGroup.children[i];
  const lid = g3d.userData.lid;
  giftPop = true;
  const isOpen = Math.abs(lid.rotation.x) > .01;
  if (!isOpen) {
    gsap.to(lid.rotation, { x: -1.9, duration: .8, ease: 'back.out(1.6)' });
    gsap.to(lid.position, { y: g3d.userData.lidY + .25, duration: .8, ease: 'back.out(1.6)' });
  } else {
    gsap.to(lid.rotation, { x: 0, duration: .7, ease: 'power3.inOut' });
    gsap.to(lid.position, { y: g3d.userData.lidY, duration: .7, ease: 'power3.inOut' });
  }
  setTimeout(() => giftPop = false, 900);
}));

/* ---------- boot ---------- */
function onResize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

document.addEventListener('DOMContentLoaded', () => { $('#year').textContent = new Date().getFullYear(); });
$('#year').textContent = new Date().getFullYear();

if (initThree()) {
  /* ribbon now that the scene exists */
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    pts.push(new THREE.Vector3(
      Math.sin(u * Math.PI * 4) * .9 * u,
      4.2 + u * 2.6 + Math.sin(u * Math.PI * 6) * .18,
      Math.cos(u * Math.PI * 3) * .5 * u
    ));
  }
  ribbon = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, .016, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xf0a3b7, transparent: true, opacity: .5 })
  );
  scene.add(ribbon);
}

initScrollChoreo();
addEventListener('load', finishLoader);
setTimeout(finishLoader, 6000);   // hard fallback: never trap the visitor on the loader
