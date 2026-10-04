/* ============================================================
   CAKE STUDIO — build a cake, cut slices, eat them, rebuild
   Rendering: dedicated Three.js viewer (cake3d.js) inside the
   studio panel — its own canvas/lights/orbit, NOT page bg.
   Falls back to the hand-built CSS cake when WebGL is missing.
   FLOW (forgiving — no dead clicks):
   · Cut a slice → a real slice pops onto the plate, counter drops
   · Take a bite → chomp animation eats the plate slice (or a
     friendly toast if the plate is empty)
   · Bake a new one → fresh cake, same design choices
   ============================================================ */
import { createCake3D } from './cake3d.js?v=11';

const FLAVORS = {
  vanilla:    { crumb: 'rgba(120,86,60,.55)',  solid: '#f7e8d8' },
  chocolate:  { crumb: 'rgba(28,16,10,.75)',   solid: '#5a3a2e' },
  strawberry: { crumb: 'rgba(214,106,138,.6)', solid: '#f4c2cf' },
  redvelvet:  { crumb: 'rgba(60,10,18,.8)',    solid: '#a32638' },
};
const FROST = { blush: '#f0a3b7', cream: '#f6ecdd', cocoa: '#6b4634', lavender: '#c3b1e1' };
const DRIPS = { gold: '#e8c58c', choco: '#5a3a2e', none: 'transparent' };
const SPRINKLE_SETS = {
  rainbow: ['#f26d6d', '#f2a65a', '#f7e06e', '#7ed491', '#6db6f2', '#b48df2', '#f2a0c6'],
  gold:    ['#e8c58c', '#c99b5f', '#f7e3bd', '#a8763e'],
};
const NOMS = ['om nom nom', 'so good!', 'best cake ever', 'yuum', 'one more…', 'happy birthday to me'];

export default function initCakeStudio({ gsap, reduced, touch, toast, confettiBurst }) {

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const stage = $('#studio .studio-stage');
  if (!$('#studio') || !stage) return;

  /* ---------- state ---------- */
  const cake = {
    slices: 8, tiers: 2, sponge: 'vanilla', frost: 'blush',
    drip: 'gold', top: 'candles', sprinkles: 'rainbow',
    remaining: 8,   // uncut portion
    cut: 0,         // slices cut so far
    eaten: 0,       // bites taken
  };
  const plate = [];                              // plate slots (DOM els in CSS mode, nulls in 3D)
  const cakeEl   = $('#cbCake');
  const crumbsEl = $('#cbCrumbs');
  const badge    = $('#cbBadge');
  const nomEl    = $('#cbNom');
  const cutBtn   = $('#cbCut');
  const eatBtn   = $('#cbEat');
  const resetBtn = $('#cbReset');
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- 3D viewer (WebGL) with CSS fallback ----------
     the stage gets .is-3d BEFORE mounting so the host has real
     dimensions at canvas-creation time (mounting into a
     display:none element breaks sizing + visibility tracking) */
  let cake3d = null, use3d = false;
  const host3d = $('#cb3d');
  if (host3d && !reduced) {
    stage.classList.add('is-3d');
    try {
      cake3d = createCake3D({ toast: m => toast(m) });
      cake3d.mount(host3d);
      use3d = cake3d.active;
      window.__cake3d = cake3d;                    // debug handle
    } catch { use3d = false; }
    if (!use3d) stage.classList.remove('is-3d');
  }

  /* ---------- helpers ---------- */
  const applyVars = () => {
    const fl = FLAVORS[cake.sponge] || FLAVORS.vanilla;
    cakeEl.style.setProperty('--cb-frost', FROST[cake.frost] || FROST.blush);
    cakeEl.style.setProperty('--cb-sponge', fl.crumb);
    cakeEl.style.setProperty('--cb-sponge-solid', fl.solid);
    cakeEl.style.setProperty('--cb-drip', DRIPS[cake.drip] || DRIPS.gold);
  };
  const setBadge = () => {
    let msg = cake.remaining === 0
      ? 'all gone — bake a new one!'
      : `${cake.remaining} slice${cake.remaining === 1 ? '' : 's'} ready`;
    if (plate.length) msg += ` · ${plate.length} on the plate`;
    badge.textContent = msg;
  };
  const refreshButtons = () => {
    cutBtn.disabled = cake.remaining === 0;
    /* eat stays clickable so a click is always answered (toast if plate empty) */
    eatBtn.disabled = cake.remaining === 0 && plate.length === 0;
    eatBtn.classList.toggle('is-hint', plate.length === 0 && cake.remaining > 0);
    resetBtn.disabled = false;
  };
  const zap = sel => { const m = $(sel); m.classList.remove('zap'); void m.offsetWidth; m.classList.add('zap'); };

  /* the cut notch on the CSS cake — grows with every cut */
  function notchHeight() {
    const tier = cakeEl.lastElementChild;
    if (!tier) return 0;
    const max = tier.getBoundingClientRect().height * .62;
    return Math.min(max, 8 + cake.cut * 6);
  }
  function restoreNotch() {
    cakeEl.querySelector('.cb-notch')?.remove();
    if (cake.cut > 0) {
      const tier = cakeEl.lastElementChild;
      const n = document.createElement('div');
      n.className = 'cb-notch';
      n.style.height = notchHeight() + 'px';
      tier.appendChild(n);
      cakeEl.classList.add('is-sliced');
    }
  }

  /* ---------- build / rebuild the cake ---------- */
  function buildCake({ celebrate = false, reset = false } = {}) {
    if (reset) { cake.remaining = cake.slices; cake.cut = 0; cake.eaten = 0; clearPlate(true); }

    if (use3d) {
      /* the 3D viewer owns its own meshes — just send the design */
      cake3d.applyDesign({ ...cake });
    } else {
      buildCakeCSS();
    }

    applyVars();
    setBadge();
    refreshButtons();
    if (celebrate) {
      confettiBurst(90);
      toast('fresh out of the oven — she\u2019s perfect \u2726');
    }
  }

  /* CSS-cake construction (fallback renderer) */
  function buildCakeCSS() {
    cakeEl.innerHTML = '';
    cakeEl.classList.remove('is-sliced');
    const tiers = Math.min(3, Math.max(1, cake.tiers | 0 || 2));

    for (let t = 0; t < tiers; t++) {
      const isTop = t === tiers - 1;
      const tier = document.createElement('div');
      tier.className = 'cb-tier' + (isTop ? ' is-top' : '');
      const w = 150 + (tiers - 1 - t) * 55;
      const h = 54 + (tiers - 1 - t) * 12;
      tier.style.width = w + 'px';
      tier.style.height = h + 'px';
      if (t > 0) tier.style.marginTop = '-6px';

      if (cake.drip !== 'none') {
        const drip = document.createElement('div');
        drip.className = 'cb-drip';
        const n = touch ? 7 : 11;
        for (let i = 0; i < n; i++) {
          const d = document.createElement('i');
          d.style.left = (i / (n - 1)) * 100 + '%';
          d.style.height = rand(8, 20) + 'px';
          drip.appendChild(d);
        }
        tier.appendChild(drip);
      }

      if (cake.sprinkles !== 'none') {
        const spr = document.createElement('div');
        spr.className = 'cb-spr';
        const colors = SPRINKLE_SETS[cake.sprinkles] || SPRINKLE_SETS.rainbow;
        const n = touch ? 14 : 26;
        for (let i = 0; i < n; i++) {
          const s = document.createElement('i');
          s.style.left = rand(2, 96) + '%';
          s.style.top = rand(6, 88) + '%';
          s.style.setProperty('--r', rand(-60, 60) + 'deg');
          s.style.setProperty('--c', colors[i % colors.length]);
          spr.appendChild(s);
        }
        tier.appendChild(spr);
      }

      if (isTop) {
        if (cake.top === 'candles') {
          const n = Math.min(5, Math.max(3, Math.round(cake.slices / 2.5)));
          for (let i = 0; i < n; i++) {
            const xPct = 50 + (i - (n - 1) / 2) * (w > 210 ? 11 : 14);
            const candle = document.createElement('div');
            candle.className = 'cb-candle';
            candle.style.left = xPct + '%';
            candle.style.height = rand(26, 34) + 'px';
            const flame = document.createElement('div');
            flame.className = 'cb-flame';
            flame.style.left = xPct + '%';
            flame.style.bottom = `calc(100% + ${parseFloat(candle.style.height) + 3}px)`;
            flame.style.animationDelay = rand(0, .4) + 's';
            tier.append(candle, flame);
          }
        } else if (cake.top !== 'none') {
          const tEl = document.createElement('div');
          tEl.className = 'cb-topper';
          tEl.style.left = '50%';
          tEl.textContent = cake.top === 'heart' ? '\uD83D\uDC96' : '\u2B50';
          tier.appendChild(tEl);
        }
      }
      cakeEl.appendChild(tier);
    }
    restoreNotch();
  }

  /* ---------- the slice element that pops onto the plate (CSS mode) ---------- */
  function makeSliceEl(index) {
    const s = document.createElement('div');
    s.className = 'cb-slice';
    s.innerHTML = '<span class="s-frost"></span><span class="s-body"></span><span class="s-lines"></span>';
    /* fanned beside the cake — plain pixels, no CSS vars in transforms
       (GSAP can't reliably tween calc()/var() transform values) */
    const slot = index % 3;
    s.style.left = `calc(50% + ${slot * 46 - 26}px)`;
    s.style.zIndex = String(5 + index);
    stage.appendChild(s);
    return s;
  }
  function clearPlate(silent = false) {
    plate.forEach(el => {
      if (!el) return;
      if (silent) el.remove();
      else gsap.to(el, { opacity: 0, y: 14, duration: .25, onComplete: () => el.remove() });
    });
    plate.length = 0;
  }

  /* ---------- CUT: always cuts — slice pops onto the plate ---------- */
  function cutSlice() {
    if (cake.remaining <= 0) { toast('no slices left — bake a new one \u2726'); return; }
    cake.remaining--;
    cake.cut++;
    cakeEl.classList.add('is-sliced');

    if (use3d) {
      if (cake3d.cutSlice()) plate.push(null);
      else plate.push(null);                       // counters stay in sync regardless
    } else {
      /* notch grows on the top tier */
      const tier = cakeEl.lastElementChild;
      if (tier) {
        let notch = cakeEl.querySelector('.cb-notch');
        if (!notch) { notch = document.createElement('div'); notch.className = 'cb-notch'; tier.appendChild(notch); }
        notch.style.height = notchHeight() + 'px';
      }
      /* the visible slice element */
      const slice = makeSliceEl(plate.length);
      plate.push(slice);
      if (!reduced) {
        gsap.fromTo(cakeEl, { rotate: -1.8 }, { rotate: 0, duration: .6, ease: 'elastic.out(1,.5)' });
        gsap.fromTo(slice,
          { y: -90, rotate: -22, opacity: 0, scale: .8 },
          { y: 0, rotate: 0, opacity: 1, scale: 1, duration: .7, ease: 'back.out(1.5)' });
      }
    }

    setBadge();
    refreshButtons();
    toast('slice cut — now take a bite \uD83C\uDF70');
  }

  /* ---------- EAT: always answers — chomps the plate slice ---------- */
  function eatSlice() {
    if (plate.length === 0) {
      if (cake.remaining <= 0) toast('all gone — bake a new one \u2726');
      else { toast('cut a slice first \uD83C\uDF70'); zap('#cbMag'); }
      return;
    }
    const slice = plate.shift();
    cake.eaten++;

    if (use3d) {
      cake3d.eatSlice();
    } else if (slice && !reduced) {
      /* the chomp: two bites, then the slice vanishes (timer guarantees removal) */
      gsap.timeline()
        .to(slice, { scale: .55, rotate: -14, y: 6, duration: .16, ease: 'power2.in' })
        .to(slice, { scale: 1.02, rotate: 4, duration: .12, ease: 'power2.out' })
        .to(slice, { scale: .35, rotate: -10, y: 12, opacity: .9, duration: .16, ease: 'power2.in' })
        .to(slice, { scale: 0, opacity: 0, duration: .22, ease: 'power2.in' });
      setTimeout(() => slice.remove(), 700);
    } else if (slice) {
      slice.remove();
    }

    /* nom bubble */
    nomEl.textContent = NOMS[cake.eaten % NOMS.length];
    nomEl.classList.add('show');
    clearTimeout(eatSlice._t);
    eatSlice._t = setTimeout(() => nomEl.classList.remove('show'), 1100);

    /* crumb burst (DOM overlay — works over both renderers) */
    if (!reduced) {
      const rect = (use3d ? stage : cakeEl).getBoundingClientRect();
      const colors = [FROST[cake.frost] || FROST.blush, '#f6ecdd', '#e8c58c', '#f7d3dc'];
      const n = touch ? 8 : 16;
      for (let i = 0; i < n; i++) {
        const c = document.createElement('i');
        c.style.left = '50%';
        c.style.top = rect.height * .4 + 'px';
        c.style.background = colors[i % colors.length];
        crumbsEl.appendChild(c);
        const ang = rand(-Math.PI, 0);
        const dist = rand(40, 130);
        gsap.fromTo(c,
          { x: 0, y: 0, opacity: 1, rotate: 0 },
          {
            x: Math.cos(ang) * dist, y: Math.sin(ang) * dist + 130,
            opacity: 0, rotate: rand(-200, 200), duration: rand(.8, 1.4),
            ease: 'power2.in', onComplete: () => c.remove(),
          });
      }
      /* happy little squish of the CSS cake (3D squish is handled by its scale pop) */
      if (!use3d) {
        gsap.timeline()
          .to(cakeEl, { scaleY: .96, scaleX: 1.02, duration: .14, ease: 'power2.out' })
          .to(cakeEl, { scaleY: 1, scaleX: 1, duration: .5, ease: 'elastic.out(1.2,.4)' });
      }
    }

    setBadge();
    refreshButtons();

    if (cake.remaining === 0 && plate.length === 0) {
      cutBtn.disabled = true;
      eatBtn.disabled = true;
      setTimeout(() => {
        confettiBurst(140);
        toast('all gone — every last crumb. bake another? \u2726');
      }, 450);
    } else if (plate.length === 0) {
      const left = cake.remaining;
      setTimeout(() => toast(left === 1 ? 'one slice left — make it count \uD83C\uDF70' : `${left} slices left — keep going \uD83C\uDF70`), 550);
    }
  }

  /* ---------- RESET: bake a fresh one ---------- */
  function resetCake() {
    clearPlate();
    buildCake({ celebrate: true, reset: true });
    if (!use3d && !reduced) {
      gsap.fromTo(cakeEl, { scale: .6, opacity: 0, y: 44 },
        { scale: 1, opacity: 1, y: 0, duration: .9, ease: 'elastic.out(1,.5)' });
    }
  }

  /* ---------- option wiring — any change = fresh cake ---------- */
  function wireOptions(groupId, key, after) {
    const box = $(groupId);
    box.addEventListener('click', e => {
      const btn = e.target.closest('.cb-opt');
      if (!btn || btn.classList.contains('is-on')) return;
      $$('.cb-opt', box).forEach(b => b.classList.remove('is-on'));
      btn.classList.add('is-on');
      cake[key] = btn.dataset[key];
      after?.();
    });
  }

  wireOptions('#cbSlices', 'slices', () => buildCake({ reset: true }));
  wireOptions('#cbTiers', 'tiers', () => buildCake({ reset: true }));
  wireOptions('#cbSponge', 'sponge', () => { buildCake({ reset: true }); zap('#cbMag'); });
  wireOptions('#cbFrost', 'frost', () => { buildCake({ reset: true }); zap('#cbMag'); });
  wireOptions('#cbDrip', 'drip', () => buildCake({ reset: true }));
  wireOptions('#cbTop', 'top', () => buildCake({ reset: true }));
  wireOptions('#cbSprinkles', 'sprinkles', () => {
    buildCake({ reset: true });
    const panel = $('.studio-panel');
    panel.classList.remove('spun'); void panel.offsetWidth; panel.classList.add('spun');
  });

  cutBtn.addEventListener('click', cutSlice);
  eatBtn.addEventListener('click', eatSlice);
  resetBtn.addEventListener('click', resetCake);

  /* free the WebGL context when the page goes away */
  addEventListener('pagehide', () => cake3d?.dispose(), { once: true });

  buildCake({ reset: true });
}
