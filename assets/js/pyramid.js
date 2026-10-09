/* Blue Pyramid — glowing wireframe pyramid renderer.
 *
 * The logo is a tetrahedron whose two side edges run past the base, plus a
 * front edge that drops below it. That is only six line segments, so instead
 * of shipping a 600 KB WebGL library this projects the 3D points by hand and
 * draws additive glow strokes on a 2D canvas. Same look, a few KB, and it
 * runs on every browser that has <canvas>.
 *
 * BPPyramid.mount(canvas, { mode: 'hero' | 'intro' | 'mini', onReveal, onEnd })
 */
(function (global) {
  'use strict';

  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- geometry (units match the original logo proportions) ---- */
  function v(x, y, z) { return { x: x, y: y, z: z }; }
  function lerp3(a, b, k) { return v(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k); }

  var H = 3.94, S = 3.74, CR = S / Math.sqrt(3), BASE = -1.35, LIFT = 0.5;
  var T = v(0, H + BASE + LIFT, 0);
  var F = v(0, BASE + LIFT, CR);
  var L = v(-S / 2, BASE + LIFT, -CR / 2);
  var R = v(S / 2, BASE + LIFT, -CR / 2);
  var Lx = lerp3(T, L, 1.575), Rx = lerp3(T, R, 1.575), Fx = lerp3(T, F, 1.16);

  // [from, to, width, draw-in delay (s), draw-in duration (s)]
  var EDGES = [
    [T, Fx, 1.0, 0.00, 0.55],
    [L, R, 1.05, 0.45, 0.40],
    [L, F, 0.92, 0.70, 0.35],
    [R, F, 0.92, 0.70, 0.35],
    [T, Lx, 1.12, 0.95, 0.55],
    [T, Rx, 1.12, 0.95, 0.55]
  ];
  var YMIN = Lx.y, YMAX = T.y;

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function mount(canvas, opts) {
    opts = opts || {};
    var mode = opts.mode || 'hero';
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var W = 0, Hh = 0, dpr = 1, unit = 1, cx = 0, cy = 0;
    var running = false, visible = true, raf = 0, t0 = 0, last = 0;
    var revealed = false, ended = false;
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var scrollYaw = 0;

    /* particles: a loose shell of points around the pyramid */
    var small = Math.min(global.innerWidth, global.innerHeight) < 700;
    var NP = mode === 'intro' ? (small ? 110 : 200) : mode === 'mini' ? 60 : (small ? 80 : 140);
    var parts = [];
    for (var i = 0; i < NP; i++) {
      var r = 4.5 + Math.random() * 7.5, th = Math.random() * Math.PI * 2, ph = (Math.random() - 0.5) * 1.6;
      parts.push({ x: Math.cos(th) * Math.cos(ph) * r, y: Math.sin(ph) * r * 0.7, z: Math.sin(th) * Math.cos(ph) * r, s: Math.random() * 1.2 + 0.4, p: Math.random() * 6.28 });
    }
    /* an orbit of data points around the base */
    var ORB = 48, orbit = [];
    for (var k = 0; k < ORB; k++) orbit.push(k / ORB * Math.PI * 2);

    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(global.devicePixelRatio || 1, small ? 1.5 : 2);
      W = Math.max(1, rect.width);
      Hh = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(Hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var fit = mode === 'intro' ? 0.075 : 0.118;
      unit = Math.min(W, Hh) * fit;
      cx = W / 2;
      cy = mode === 'intro' ? Hh * 0.42 : Hh * 0.5;
      if (!running) draw(lastT);
    }

    var camYaw = 0, camElev = 25 * Math.PI / 180, D = 17;
    function project(p) {
      var cyw = Math.cos(camYaw), syw = Math.sin(camYaw);
      var x = p.x * cyw + p.z * syw;
      var z = -p.x * syw + p.z * cyw;
      var ce = Math.cos(camElev), se = Math.sin(camElev);
      var y = p.y * ce - z * se;
      z = p.y * se + z * ce;
      var k = D / (D - z);
      return { x: cx + x * unit * k, y: cy - y * unit * k, k: k, z: z };
    }

    function edgeColor(y, a) {
      // light ice-blue at the apex → deep brand blue at the feet
      var m = clamp01((YMAX - y) / (YMAX - YMIN));
      var r = Math.round(160 + (20 - 160) * m), g = Math.round(214 + (101 - 214) * m), b = Math.round(255 + (230 - 255) * m);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function glowDot(x, y, rad, alpha) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
      g.addColorStop(0.25, 'rgba(160,210,255,' + alpha * 0.55 + ')');
      g.addColorStop(1, 'rgba(50,110,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 6.2832);
      ctx.fill();
    }

    var lastT = 99;
    function draw(t) {
      lastT = t;
      ctx.clearRect(0, 0, W, Hh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      /* particles */
      var pa = mode === 'intro' ? Math.min(t / 1.4, 1) * 0.6 : 0.55;
      var prot = t * 0.04;
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        var c = Math.cos(prot), s = Math.sin(prot);
        var pp = project({ x: q.x * c + q.z * s, y: q.y, z: -q.x * s + q.z * c });
        var tw = 0.6 + 0.4 * Math.sin(t * 1.3 + q.p);
        var depth = clamp01((pp.z + 10) / 20);
        ctx.fillStyle = 'rgba(90,150,240,' + (pa * tw * (0.25 + depth * 0.75)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, q.s * pp.k * (unit / 34), 0, 6.2832);
        ctx.fill();
      }

      /* orbit ring around the base */
      if (mode !== 'intro') {
        var oy = BASE + LIFT - 0.15, orad = 3.6;
        for (var j = 0; j < orbit.length; j++) {
          var a = orbit[j] + t * 0.18;
          var op = project({ x: Math.cos(a) * orad, y: oy, z: Math.sin(a) * orad });
          var front = clamp01((op.z + 3.6) / 7.2);
          var big = j % 8 === 0;
          ctx.fillStyle = big ? 'rgba(56,214,255,' + (0.35 + front * 0.6).toFixed(3) + ')' : 'rgba(110,170,255,' + (0.12 + front * 0.4).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(op.x, op.y, (big ? 2.4 : 1.2) * op.k, 0, 6.2832);
          ctx.fill();
        }
      }

      /* edges */
      for (var e = 0; e < EDGES.length; e++) {
        var E = EDGES[e];
        var prog = drawIn ? clamp01((t - E[3]) / E[4]) : 1;
        if (prog <= 0) continue;
        var a3 = E[0], b3 = lerp3(E[0], E[1], easeOut(prog));
        var A = project(a3), B = project(b3);
        var midY = (a3.y + b3.y) / 2;
        var w = E[2] * unit / 17;
        var grad = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
        grad.addColorStop(0, edgeColor(a3.y, 1));
        grad.addColorStop(1, edgeColor(b3.y, 1));
        // three passes: wide haze, glow, hot core
        ctx.strokeStyle = edgeColor(midY, 0.06);
        ctx.lineWidth = w * 13;
        line(A, B);
        ctx.strokeStyle = edgeColor(midY, 0.16);
        ctx.lineWidth = w * 5.5;
        line(A, B);
        ctx.strokeStyle = grad;
        ctx.lineWidth = w * 1.9;
        line(A, B);
        ctx.strokeStyle = 'rgba(235,246,255,0.55)';
        ctx.lineWidth = w * 0.7;
        line(A, B);

        /* travelling energy pulse */
        var pulseT;
        if (drawIn && prog < 1) pulseT = easeOut(prog);
        else {
          var cyc = (t * 0.32 + e * 0.17) % 1.6;
          pulseT = cyc < 1 ? cyc : -1;
        }
        if (pulseT >= 0) {
          var P = project(lerp3(E[0], E[1], pulseT));
          glowDot(P.x, P.y, w * 9, 0.9 * Math.sin(Math.min(pulseT, 1) * Math.PI) + (drawIn && prog < 1 ? 0.3 : 0));
        }
      }

      /* vertex glows */
      var vg = drawIn ? clamp01((t - 1.5) / 0.8) : 1;
      if (vg > 0) {
        var pT = project(T), pF = project(F);
        var breathe = 0.82 + 0.18 * Math.sin(t * 2.1);
        glowDot(pT.x, pT.y, unit * 1.0, 0.8 * vg * breathe);
        glowDot(pF.x, pF.y, unit * 0.7, 0.5 * vg * breathe);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function line(A, B) {
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    var ELEV = 25 * Math.PI / 180;
    var drawIn = mode === 'intro' || (mode === 'hero' && !reducedMotion);
    var SETTLE = 3.0, TOTAL = 5.2;

    function step(ts) {
      if (!running) return;
      if (!t0) t0 = ts;
      var dt = Math.min((ts - (last || ts)) / 1000, 0.05);
      last = ts;
      var t = (ts - t0) / 1000;
      if (mode === 'intro') t *= 1.35; // the opening runs ~3.9s end to end

      if (mode === 'intro') {
        if (t < SETTLE) {
          var p = easeInOut(t / SETTLE);
          camYaw = (1 - p) * -0.9;
          camElev = ELEV + (1 - p) * 0.3;
        } else {
          camYaw = Math.sin((t - SETTLE) * 0.5) * 0.012;
          camElev = ELEV;
        }
        if (!revealed && t > 2.2) { revealed = true; opts.onReveal && opts.onReveal(); }
        if (t > TOTAL && !ended) { ended = true; opts.onEnd && opts.onEnd(); stop(); return; }
      } else {
        pointer.x += (pointer.tx - pointer.x) * Math.min(dt * 3, 1);
        pointer.y += (pointer.ty - pointer.y) * Math.min(dt * 3, 1);
        var intro = mode === 'hero' ? (1 - easeInOut(clamp01(t / 2.4))) : 0;
        camYaw = Math.sin(t * 0.25) * 0.2 + pointer.x * 0.16 + scrollYaw - intro * 0.9;
        camElev = ELEV + pointer.y * 0.18 + intro * 0.3;
        if (drawIn && t > 2) drawIn = false;
      }
      draw(t);
      raf = global.requestAnimationFrame(step);
    }

    function start() {
      if (running || !visible || reducedMotion) return;
      running = true;
      last = 0;
      raf = global.requestAnimationFrame(step);
    }
    function stop() {
      running = false;
      if (raf) global.cancelAnimationFrame(raf);
      // keep the clock continuous so resuming does not replay the draw-in
      if (t0) { var now = global.performance.now(); pausedAt = now; }
    }
    var pausedAt = 0;
    function resume() {
      if (pausedAt && t0) t0 += global.performance.now() - pausedAt;
      pausedAt = 0;
      start();
    }

    /* wiring */
    if ('ResizeObserver' in global) new ResizeObserver(resize).observe(canvas);
    else global.addEventListener('resize', resize);
    resize();

    if (mode !== 'intro') {
      if ('IntersectionObserver' in global) {
        new IntersectionObserver(function (en) {
          visible = en[0].isIntersecting;
          if (visible) resume(); else stop();
        }, { rootMargin: '80px' }).observe(canvas);
      }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else if (visible) resume();
      });
      if (mode === 'hero' && global.matchMedia('(pointer: fine)').matches) {
        global.addEventListener('pointermove', function (ev) {
          pointer.tx = (ev.clientX / global.innerWidth - 0.5) * 2;
          pointer.ty = (ev.clientY / global.innerHeight - 0.5) * 2;
        }, { passive: true });
      }
      if (mode === 'hero') {
        global.addEventListener('scroll', function () {
          scrollYaw = Math.min(global.scrollY / global.innerHeight, 1) * 0.45;
        }, { passive: true });
      }
    }

    if (reducedMotion) {
      camYaw = 0; camElev = ELEV; drawIn = false;
      draw(4);
      if (mode === 'intro') {
        opts.onReveal && opts.onReveal();
        global.setTimeout(function () { opts.onEnd && opts.onEnd(); }, 1800);
      }
    } else {
      start();
    }

    return { stop: stop, start: resume };
  }

  global.BPPyramid = { mount: mount };
})(window);
