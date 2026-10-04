/* ============================================================
   CAKE STUDIO 3D — a dedicated Three.js viewer for the cake
   she builds in cakemaker.js. Rendered INSIDE the studio glass
   panel as a contained "product shot" with its own canvas,
   floor, lights and orbit — deliberately separate from the
   hero's background scene, so it never feels like page bg.

   Public API (used by cakemaker.js):
     mount(container)          -> start rendering into a div
     applyDesign(design)       -> rebuild cake for new options
     reset()                   -> full cake, clear plate
     cutSlice()                -> remove wedge, fly slice to plate
     eatSlice()                -> chomp the plate slice away
     onCount(cb)               -> badge updates {remaining, plate}
     dispose()                 -> full GPU cleanup
   ============================================================ */
import * as THREE from 'three';

const FROST = {
  blush:    { c: 0xf0a3b7, rough: .42 },
  cream:    { c: 0xf6ecdd, rough: .5 },
  cocoa:    { c: 0x6b4634, rough: .55 },
  lavender: { c: 0xc3b1e1, rough: .45 },
};
const SPONGE = {
  vanilla:    { c: 0xf3e3cc },
  chocolate:  { c: 0x4a2f24 },
  strawberry: { c: 0xf0bccb },
  redvelvet:  { c: 0x8e2233 },
};
const DRIP = { gold: 0xe8c58c, choco: 0x4a2f24, none: null };

/* tiny deterministic-ish helpers */
const rand = (a, b) => a + Math.random() * (b - a);

export function createCake3D({ toast }) {

  /* ------------------------------------------------ renderer */
  let renderer = null, scene = null, camera = null, raf = 0;
  let canvasHost = null, canvasW = 0, canvasH = 0;
  const DPR_CAP = 2;

  /* ------------------------------------------------ scene graphs */
  const world = new THREE.Group();            // drag rotation applies here
  let cakeRoot = new THREE.Group();           // whole cake (rebuildable)
  const plateGroup = new THREE.Group();       // porcelain plate + slices
  const disposable = [];                       // geometries/materials to free

  /* lights (kept for dispose) */
  const lights = [];

  /* ------------------------------------------------ camera / orbit state */
  const orbit = { theta: Math.PI * .32, phi: 1.12, dist: 15.5, targetY: 1.5 };
  const spin = { v: 0, dragging: false, lastX: 0, lastY: 0, auto: .0016 };

  /* ------------------------------------------------ game-linked state */
  const design = { slices: 8, tiers: 2, sponge: 'vanilla', frost: 'blush', drip: 'gold', top: 'candles', sprinkles: 'rainbow' };
  let wedgeCount = 8;                          // total wedges currently standing
  let plateSlices = [];                        // THREE.Group per plated slice
  let plateIndex = 0;
  let onCount = null;

  /* ------------------------------------------------ materials (shared, rebuilt on design change) */
  const mats = {};
  function buildMaterials() {
    disposeMaterials();
    const frost = FROST[design.frost] || FROST.blush;
    const sponge = SPONGE[design.sponge] || SPONGE.vanilla;
    mats.frost  = track(new THREE.MeshStandardMaterial({ color: frost.c, roughness: frost.rough, metalness: .04, side: THREE.DoubleSide }));
    mats.sponge = track(new THREE.MeshStandardMaterial({
      color: sponge.c, roughness: .85, side: THREE.DoubleSide,
      emissive: sponge.c, emissiveIntensity: .22,   // interior faces read warm, not black
    }));
    mats.candle = track(new THREE.MeshStandardMaterial({ color: 0xf7d3dc, roughness: .35 }));
    mats.wick   = track(new THREE.MeshStandardMaterial({ color: 0x2b1c14, roughness: .9 }));
    mats.flame  = track(new THREE.SpriteMaterial({
      map: makeFlameTexture(), color: 0xffd9a0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mats.gold   = track(new THREE.MeshStandardMaterial({ color: DRIP[design.drip] ?? 0xe8c58c, roughness: .25, metalness: .85 }));
    mats.sprinkle = [];
    const palette = design.sprinkles === 'gold'
      ? [0xe8c58c, 0xc99b5f, 0xf7e3bd, 0xa8763e]
      : [0xf26d6d, 0xf2a65a, 0xf7e06e, 0x7ed491, 0x6db6f2, 0xb48df2];
    for (const c of palette) {
      mats.sprinkle.push(track(new THREE.MeshStandardMaterial({ color: c, roughness: .35 })));
    }
  }
  function track(x) { disposable.push(x); return x; }
  function disposeMaterials() {
    for (const k of Object.keys(mats)) {
      if (Array.isArray(mats[k])) { mats[k].forEach(m => m.dispose()); }
      else mats[k]?.dispose?.();
      delete mats[k];
    }
  }

  /* ------------------------------------------------ textures */
  function makeFlameTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 38, 4, 32, 34, 30);
    g.addColorStop(0, 'rgba(255,250,235,1)');
    g.addColorStop(.35, 'rgba(255,210,120,.85)');
    g.addColorStop(.7, 'rgba(255,150,70,.35)');
    g.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    disposable.push(t);
    return t;
  }
  function makeBackdropTexture() {
    /* opaque studio backdrop: deep plum glow centre, near-black edges —
       keeps the viewer self-contained so page bg never bleeds through */
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(256, 210, 40, 256, 256, 360);
    g.addColorStop(0, '#241726');
    g.addColorStop(.55, '#150e1a');
    g.addColorStop(1, '#0b0710');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    disposable.push(t);
    return t;
  }
  function makePlateTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f4edf2'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(201,155,95,.55)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(128, 128, 112, 0, Math.PI * 2); ctx.stroke();
    const t = new THREE.CanvasTexture(cv);
    disposable.push(t);
    return t;
  }

  /* ------------------------------------------------ geometry: one wedge of cake */
  const TIER_H = 1.3, TIER_GAP = .05;
  /* i = tier index from the BOTTOM — radius shrinks as we go up */
  function tierRadius(i, n) { return 2.9 - i * .78; }

  function buildWedge(tierIdx, tierCount, wedgeIdx, wedgeTotal) {
    const g = new THREE.Group();
    const r = tierRadius(tierIdx, tierCount);
    const a0 = (wedgeIdx / wedgeTotal) * Math.PI * 2;
    const a1 = ((wedgeIdx + 1) / wedgeTotal) * Math.PI * 2;
    const Frost = mats.frost, Sponge = mats.sponge;
    const segs = 6;
    /* hairline gap between wedges — reads as pre-cut slice lines */
    const gap = .014;
    const w0 = a0 + gap / 2, w1 = a1 - gap / 2, span = w1 - w0;
    const wall = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, TIER_H, segs, 1, true, w0, span)), Frost);
    wall.position.y = TIER_H / 2;
    g.add(wall);

    /* top cap (frosting disc sector) — drawn as a flat sector */
    const topGeo = track(new THREE.RingGeometry(0, r, segs, 1, w0, span));
    const top = new THREE.Mesh(topGeo, Frost);
    top.rotation.x = -Math.PI / 2;
    top.position.y = TIER_H;
    g.add(top);

    /* bottom cap */
    const bottom = new THREE.Mesh(topGeo.clone(), Frost);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = 0.001;
    g.add(bottom);

    /* cut faces: radial planes at each edge, normal pointing TANGENTIALLY
       (out of the wedge interior) so the sponge shows correctly when a
       neighbouring wedge is removed — no see-through hollows */
    for (const [a, flip] of [[w1, 0], [w0, Math.PI]]) {
      const face = new THREE.Mesh(track(new THREE.PlaneGeometry(r, TIER_H)), Sponge);
      face.position.set(Math.cos(a) * r / 2, TIER_H / 2, Math.sin(a) * r / 2);
      face.rotation.y = -a + flip;
      g.add(face);
    }

    /* per-wedge drip segment + sprinkles, so a cut wedge takes its
       share of decoration with it (no floating rings over the hole) */
    if (design.drip !== 'none') {
      const drip = new THREE.Mesh(track(new THREE.TorusGeometry(r - .03, .055, 6, 8, span)), mats.gold);
      /* torus arc spans [0, span]; rotation.z shifts it to [w0, w1],
         rotation.x lays it flat — order matters (Z acts first) */
      drip.rotation.x = Math.PI / 2;
      drip.rotation.z = w0;
      drip.position.y = TIER_H - .02;
      g.add(drip);
    }
    if (design.sprinkles !== 'none') {
      for (let i = 0; i < 2; i++) {
        const a = w0 + span * rand(.15, .85);
        const rr = rand(.3, r - .3);
        const spr = new THREE.Mesh(track(new THREE.CapsuleGeometry(.025, .09, 2, 5)), mats.sprinkle[(wedgeIdx + i) % mats.sprinkle.length]);
        spr.position.set(Math.cos(a) * rr, TIER_H + .03, Math.sin(a) * rr);
        spr.rotation.set(rand(-.6, .6), rand(0, 3), rand(-.6, .6));
        g.add(spr);
        sprinkles.push(spr);
      }
    }
    return g;
  }

  /* ------------------------------------------------ build whole cake */
  let candles = [], flames = [], sprinkles = [];
  function buildCakeMesh() {
    /* clear previous */
    cakeRoot.traverse(o => { if (o.isMesh || o.isSprite) { /* shared mats, geo tracked */ } });
    world.remove(cakeRoot);
    cakeRoot = new THREE.Group();
    candles = []; flames = []; sprinkles = [];

    const tiers = Math.min(3, Math.max(1, design.tiers | 0 || 2));
    for (let t = 0; t < tiers; t++) {
      const tierG = new THREE.Group();
      const y = t * (TIER_H + TIER_GAP);
      tierG.position.y = y;
      for (let w = 0; w < wedgeCount; w++) {
        const wedge = buildWedge(t, tiers, w, wedgeCount);
        wedge.userData = { tier: t, index: w };
        tierG.add(wedge);
      }
      cakeRoot.add(tierG);
    }

    /* topper */
    const topR = tierRadius(tiers - 1, tiers);
    const topY = tiers * (TIER_H + TIER_GAP);
    if (design.top === 'candles') {
      const n = Math.min(6, Math.max(4, Math.round(design.slices / 2)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + .35;
        const rr = topR * .6;
        const candle = new THREE.Group();
        const stick = new THREE.Mesh(track(new THREE.CylinderGeometry(.06, .06, .95, 10)), mats.candle);
        stick.position.y = .475;
        const wick = new THREE.Mesh(track(new THREE.CylinderGeometry(.012, .012, .07, 6)), mats.wick);
        wick.position.y = .99;
        const flame = new THREE.Sprite(mats.flame);
        flame.scale.set(.34, .5, 1);
        flame.position.y = 1.13;
        candle.add(stick, wick, flame);
        candle.position.set(Math.cos(a) * rr, topY, Math.sin(a) * rr);
        cakeRoot.add(candle);
        candles.push(candle); flames.push(flame);
      }
    } else if (design.top === 'heart') {
      const heartShape = new THREE.Shape();
      /* classic bezier heart */
      heartShape.moveTo(0, -.32);
      heartShape.bezierCurveTo(.38, .08, .34, .5, 0, .28);
      heartShape.bezierCurveTo(-.34, .5, -.38, .08, 0, -.32);
      const hg = track(new THREE.ExtrudeGeometry(heartShape, { depth: .09, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2 }));
      const heart = new THREE.Mesh(hg, mats.gold);
      heart.position.y = topY + .42;
      heart.scale.setScalar(1.15);
      const stem = new THREE.Mesh(track(new THREE.CylinderGeometry(.02, .02, .3, 6)), mats.gold);
      stem.position.y = topY + .17;
      cakeRoot.add(stem, heart);
    } else if (design.top === 'star') {
      const starShape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? .3 : .13;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        i === 0 ? starShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : starShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const sg = track(new THREE.ExtrudeGeometry(starShape, { depth: .08, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2 }));
      const star = new THREE.Mesh(sg, mats.gold);
      star.position.y = topY + .42;
      const stem = new THREE.Mesh(track(new THREE.CylinderGeometry(.02, .02, .3, 6)), mats.gold);
      stem.position.y = topY + .17;
      cakeRoot.add(stem, star);
    }

    /* frame the camera for this cake's height */
    const totalH = tiers * (TIER_H + TIER_GAP);
    orbit.targetY = totalH * .5 + .35;

    world.add(cakeRoot);
    notify();
  }

  /* ------------------------------------------------ plate + slices */
  function buildPlate() {
    const tex = makePlateTexture();
    const plateMat = track(new THREE.MeshStandardMaterial({ map: tex, roughness: .35, metalness: .05 }));
    const plate = new THREE.Mesh(track(new THREE.CylinderGeometry(4.2, 3.8, .22, 48)), plateMat);
    plate.position.y = -.11;
    plateGroup.add(plate);
    world.add(plateGroup);
  }

  function makePlateSlice(tierCount) {
    /* a mini 2-wedge “slice” standing on the plate — frost top, sponge inside */
    const g = new THREE.Group();
    const topTierIdx = tierCount - 1;
    const r = tierRadius(topTierIdx, tierCount);
    const a0 = -.09, a1 = .09;
    const wall = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, TIER_H * .9, 6, 1, true, a0, a1 - a0)), mats.frost);
    wall.position.y = TIER_H * .45;
    const top = new THREE.Mesh(track(new THREE.RingGeometry(0, r, 6, 1, a0, a1 - a0)), mats.frost);
    top.rotation.x = -Math.PI / 2; top.position.y = TIER_H * .9;
    for (const [a, flip] of [[a1, 0], [a0, Math.PI]]) {
      const face = new THREE.Mesh(track(new THREE.PlaneGeometry(r, TIER_H * .9)), mats.sponge);
      face.position.set(Math.cos(a) * r / 2, TIER_H * .45, Math.sin(a) * r / 2);
      face.rotation.y = -a + flip;
      g.add(face);
    }
    g.add(wall, top);
    return g;
  }

  function plateSlice() {
    const s = makePlateSlice(Math.min(3, Math.max(1, design.tiers | 0 || 2)));
    const slots = 9;
    const a = Math.PI * .5 + (plateIndex % slots) * (Math.PI * 1.2 / slots) - Math.PI * .1;
    const rr = 3.55;                            // on the plate, clear of the cake
    s.userData.baseX = Math.cos(a) * rr;
    s.userData.baseZ = Math.sin(a) * rr;
    s.position.set(s.userData.baseX, 0, s.userData.baseZ);
    s.rotation.y = -a + Math.PI / 2;
    s.scale.setScalar(.5);
    plateGroup.add(s);
    plateSlices.push(s);
    plateIndex++;
    /* pop-in */
    s.scale.setScalar(.01);
    if (raf) {
      const t0 = performance.now();
      const grow = () => {
        const k = Math.min(1, (performance.now() - t0) / 380);
        s.scale.setScalar(.5 * (1 + Math.sin(k * Math.PI) * .3) * (k * .9 + .1));
        if (k < 1 && s.parent) requestAnimationFrame(grow);
      };
      requestAnimationFrame(grow);
    }
  }

  /* ------------------------------------------------ API ------------------------------------------------ */
  function applyDesign(next) {
    Object.assign(design, next);
    /* slices option change = new wedge count; fresh cake = plate cleared */
    wedgeCount = design.slices;
    plateSlices.forEach(s => s.parent && s.parent.remove(s));
    plateSlices = [];
    plateIndex = 0;
    buildMaterials();
    buildCakeMesh();
    notify();
  }

  function reset() { applyDesign({}); }

  function cutSlice() {
    if (wedgeCount <= 0) return false;
    /* pick a random standing wedge from the top tier downward */
    let wedge = null;
    const tiers = Math.min(3, Math.max(1, design.tiers | 0 || 2));
    for (let t = tiers - 1; t >= 0 && !wedge; t--) {
      const tierG = cakeRoot.children[t];
      if (!tierG) continue;
      const standing = tierG.children.filter(c => c.userData && c.userData.index !== undefined && !c.userData.cut);
      if (standing.length) wedge = standing[Math.floor(Math.random() * standing.length)];
    }
    if (!wedge) return false;
    wedge.userData.cut = true;
    wedge.visible = false;
    wedgeCount--;
    plateSlice();
    notify();
    return true;
  }

  function eatSlice() {
    const s = plateSlices[0];
    if (!s) return false;
    plateSlices.shift();
    /* chomp: quick shrink-bite, then gone */
    if (raf) {
      const t0 = performance.now();
      const D = 520;
      const chomp = () => {
        const k = Math.min(1, (performance.now() - t0) / D);
        const bite = k < .5 ? 1 - k * 1.1 : .45 + (k - .5) * 1.1;
        s.scale.setScalar(.55 * Math.max(.02, bite));
        s.rotation.y += .12;
        if (k >= 1 || !s.parent) { s.parent && s.parent.remove(s); }
        else requestAnimationFrame(chomp);
      };
      requestAnimationFrame(chomp);
    } else {
      s.parent && s.parent.remove(s);
    }
    notify();
    return true;
  }

  function notify() { onCount && onCount({ remaining: wedgeCount, plate: plateSlices.length }); }

  /* ------------------------------------------------ mount & render ------------------------------------------------ */
  function mount(host) {
    canvasHost = host;
    canvasW = host.clientWidth || 480;
    canvasH = host.clientHeight || 360;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(canvasW, canvasH);
    renderer.shadowMap.enabled = false;                 // small scene: cheap, crisp
    host.appendChild(renderer.domElement);
    /* on touch: pan-y lets vertical swipes scroll the page while horizontal
       drags spin the cake — zoom stays on the +/- buttons */
    const coarse = matchMedia('(pointer:coarse)').matches;
    renderer.domElement.style.cssText = `width:100%;height:100%;display:block;touch-action:${coarse ? 'pan-y' : 'none'};cursor:grab`;

    scene = new THREE.Scene();
    scene.background = makeBackdropTexture();          // opaque: no page bleed

    camera = new THREE.PerspectiveCamera(38, canvasW / canvasH, .1, 100);

    scene.add(world);
    buildPlate();
    buildMaterials();
    buildCakeMesh();

    /* studio lighting: warm key, cool fill, gold rim — self-contained look */
    const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
    key.position.set(6, 9, 5);
    const fill = new THREE.DirectionalLight(0xcdd6ff, .7);
    fill.position.set(-7, 4, -4);
    const rim = new THREE.DirectionalLight(0xe8c58c, 1.4);
    rim.position.set(-3, 5, -7);
    const amb = new THREE.AmbientLight(0x8a7a90, .85);
    scene.add(key, fill, rim, amb);
    lights.push(key, fill, rim, amb);

    /* a soft dark backdrop disc under everything so it reads as “product shot” */
    const floor = new THREE.Mesh(
      track(new THREE.CircleGeometry(11, 40)),
      track(new THREE.MeshStandardMaterial({ color: 0x17101d, roughness: .95 }))
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.24;
    scene.add(floor);

    /* ------------------------------------------------ interaction */
    const el = renderer.domElement;
    const pointers = new Map();

    el.addEventListener('pointerdown', e => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      spin.dragging = true; spin.lastX = e.clientX; spin.lastY = e.clientY;
      try { el.setPointerCapture?.(e.pointerId); } catch { /* stale/synthetic pointer */ }
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      const p = pointers.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        spin.v = dx * .005;
        orbit.theta += dx * .005;
        orbit.phi = Math.min(1.45, Math.max(.55, orbit.phi - dy * .004));
      } else if (pointers.size >= 2) {
        /* pinch zoom */
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const prev = el.__pinchD || d;
        orbit.dist = Math.min(26, Math.max(8, orbit.dist * (prev / d)));
        el.__pinchD = d;
      }
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (!pointers.size) { spin.dragging = false; el.style.cursor = 'grab'; el.__pinchD = null; }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    /* wheel zoom (canvas-scoped so it never hijacks page scroll beyond the canvas) */
    el.addEventListener('wheel', e => {
      e.preventDefault();
      orbit.dist = Math.min(26, Math.max(8, orbit.dist * (1 + Math.sign(e.deltaY) * .08)));
    }, { passive: false });

    /* resize */
    const ro = new ResizeObserver(() => {
      canvasW = host.clientWidth; canvasH = host.clientHeight;
      if (!canvasW || !canvasH) return;
      renderer.setSize(canvasW, canvasH);
      camera.aspect = canvasW / canvasH;
      camera.updateProjectionMatrix();
    });
    ro.observe(host);
    host.__cake3dRO = ro;

    /* ------------------------------------------------ render loop */
    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 });
    io.observe(host);
    host.__cake3dIO = io;

    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;                            // save battery offscreen
      const dt = Math.min(.05, clock.getDelta());
      const t = clock.elapsedTime;

      /* inertia + idle auto-spin */
      if (!spin.dragging) {
        orbit.theta += spin.v;
        spin.v *= .94;
        if (Math.abs(spin.v) < .0004) spin.v = 0;
        orbit.theta += spin.auto;
      }
      world.rotation.y = orbit.theta;

      /* camera position from orbit (phi: 0 = top-down, π/2 = eye level) */
      const eye = Math.cos(orbit.phi) * orbit.dist;
      camera.position.set(
        Math.sin(orbit.theta + Math.PI * .25) * orbit.dist * .82,
        orbit.targetY + eye,
        Math.cos(orbit.theta + Math.PI * .25) * orbit.dist * .82
      );
      camera.lookAt(0, orbit.targetY, 0);

      /* flames flicker */
      for (const f of flames) {
        const k = 1 + Math.sin(t * 11 + f.position.x * 7) * .12;
        f.scale.set(.3 * k, .44 * (2 - k), 1);
      }

      renderer.render(scene, camera);
    };
    loop();
  }

  function dispose() {
    cancelAnimationFrame(raf); raf = 0;
    canvasHost?.__cake3dRO?.disconnect();
    canvasHost?.__cake3dIO?.disconnect();
    renderer?.domElement?.remove();
    disposeMaterials();
    world.traverse(o => { o.geometry?.dispose?.(); });
    scene?.traverse(o => { o.geometry?.dispose?.(); });
    renderer?.dispose?.();
    renderer = null; scene = null; camera = null;
  }

  return {
    mount, applyDesign, reset, cutSlice, eatSlice,
    set onCount(cb) { onCount = cb; },
    get active() { return !!renderer; },
    debug() {
      /* live state inspector for testing */
      const tiers = cakeRoot ? cakeRoot.children.length : 0;
      const wedges = [];
      cakeRoot?.traverse(o => { if (o.userData?.index !== undefined) wedges.push(o.userData.index); });
      return { design: { ...design }, wedgeCount, tiers, standingWedges: new Set(wedges).size, plateSlices: plateSlices.length, canvas: renderer ? { w: renderer.domElement.width, h: renderer.domElement.height } : null };
    },
    dispose,
  };
}
