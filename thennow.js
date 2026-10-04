/* ============================================================
   THEN & NOW — cinematic memory comparison module
   ✏️  EDIT EVERYTHING HERE: photos, ages, years, memories,
   descriptions, pairs, constants — plain strings, no markup.
   ============================================================ */
const TN = {
  then: {
    img : './22.jpeg',   // childhood photo
    alt : 'Her as a child — edit this image',
    year: '2011', age: 4,
    ageLine : 'age four, give or take a front tooth',
    text    : "Little, curious, and always exploring — the kid who didn't know what the future had planned.",
  },
  now: {
    img : './11.jpeg',    // present-day photo
    alt : 'Her present day — edit this image',
    year: '2026', age: 19,
    ageLine : 'age nineteen, exactly',
    text    : 'A completely new chapter — still learning, still dreaming, still growing.',
  },
  /* timeline: ages on the road here — add or remove points freely */
  timeline: [
    { age: 3,  year: '2010', emoji: '🧸', title: 'When Everything Felt Magical', text: `A cardboard box could become a castle.
A blanket could become a secret hideout.
And an ordinary afternoon could somehow become the best day ever.

She didn't need much to be happy.

Just a little imagination.` },
    { age: 6,  year: '2013', emoji: '📚', title: 'Curiosity Took Over', text: `Questions about everything.
Stories about anything.
And a mind that never seemed to run out of things to wonder about.

This was the age when discovering something new
felt like discovering an entire universe.` },
    { age: 10, year: '2017', emoji: '🎮', title: 'The Years of Firsts', text: `New hobbies. New interests. New favorite things.
A little more independence with every year.

There were victories worth celebrating,
mistakes worth remembering,
and plenty of moments that only make sense looking back.` },
    { age: 14, year: '2021', emoji: '🎵', title: 'Finding Her Own Rhythm', text: `Things started feeling different.

Music became memories.
Late-night thoughts became longer.
Dreams became bigger.

She was slowly figuring out what she liked,
what mattered to her,
and most importantly — who she wanted to become.` },
    { age: 19, year: '2026', emoji: '⭐', title: 'Look at Her Now', text: `She isn't the same little girl from those memories.

She's grown.
She's learned.
She's changed.

But somewhere underneath all the years,
the same curiosity, imagination, and spark are still there.

And maybe that's the best part.

She didn't leave that little girl behind.
She grew into her.` },
  ],
  /* what changed pairs */
  pairs: [
    { then: 'Playing games for fun.',               now: 'Building things with technology.' },
    { then: 'Dreaming about the future.',           now: 'Planning the future.' },
    { then: 'Everything felt huge.',                now: "There's still so much to discover." },
  ],
  /* what didn't change */
  same: ['Curiosity.', 'The love for fun.', 'The big dreams.', 'The people who matter.'],
  /* TIME FLIES overlay lines */
  flash: ['TIME FLIES.', 'BUT SOME THINGS STAY.', 'THIS IS ME. THEN & NOW.'],
};

export default function initThenNow({ gsap, ScrollTrigger, reduced, touch, small, toast }) {
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand  = (a, b) => a + Math.random() * (b - a);

  const stage = $('#tnStage');
  if (!stage) return;

  /* ---------- apply editable data into the DOM ---------- */
  $('#tnImgThen').src = TN.then.img; $('#tnImgThen').alt = TN.then.alt;
  $('#tnImgNow').src  = TN.now.img;  $('#tnImgNow').alt  = TN.now.alt;
  /* late-loading photos shift the layout — re-measure every trigger when they land */
  ['#tnImgThen', '#tnImgNow'].forEach(sel => {
    const im = $(sel);
    im.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  });
  $('#tnThenYear').textContent = `${TN.then.year} · ${TN.then.ageLine}`;
  $('#tnNowYear').textContent  = `${TN.now.year} · ${TN.now.ageLine}`;
  $('#tnThenText').textContent = TN.then.text;
  $('#tnNowText').textContent  = TN.now.text;
  $('#mThenAge').textContent   = `age ${TN.then.age}`;
  $('#mThenYear').textContent  = TN.then.year;
  $('#mNowAge').textContent    = `age ${TN.now.age}`;
  $('#mNowYear').textContent   = TN.now.year;

  /* ---------- WHAT CHANGED pairs ---------- */
  const pairsBox = $('#tnPairs');
  TN.pairs.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'tn-pair';
    row.innerHTML = `
      <div class="tn-cell then"><span class="cell-k">then</span><p>${p.then}</p></div>
      <div class="tn-arrow" aria-hidden="true">↓</div>
      <div class="tn-cell now"><span class="cell-k">now</span><p>${p.now}</p></div>`;
    pairsBox.appendChild(row);
  });

  /* ---------- WHAT DIDN'T CHANGE words ---------- */
  const sameBox = $('#tnSame');
  TN.same.forEach(w => {
    const s = document.createElement('span');
    s.className = 'tn-word';
    s.textContent = w;
    sameBox.appendChild(s);
    const sep = document.createElement('span');
    sep.className = 'tn-sep';
    sep.textContent = '✦';
    sameBox.appendChild(sep);
  });
  if (sameBox.lastChild) sameBox.lastChild.remove();   // drop trailing separator

  /* ---------- AGE TIMELINE ---------- */
  const pointsBox = $('#tnPoints');
  pointsBox.style.setProperty('--tn-n', TN.timeline.length);
  TN.timeline.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tn-point' + (i === TN.timeline.length - 1 ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', i === TN.timeline.length - 1 ? 'true' : 'false');
    b.innerHTML = `<span class="tn-age">${m.age}<i>${m.year}</i></span>`;
    b.addEventListener('click', () => selectMemory(i));
    b.addEventListener('pointerenter', () => { if (!touch) selectMemory(i); });
    pointsBox.appendChild(b);
  });
  const memPhoto = $('#mPhoto'), memAge = $('#mAge'), memTitle = $('#mTitle'), memText = $('#mText');
  let memIdx = -1;
  function selectMemory(i) {
    if (i === memIdx) return;
    memIdx = i;
    const m = TN.timeline[i];
    $$('.tn-point').forEach((p, j) => {
      p.classList.toggle('active', j === i);
      p.setAttribute('aria-selected', String(j === i));
    });
    const tlp = TN.timeline.length > 1 ? i / (TN.timeline.length - 1) : 1;
    pointsBox.parentElement.style.setProperty('--tlp', tlp);
    const apply = () => {
      memPhoto.textContent = m.emoji;
      memAge.textContent   = `age ${m.age} · ${m.year}`;
      memTitle.textContent = m.title;
      memText.textContent  = m.text;
    };
    if (reduced) { apply(); return; }
    gsap.timeline()
      .to([memTitle, memText, memPhoto, memAge], { opacity: 0, y: -12, duration: .18, stagger: .02, ease: 'power1.in', onComplete: apply })
      .fromTo([memPhoto, memAge, memTitle, memText], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .4, stagger: .05, ease: 'power2.out' });
  }
  selectMemory(TN.timeline.length - 1);

  /* ---------- comparison slider (pointer + keyboard) ---------- */
  const frame = $('#tnFrame');
  const setSplit = pct => {
    const v = clamp(pct, 3, 97);
    frame.style.setProperty('--split', v + '%');
    frame.setAttribute('aria-valuenow', Math.round(v));
  };
  setSplit(50);

  let dragging = false;
  const endDrag = () => { dragging = false; stage.classList.remove('dragging'); };
  const pctFromEvent = e => {
    const r = frame.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 100;
  };
  stage.addEventListener('pointerdown', e => {
    dragging = true;
    stage.classList.add('dragging');
    setSplit(pctFromEvent(e));
    try { stage.setPointerCapture?.(e.pointerId); } catch { /* synthetic / stale pointers */ }
  });
  /* drag tracking lives on window so the drag survives leaving the frame */
  window.addEventListener('pointermove', e => { if (dragging) setSplit(pctFromEvent(e)); });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointermove', e => {
    if (dragging) return;
    if (touch) return;                                  // touch: drag only
    setSplit(pctFromEvent(e));                          // desktop: divider follows the mouse
  });

  frame.addEventListener('keydown', e => {
    const step = e.shiftKey ? 10 : 4;
    const cur = parseFloat(frame.style.getPropertyValue('--split')) || 50;
    if (e.key === 'ArrowLeft')  { setSplit(cur - step); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setSplit(cur + step); e.preventDefault(); }
    if (e.key === 'Home') { setSplit(3);  e.preventDefault(); }
    if (e.key === 'End')  { setSplit(97); e.preventDefault(); }
  });

    /* ---------- scroll choreography (skipped entirely under reduced motion) ---------- */
  function choreo() {
    if (reduced) return;
    /* title mask reveal */
    gsap.fromTo('#tnTitle .tn-w', { yPercent: 118 }, {
      yPercent: 0, duration: 1.2, stagger: .14, ease: 'power4.out',
      scrollTrigger: { trigger: '#tnTitle', start: 'top 80%' },
    });

    /* entrance: then-photo slides from the left, now-photo from the right */
    gsap.fromTo('.tn-side.is-then', { xPercent: -14, opacity: .35 }, {
      xPercent: 0, opacity: 1, duration: 1.2, ease: 'power3.out',
      scrollTrigger: { trigger: stage, start: 'top 72%' },
    });
    gsap.fromTo('.tn-side.is-now', { xPercent: 14, opacity: .35 }, {
      xPercent: 0, opacity: 1, duration: 1.2, ease: 'power3.out',
      scrollTrigger: { trigger: stage, start: 'top 72%' },
    });

    /* pinned cinematic transition: THEN → NOW */
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: stage, start: 'top 18%', end: '+=1400',
        pin: stage, scrub: 1, anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
    /* the divider travels while the world crossfades, then the words land */
    const setFlash = i => () => { $('#tnFlashText').textContent = TN.flash[i]; };
    tl.fromTo(frame, { '--split': '78%' }, { '--split': '22%', duration: 1.1, ease: 'none' }, 0)
      .to('#tnFlash', { opacity: 1, duration: .3, ease: 'power1.out' }, .55)
      .call(setFlash(0), null, .6)      // "TIME FLIES."
      .call(setFlash(1), null, 1.25)    // "BUT SOME THINGS STAY."
      .call(setFlash(2), null, 1.9)     // "THIS IS ME. THEN & NOW."
      .to('#tnFlash', { opacity: 0, duration: .45, ease: 'power1.in' }, 2.45);

    /* pairs + words + timeline + final */
    $$('.tn-pair').forEach(row => {
      gsap.from(row.children, { y: 34, opacity: 0, stagger: .12, duration: .8, ease: 'power3.out',
        scrollTrigger: { trigger: row, start: 'top 85%' } });
    });
    $$('.tn-word').forEach(w => {
      ScrollTrigger.create({
        trigger: w, start: 'top 86%',
        onEnter: () => w.classList.add('lit'),
        onLeaveBack: () => w.classList.remove('lit'),
      });
    });
    $$('.tn-point').forEach(p => {
      gsap.from(p, { y: 26, opacity: 0, duration: .6, ease: 'power2.out',
        scrollTrigger: { trigger: '.tn-track', start: 'top 85%' } });
    });
    gsap.from('.tn-memory', { y: 40, opacity: 0, duration: .8, ease: 'power3.out',
      scrollTrigger: { trigger: '.tn-ages', start: 'top 75%' } });
    /* final message: revealed by the generic [data-reveal] system — no duplicate tween here */

    /* floating objects get scroll parallax on top of their bobbing */
    $$('.tn-float').forEach(f => {
      gsap.fromTo(f, { '--py': '0px' }, {
        '--py': `${gsap.utils.random(-46, -18)}px`, ease: 'none',
        scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    ScrollTrigger.refresh();
  }

  /* ---------- sparkle field behind the final message ---------- */
  function sparks() {
    const cv = $('#sparkCanvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let W, H, stars = [];
    const fit = () => {
      const r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit(); addEventListener('resize', fit);
    const COLS = ['#f0a3b7', '#e8c58c', '#f6eef1'];
    const n = small || touch ? 40 : 90;
    for (let i = 0; i < n; i++) stars.push({
      x: Math.random(), y: Math.random(),
      r: rand(.5, 1.8), a: rand(.15, .7), tw: rand(.5, 1.6), ph: rand(0, 6),
      vy: rand(.01, .04), vx: rand(-.008, .008), c: COLS[i % 3],
    });
    let raf, t0 = performance.now();
    (function draw(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.y -= s.vy / 60; s.x += s.vx / 60;
        if (s.y < -.02) { s.y = 1.02; s.x = Math.random(); }
        const a = s.a * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
        ctx.globalAlpha = Math.max(a, 0);
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    })(performance.now());
  }

  return { choreo, sparks, selectMemory };
}
