/* JARVIS — AI core visual: the "ignition" plasma core (MK L).
   A flowing plasma sphere (deep blue at the back), a white-hot nucleus turning the other way,
   solar-flare loops, an accretion disk the sphere hides behind itself, a glowing rim, light rays,
   three gyro rings, lightning while thinking, a voice ring and heartbeat pulses.
   It matches the boot screen's core (boot-core.js): live from the start, pulse() on INITIALIZE;
   ignite() replays implosion -> ignition. The previous dot-sphere is kept as sphere-classic.js.

   Plain Canvas 2D, no libraries. Exposes window.JarvisSphere =
     { init, setState, setLevel, setSpectrum, setAccent, setOptions, pulse, ignite }.
   setOptions({ density, intensity, motion, web, spec, hud, pulses }) — each optional:
     density 0.05..1 share of plasma particles; intensity 0..2 glow (0 = no bloom);
     motion 0..2 flow / spin speed; web 0..2 accretion disk; spec 0..2 voice ring;
     hud 0..2 gyro rings; pulses: flare loops + lightning on/off. Safe before init. */
(function () {
  'use strict';
  if (typeof window === 'undefined') { return; }

  var NP_MAX = 4800, N_NUC = 700, N_DISK = 1400, N_LOOP = 8, N_SPEC = 36;
  var FOV = 3.6, TILT = 0.38, DISK_AX = 1.22, DISK_AZ = 0.22;
  var IMPLODE = 1.15;                      // seconds from ignite() to the ignition flash
  var PALETTES = {
    idle: [64, 214, 255], listening: [255, 194, 94], thinking: [255, 170, 58], speaking: [125, 238, 255]
  };
  var STATES = {
    idle:      { flow: 0.55, spin: 0.45, glow: 0.85, loops: 1.0, bolts: 0, rings: 1.0, swell: 1.00 },
    listening: { flow: 0.85, spin: 0.6,  glow: 1.0,  loops: 1.3, bolts: 0, rings: 1.6, swell: 1.04 },
    thinking:  { flow: 2.2,  spin: 1.3,  glow: 1.1,  loops: 1.8, bolts: 1, rings: 3.0, swell: 1.02 },
    speaking:  { flow: 1.0,  spin: 0.5,  glow: 1.0,  loops: 1.4, bolts: 0, rings: 1.3, swell: 1.01 }
  };
  var KEYS = ['flow', 'spin', 'glow', 'loops', 'bolts', 'rings', 'swell'];
  var RINGS = [
    { r: 1.48, ax: 1.2, ay: 0.25, sx: 0.5, sy: 0.21, kind: 0 },     // segmented band
    { r: 1.66, ax: -0.55, ay: 0.95, sx: -0.34, sy: 0.4, kind: 1 },  // thin line
    { r: 1.84, ax: 0.35, ay: -1.15, sx: 0.2, sy: -0.27, kind: 2 }   // dotted
  ];

  // ---- options (module vars, safe before init) ----
  var optDensity = 0.67, optIntensity = 1, optMotion = 1, optWeb = 1, optSpec = 1, optHud = 1, optPulses = 1;
  var np = Math.round(NP_MAX * optDensity);

  // ---- particles ----
  var pLat = new Float32Array(NP_MAX), pLon = new Float32Array(NP_MAX), pRR = new Float32Array(NP_MAX);
  var pSX = new Float32Array(NP_MAX), pSY = new Float32Array(NP_MAX), pSZ = new Float32Array(NP_MAX);
  var pDelay = new Float32Array(NP_MAX), pSwirl = new Float32Array(NP_MAX), pHot = new Uint8Array(NP_MAX);
  var pPX = new Float32Array(NP_MAX), pPY = new Float32Array(NP_MAX);
  var nLat = new Float32Array(N_NUC), nLon = new Float32Array(N_NUC), nRR = new Float32Array(N_NUC);
  var dR = new Float32Array(N_DISK), dA = new Float32Array(N_DISK), dY = new Float32Array(N_DISK);
  var dPX = new Float32Array(N_DISK), dPY = new Float32Array(N_DISK);
  var loops = [], sparks = [], shocks = [], beats = [], bolts = [], boltTimer = 0;
  var i;
  for (i = 0; i < NP_MAX; i++) {
    pLat[i] = Math.asin(Math.random() * 2 - 1); pLon[i] = Math.random() * 6.2832; pRR[i] = 1 + (Math.random() - 0.5) * 0.05;
    var u = Math.random() * 2 - 1, th = Math.random() * 6.2832, d = 3.2 + Math.random() * 3.5, s = Math.sqrt(1 - u * u);
    pSX[i] = Math.cos(th) * s * d; pSY[i] = u * d; pSZ[i] = Math.sin(th) * s * d * 0.6 - 1.2;
    pDelay[i] = Math.random() * 0.45; pSwirl[i] = 2.2 + Math.random() * 1.6; pHot[i] = Math.random() < 0.06 ? 1 : 0;
    pPX[i] = NaN;
  }
  for (i = 0; i < N_NUC; i++) { nLat[i] = Math.asin(Math.random() * 2 - 1); nLon[i] = Math.random() * 6.2832; nRR[i] = 0.42 + Math.random() * 0.16; }
  for (i = 0; i < N_LOOP; i++) { loops.push(newLoop(0.2 + i * 0.15)); }
  for (i = 0; i < N_DISK; i++) { dR[i] = 1.22 + Math.pow(Math.random(), 1.7) * 0.66; dA[i] = Math.random() * 6.2832; dY[i] = (Math.random() - 0.5) * 0.03; dPX[i] = NaN; }

  // ---- runtime state ----
  var canvas = null, ctx = null, trail = null, tctx = null, bloom = null, bctx = null;
  var started = false, cw = 0, ch = 0, dpr = 1, lastNow = 0, timeSec = 0;
  var bootEl = document.getElementById('boot');
  var R = 0, midX = 0, midY = 0, sc = 1;
  var stateName = 'idle', target = STATES.idle, cur = {};
  for (i = 0; i < KEYS.length; i++) { cur[KEYS[i]] = STATES.idle[KEYS[i]]; }
  var colState = PALETTES.idle.slice(), col = [64, 214, 255], deep = [22, 118, 255];
  var accentOn = false, accentAmt = 0, accent = [0, 0, 0];
  var rawLevel = 0, level = 0, prevLevel = 0, shockCool = 0;
  var specTarget = new Float32Array(N_SPEC), specSmooth = new Float32Array(N_SPEC), lastSpecMs = -1e9, specW = 0;
  var spin = 0, ringRot = [[0, 0], [0, 0], [0, 0]], nextBeat = 4;
  // live from the start (the boot screen plays the ignition); ignite() can replay implosion -> ignition here
  var igniteAt = -20, ignAt = -10, ignited = true;
  var spr = null, sprDeep = null, sprHot = null, sprFlare = null, sprKey = '';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function after(at, k) { return at < 0 || timeSec < at ? 0 : Math.exp(-(timeSec - at) * k); }
  function rgba(c, a, w) {
    w = w || 0;
    return 'rgba(' + Math.round(c[0] + (255 - c[0]) * w) + ',' + Math.round(c[1] + (255 - c[1]) * w) + ',' +
      Math.round(c[2] + (255 - c[2]) * w) + ',' + clamp(a, 0, 1).toFixed(3) + ')';
  }
  function nowMsFn() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function parseHex(s) {
    if (typeof s !== 'string') { return null; }
    var str = s.charAt(0) === '#' ? s.slice(1) : s;
    if (str.length === 3) { str = str.charAt(0) + str.charAt(0) + str.charAt(1) + str.charAt(1) + str.charAt(2) + str.charAt(2); }
    if (str.length !== 6) { return null; }
    var r = parseInt(str.slice(0, 2), 16), g = parseInt(str.slice(2, 4), 16), b = parseInt(str.slice(4, 6), 16);
    return (isNaN(r) || isNaN(g) || isNaN(b)) ? null : [r, g, b];
  }
  // Sprites live in ordinary memory (willReadFrequently = not on the GPU): a GPU reset wipes GPU
  // canvases, and these are drawn only when the colour changes.
  function mk(w, h, cpu) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    return [c, c.getContext('2d', cpu ? { willReadFrequently: true } : undefined)];
  }
  function sprite(c, w, size) {
    var m = mk(size, size, true), h = size / 2, gr = m[1].createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, rgba(c, 1, Math.max(w, 0.7))); gr.addColorStop(0.2, rgba(c, 0.8, w));
    gr.addColorStop(0.55, rgba(c, 0.14)); gr.addColorStop(1, rgba(c, 0));
    m[1].fillStyle = gr; m[1].fillRect(0, 0, size, size); return m[0];
  }
  function rebuildSprites() {
    var key = col.join(',');
    if (key === sprKey) { return; }
    sprKey = key;
    deep = [Math.round(col[0] * 0.35), Math.round(col[1] * 0.55), Math.round(Math.min(255, col[2] * 0.95 + 20))];
    spr = sprite(col, 0.1, 32); sprDeep = sprite(deep, 0.05, 32); sprHot = sprite(col, 0.85, 32); sprFlare = sprite(col, 0.95, 128);
  }

  function resize() {
    if (!canvas) { return; }
    dpr = window.devicePixelRatio || 1;
    if (!(dpr > 0) || !isFinite(dpr)) { dpr = 1; }
    var dw = Math.round(canvas.clientWidth * dpr), dh = Math.round(canvas.clientHeight * dpr);
    if (!(dw >= 0)) { dw = 0; }
    if (!(dh >= 0)) { dh = 0; }
    if (dw === cw && dh === ch) { return; }
    cw = dw; ch = dh;
    if (dw > 0 && dh > 0) {
      canvas.width = dw; canvas.height = dh;
      trail.width = dw; trail.height = dh;
      bloom.width = Math.max(1, Math.round(dw / 4)); bloom.height = Math.max(1, Math.round(dh / 4));
    }
    for (var k = 0; k < NP_MAX; k++) { pPX[k] = NaN; }
    for (k = 0; k < N_DISK; k++) { dPX[k] = NaN; }
    for (k = 0; k < sparks.length; k++) { sparks[k].px = NaN; }
    sprKey = '';                             // redraw the sprites too (cheap; belt and braces)
  }

  // ---- 3D helpers (results in scratch vars to keep the hot loops allocation-free) ----
  var qx = 0, qy = 0, qz = 0, sx = 0, sy = 0, sk = 0;
  function rot(x, y, z, ax, ay, az) {
    var c = Math.cos(ax), s = Math.sin(ax), t = y * c - z * s; z = y * s + z * c; y = t;
    c = Math.cos(ay); s = Math.sin(ay); t = x * c + z * s; z = -x * s + z * c; x = t;
    if (az) { c = Math.cos(az); s = Math.sin(az); t = x * c - y * s; y = x * s + y * c; x = t; }
    qx = x; qy = y; qz = z;
  }
  function proj(x, y, z) {
    if (z > FOV - 0.45) { return false; }
    sk = FOV / (FOV - z); sx = midX + x * R * sk; sy = midY + y * R * sk; return true;
  }
  function onSphere(lat, lon, r) {           // -> q*
    var c = Math.cos(lat);
    rot(c * Math.cos(lon) * r, Math.sin(lat) * r, c * Math.sin(lon) * r, TILT, spin, 0);
  }
  function dot(c2, img, x, y, sz, a) {
    if (a <= 0.004) { return; }
    c2.globalAlpha = a > 1 ? 1 : a; c2.drawImage(img, x - sz, y - sz, sz * 2, sz * 2);
  }
  function newLoop(at) {
    var lat = (Math.random() - 0.5) * 2.2, lon = Math.random() * 6.2832;
    return { la: lat, lo: lon, lb: clamp(lat + (Math.random() - 0.5), -1.4, 1.4), lob: lon + 0.45 + Math.random() * 0.7,
             h: 0.28 + Math.random() * 0.5, born: at, life: 0.9 + Math.random() * 0.9, sp: 0.5 + Math.random() * 0.6 };
  }
  function beat() { var b = 0; for (var k = 0; k < beats.length; k++) { b += beats[k].a * after(beats[k].t, 9); } return b; }
  function addBeat(a) { beats.push({ t: timeSec, a: a }); if (beats.length > 6) { beats.shift(); } }
  function addShock(big) { shocks.push({ t: timeSec, big: big }); if (shocks.length > 6) { shocks.shift(); } }

  function ignition() {
    ignAt = timeSec;
    addShock(1); addBeat(1.4);
    sparks = [];
    for (var n = 0; n < 700; n++) {
      var flat = n < 450, v = flat ? 3 + Math.random() * 5 : 1.6 + Math.random() * 4, x, y, z;
      if (flat) { var a = Math.random() * 6.2832; rot(Math.cos(a), (Math.random() - 0.5) * 0.06, Math.sin(a), DISK_AX, 0, DISK_AZ); x = qx; y = qy; z = qz; }
      else { var u = Math.random() * 2 - 1, th = Math.random() * 6.2832, s = Math.sqrt(1 - u * u); x = Math.cos(th) * s; y = u; z = Math.sin(th) * s; }
      sparks.push({ x: x, y: y, z: z, vx: x * v, vy: y * v, vz: z * v, life: 0.5 + Math.random() * 1.0, age: 0, px: NaN, py: 0 });
    }
    loops = [];
    for (n = 0; n < N_LOOP; n++) { loops.push(newLoop(timeSec + 0.2 + n * 0.15)); }
    nextBeat = timeSec + 4;
  }

  // ---- spectrum ----
  function ingestSpectrum(arr) {
    var L = arr.length | 0;
    if (L < 1) { return false; }
    for (var k = 0; k < N_SPEC; k++) {
      var p = k * (L - 1) / (N_SPEC - 1), i0 = p | 0, f = p - i0, i1 = Math.min(L - 1, i0 + 1);
      var v0 = +arr[i0] || 0, v1 = +arr[i1] || 0;
      specTarget[k] = clamp((v0 + (v1 - v0) * f) / 255, 0, 1);
    }
    return true;
  }

  // ---- frame ----
  function frame(nowMs) {
    window.requestAnimationFrame(frame);
    try { renderFrame(nowMs); } catch (e) { /* never let a bad input kill the shared rAF */ }
  }

  function renderFrame(nowMs) {
    if ((window.devicePixelRatio || 1) !== dpr) { resize(); }
    var dt = (nowMs - lastNow) / 1000;
    lastNow = nowMs;
    if (!(dt > 0)) { dt = 0.016; }
    if (dt > 0.05) { dt = 0.05; }
    if (document.hidden) { return; }
    if (!ctx || cw < 4 || ch < 4) { return; }
    if (bootEl && !bootEl.classList.contains('hidden')) { return; }   // covered by the boot screen: its own core is drawing
    timeSec += dt;
    var mdt = dt * optMotion, k;

    // smooth toward the active state
    var sm = 1 - Math.exp(-dt * 4);
    for (k = 0; k < KEYS.length; k++) { cur[KEYS[k]] += (target[KEYS[k]] - cur[KEYS[k]]) * sm; }
    var pal = PALETTES[stateName], cs = 1 - Math.exp(-dt * 6);
    for (k = 0; k < 3; k++) { colState[k] += (pal[k] - colState[k]) * cs; }
    accentAmt += ((accentOn ? 1 : 0) - accentAmt) * (1 - Math.exp(-dt * 6));
    for (k = 0; k < 3; k++) { col[k] = Math.round(colState[k] * (1 - 0.55 * accentAmt) + accent[k] * 0.55 * accentAmt); }
    rebuildSprites();

    // voice level: fast attack, slow decay; speech onsets pulse the core
    level += (rawLevel - level) * (1 - Math.exp(-(rawLevel > level ? 18 : 3.2) * dt));
    shockCool -= dt;
    if (stateName === 'speaking' && level - prevLevel > 0.14 && shockCool <= 0) { addShock(0.25); addBeat(0.5 + level * 0.5); shockCool = 0.28; }
    prevLevel = level;
    var fresh = (nowMs - lastSpecMs) < 220 ? 1 : 0;
    specW += (fresh - specW) * (1 - Math.exp(-dt * 4));
    for (k = 0; k < N_SPEC; k++) { specSmooth[k] += (specTarget[k] - specSmooth[k]) * (1 - Math.exp(-(specTarget[k] > specSmooth[k] ? 22 : 6) * dt)); }

    var w = cw, h = ch;
    R = Math.min(w, h) * 0.245; midX = w / 2; midY = h / 2; sc = R / 168;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    var tIg = timeSec - igniteAt;
    if (!ignited && tIg >= IMPLODE) { ignition(); ignited = true; }
    var live = ignited;

    // idle heartbeat: a soft double thump every few seconds
    if (live && timeSec >= nextBeat) {
      if (stateName === 'idle' || stateName === 'listening') { addBeat(0.35); beats.push({ t: timeSec + 0.22, a: 0.2 }); }
      nextBeat = timeSec + 4.5 + Math.random() * 2;
    }
    var bt = beat(), lv = stateName === 'speaking' ? level : stateName === 'listening' ? level * 0.5 : 0;
    var ignE = after(ignAt, 6);
    var swell = cur.swell * (1 + 0.12 * ignE + 0.07 * bt + 0.06 * lv + 0.012 * Math.sin(timeSec * 2.3) * optMotion);
    var fl = (cur.flow + 1.6 * after(ignAt, 2.5) + 1.2 * bt + 1.6 * lv);
    spin += (live ? cur.spin + 1.4 * after(ignAt, 3) : 0.2) * mdt;
    var I = live ? (0.85 + 2.0 * ignE + 0.9 * bt + 0.5 * lv) * cur.glow : 0.08 + 0.5 * Math.pow(clamp(tIg / IMPLODE, 0, 1), 3);
    var inten = optIntensity;

    // ======== trail layer ========
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalAlpha = 1;
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.exp(-dt * (live ? 9.75 : 36))).toFixed(3) + ')';
    tctx.fillRect(0, 0, w, h);
    tctx.globalCompositeOperation = 'lighter';
    tctx.lineCap = 'round';

    // accretion disk: points move, streaks batched into a few paths
    var diskIn = live ? 1 - Math.pow(1 - clamp((timeSec - ignAt - 0.05) / 0.85, 0, 1), 3) : 0;
    var diskA = diskIn * optWeb;
    var paths = null;
    if (diskA > 0.01) {
      paths = [];
      for (k = 0; k < 8; k++) { paths.push([new Path2D(), new Path2D()]); }   // [alpha bucket][back, front]
      var dsp = (1 + 1.5 * after(ignAt, 2) + bt + lv) * mdt;
      for (k = 0; k < N_DISK; k++) {
        dA[k] += 1.7 / Math.pow(dR[k], 1.5) * dsp;
        var rr = dR[k] * (0.6 + 0.4 * diskIn) * (1 + 0.04 * bt);
        rot(Math.cos(dA[k]) * rr, dY[k], Math.sin(dA[k]) * rr, DISK_AX, spin * 0.15, DISK_AZ);
        var hidden = qz < 0 && qx * qx + qy * qy < swell * swell * 0.94;
        if (!proj(qx, qy, qz)) { dPX[k] = NaN; continue; }
        if (!hidden && dPX[k] === dPX[k]) {
          var dop = 0.55 + 0.45 * Math.sin(dA[k] + 0.6), inner = 1 - (dR[k] - 1.22) / 0.66;
          var b = Math.min(7, Math.floor(dop * (0.6 + 0.4 * inner) * 8));
          var pth = paths[b][qz >= 0 ? 1 : 0];
          pth.moveTo(dPX[k], dPY[k]); pth.lineTo(sx, sy);
        }
        dPX[k] = sx; dPY[k] = sy;
      }
    }
    function strokeDisk(front) {
      if (!paths) { return; }
      for (var b2 = 0; b2 < 8; b2++) {
        var a = (0.06 + 0.45 * (b2 + 0.5) / 8) * diskA;
        tctx.strokeStyle = rgba(b2 > 4 ? col : deep, a, 0.08 + 0.3 * b2 / 8);
        tctx.lineWidth = (1.0 + 1.2 * b2 / 8) * sc * 1.2;
        tctx.stroke(paths[b2][front]);
      }
    }
    strokeDisk(0);

    // plasma sphere (implosion before ignition)
    var al, sz;
    if (!live) {
      var stk = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      var tt = clamp(tIg / IMPLODE, 0, 1);
      for (k = 0; k < np; k++) {
        var kk = clamp((tIg - pDelay[k]) / (IMPLODE - pDelay[k]), 0, 1), e = kk * kk * kk;
        onSphere(pLat[k], pLon[k], 1);
        var tx = qx, ty = qy, tz = qz, swl = (1 - e) * pSwirl[k];
        rot(pSX[k] + (tx - pSX[k]) * e, pSY[k] + (ty - pSY[k]) * e, pSZ[k] + (tz - pSZ[k]) * e, swl * 0.25, swl, 0);
        if (!proj(qx, qy, qz)) { pPX[k] = NaN; continue; }
        if (kk > 0 && pPX[k] === pPX[k]) { var p4 = stk[Math.min(3, Math.floor(kk * 4))]; p4.moveTo(pPX[k], pPY[k]); p4.lineTo(sx, sy); }
        pPX[k] = sx; pPY[k] = sy;
      }
      for (k = 0; k < 4; k++) {
        tctx.strokeStyle = rgba(k < 2 ? deep : col, (0.08 + 0.32 * (k + 0.5) / 4) * (0.4 + 0.6 * tt), 0.15 + 0.5 * k / 4);
        tctx.lineWidth = (0.6 + 0.9 * k / 4) * sc * 1.3;
        tctx.stroke(stk[k]);
      }
    } else {
      for (k = 0; k < np; k++) {
        pLon[k] += (0.5 + 0.6 * Math.sin(pLat[k] * 3 + timeSec * 0.9) + 0.25 * Math.sin(pLat[k] * 5 - timeSec * 1.7)) * fl * mdt;
        pLat[k] += (0.45 * Math.sin(pLon[k] * 2 + timeSec * 1.3) + 0.2 * Math.sin(pLon[k] * 4 - timeSec * 0.8 + pLat[k] * 3)) * fl * mdt;
        if (pLat[k] > 1.45 || pLat[k] < -1.45) { pLat[k] = clamp(pLat[k], -1.45, 1.45) * 0.98; pLon[k] += 3.1416; }
        onSphere(pLat[k], pLon[k], pRR[k] * swell * (1 + 0.035 * Math.sin(pLon[k] * 5 + timeSec * 6) * (1 + 3 * bt + 3 * lv)));
        if (!proj(qx, qy, qz)) { continue; }
        var front = clamp((qz + 1) / 2, 0, 1);
        sz = (1.0 + 1.8 * front) * sk * 1.1 * sc * (pHot[k] ? 1.5 : 1);
        dot(tctx, pHot[k] ? sprHot : front < 0.4 ? sprDeep : spr, sx, sy, sz, (0.03 + 0.27 * front) * (0.75 + 0.25 * cur.glow));
      }
      // nucleus, turning the other way
      var na = clamp((timeSec - ignAt) / 0.4, 0, 1);
      for (k = 0; k < N_NUC; k++) {
        nLon[k] -= 1.6 * fl * mdt; nLat[k] += 0.6 * Math.sin(nLon[k] * 3 + timeSec) * fl * mdt;
        var c0 = Math.cos(nLat[k]), r0 = nRR[k] * swell * (1 + 0.15 * bt);
        rot(c0 * Math.cos(nLon[k]) * r0, Math.sin(nLat[k]) * r0, c0 * Math.sin(nLon[k]) * r0, -TILT, -spin * 1.3, 0);
        if (proj(qx, qy, qz)) { dot(tctx, sprHot, sx, sy, 1.6 * sk * sc, (0.15 + 0.35 * (qz / nRR[k] + 1) / 2) * na); }
      }
      // solar-flare loops arcing off the surface
      if (optPulses) {
        for (var n = 0; n < loops.length; n++) {
          var L = loops[n];
          if (timeSec > L.born + L.life) { L = loops[n] = newLoop(timeSec); }
          var env = Math.sin(Math.PI * clamp((timeSec - L.born) / L.life, 0, 1)) * (0.7 + 0.3 * cur.loops) * (1 + 0.8 * bt + lv);
          if (env <= 0) { continue; }
          var ca = Math.cos(L.la), cb = Math.cos(L.lb);
          var ax0 = ca * Math.cos(L.lo), ay0 = Math.sin(L.la), az0 = ca * Math.sin(L.lo);
          var bx0 = cb * Math.cos(L.lob), by0 = Math.sin(L.lb), bz0 = cb * Math.sin(L.lob);
          for (var j = 0; j < 30; j++) {
            var uu = (j / 30 + timeSec * L.sp * cur.loops) % 1;
            var x = ax0 + (bx0 - ax0) * uu, y = ay0 + (by0 - ay0) * uu, z = az0 + (bz0 - az0) * uu;
            var ln = Math.sqrt(x * x + y * y + z * z), r2 = swell * (1 + L.h * Math.sin(Math.PI * uu));
            rot(x / ln * r2, y / ln * r2, z / ln * r2, TILT, spin, 0);
            if (qz < 0 && qx * qx + qy * qy < swell * swell) { continue; }
            if (!proj(qx, qy, qz)) { continue; }
            var fr = (qz / r2 + 1) / 2;
            dot(tctx, sprHot, sx, sy, (1.6 + 1.6 * fr) * sk * sc, (0.25 + 0.6 * fr) * env * Math.sin(Math.PI * uu));
          }
        }
      }
    }
    tctx.globalAlpha = 1;
    strokeDisk(1);

    // ignition sparks
    if (sparks.length) {
      var sp4 = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], anyS = false;
      for (k = 0; k < sparks.length; k++) {
        var S = sparks[k];
        S.age += dt; if (S.age > S.life) { continue; }
        var dmp = Math.exp(-dt * 2.8);
        S.x += S.vx * dt; S.y += S.vy * dt; S.z += S.vz * dt; S.vx *= dmp; S.vy *= dmp; S.vz *= dmp;
        if (!proj(S.x, S.y, S.z)) { S.px = NaN; continue; }
        if (S.px === S.px) { var pp = sp4[Math.min(3, Math.floor((1 - S.age / S.life) * 4))]; pp.moveTo(S.px, S.py); pp.lineTo(sx, sy); anyS = true; }
        S.px = sx; S.py = sy;
      }
      for (k = 0; k < 4; k++) {
        var f4 = (k + 0.5) / 4;
        tctx.strokeStyle = rgba(col, 0.8 * f4, 0.2 + 0.7 * f4 * f4); tctx.lineWidth = (1 + 1.6 * f4) * sc;
        tctx.stroke(sp4[k]);
      }
      if (!anyS && timeSec - ignAt > 2) { sparks = []; }
    }

    // ======== composite ========
    ctx.globalCompositeOperation = 'lighter';
    var Rz = R;
    if (live && inten > 0) {                  // light rays fanning out of the core
      var ra = (0.07 + 0.2 * after(ignAt, 3) + 0.14 * bt + 0.1 * lv) * inten;
      var gr = ctx.createRadialGradient(midX, midY, Rz * 0.2, midX, midY, Rz * 3.4);
      gr.addColorStop(0, rgba(col, ra, 0.4)); gr.addColorStop(0.35, rgba(col, ra * 0.4)); gr.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gr; ctx.beginPath();
      for (k = 0; k < 48; k++) {
        var a2 = k / 48 * 6.2832 + timeSec * 0.06 * optMotion + Math.sin(k * 7.3) * 0.05;
        var len = Rz * (1.7 + 1.5 * (0.5 + 0.5 * Math.sin(timeSec * 2.6 * optMotion + k * 1.7)) * (0.5 + 0.5 * Math.sin(k * 3.1)));
        var ww = 0.008 + 0.012 * (0.5 + 0.5 * Math.sin(k * 5.7));
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX + Math.cos(a2 - ww) * len, midY + Math.sin(a2 - ww) * len);
        ctx.lineTo(midX + Math.cos(a2 + ww) * len, midY + Math.sin(a2 + ww) * len);
        ctx.closePath();
      }
      ctx.fill();
    }
    var gl = Math.min(I, 2.2) * Math.max(0.3, inten);
    var cg = ctx.createRadialGradient(midX, midY, 0, midX, midY, Rz * 2.1);
    cg.addColorStop(0, rgba(col, 0.18 * gl, 0.4)); cg.addColorStop(0.3, rgba(col, 0.07 * gl)); cg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(trail, 0, 0);
    if (inten > 0) {                          // bloom: the trail layer blurred at quarter size, added back
      bctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0, 0, bloom.width, bloom.height);
      bctx.filter = 'blur(' + Math.max(2, Math.round(R / 40)) + 'px)';
      bctx.drawImage(trail, 0, 0, bloom.width, bloom.height);
      bctx.filter = 'none';
      ctx.globalAlpha = clamp(0.55 * inten, 0, 1); ctx.drawImage(bloom, 0, 0, w, h); ctx.globalAlpha = 1;
    }
    if (live) {                               // fresnel rim
      var rz = Rz * swell, rA = (0.16 + 0.3 * bt + 0.2 * lv) * clamp((timeSec - ignAt) / 0.5, 0, 1) * Math.max(0.4, inten);
      var rim = ctx.createRadialGradient(midX, midY, rz * 0.82, midX, midY, rz * 1.18);
      rim.addColorStop(0, rgba(col, 0)); rim.addColorStop(0.5, rgba(col, rA, 0.35)); rim.addColorStop(0.62, rgba(col, rA * 0.35)); rim.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(midX, midY, rz * 1.18, 0, 6.2832); ctx.fill();
    }
    // hot centre + lens star
    var cr = Rz * (0.2 + 0.16 * Math.min(I, 2));
    cg = ctx.createRadialGradient(midX, midY, 0, midX, midY, cr);
    cg.addColorStop(0, rgba(col, Math.min(1, 0.9 * I), 0.95)); cg.addColorStop(0.3, rgba(col, 0.5 * Math.min(I, 1.5), 0.6)); cg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(midX, midY, cr, 0, 6.2832); ctx.fill();
    dot(ctx, sprFlare, midX, midY, (30 + 55 * Math.min(I, 3)) * sc, 0.32 * I);
    ctx.globalAlpha = 1;
    var star = [[Rz * 2.6, 2.2, 0.5], [Rz * 1.1, 1.8, 0.35]];
    for (k = 0; k < 2; k++) {
      var Ls = star[k][0] * Math.min(I, 2.5) / 1.6, wd = star[k][1] * sc * 1.3, aa = star[k][2] * Math.min(I, 1.6);
      var gh = ctx.createLinearGradient(midX - Ls, 0, midX + Ls, 0);
      gh.addColorStop(0, rgba(col, 0)); gh.addColorStop(0.5, rgba(col, aa, 0.8)); gh.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gh; ctx.fillRect(midX - Ls, midY - wd / 2, Ls * 2, wd);
      var gv = ctx.createLinearGradient(0, midY - Ls * 0.4, 0, midY + Ls * 0.4);
      gv.addColorStop(0, rgba(col, 0)); gv.addColorStop(0.5, rgba(col, aa, 0.8)); gv.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gv; ctx.fillRect(midX - wd / 2, midY - Ls * 0.4, wd, Ls * 0.8);
    }

    // gyro rings unfold into place after ignition
    if (live && optHud > 0) {
      var ringBoost = (1 + 1.4 * bt) * 0.8 * optHud;
      for (var ri = 0; ri < 3; ri++) {
        var rg = RINGS[ri], pr = clamp((timeSec - ignAt - 0.2 - 0.14 * ri) / 0.9, 0, 1);
        if (pr <= 0) { continue; }
        var uo = 1 + 2.9 * Math.pow(pr - 1, 3) + 1.9 * Math.pow(pr - 1, 2);   // ease-out-back
        ringRot[ri][0] += rg.sx * cur.rings * (1 + 2 * after(ignAt, 2)) * mdt; ringRot[ri][1] += rg.sy * mdt;
        var rax = rg.ax + ringRot[ri][0] + (1 - uo) * 2.2, ray = rg.ay + ringRot[ri][1], rrr = rg.r * uo, ral = clamp(pr, 0, 1) * ringBoost;
        if (rg.kind === 0) {
          for (var sg = 0; sg < 36; sg++) {
            var a0 = sg / 36 * 6.2832, a1 = a0 + 0.13, ok = true, pts = [];
            var corners = [[a0, 0.965], [a1, 0.965], [a1, 1.035], [a0, 1.035]], zs = 0;
            for (var cn = 0; cn < 4; cn++) {
              rot(Math.cos(corners[cn][0]) * rrr * corners[cn][1], Math.sin(corners[cn][0]) * rrr * corners[cn][1], 0, rax, ray, 0);
              zs += qz;
              if (!proj(qx, qy, qz)) { ok = false; break; }
              pts.push(sx, sy);
            }
            if (!ok) { continue; }
            var fb = (zs / 4 / rrr + 1) / 2;
            ctx.fillStyle = rgba(sg % 9 === 0 ? [255, 176, 64] : col, (0.06 + 0.45 * fb) * ral, 0.2 * fb);
            ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.lineTo(pts[4], pts[5]); ctx.lineTo(pts[6], pts[7]); ctx.fill();
          }
        } else {
          var prx = NaN, pry = 0;
          for (var kk2 = 0; kk2 <= 160; kk2++) {
            var aa2 = kk2 / 160 * 6.2832;
            rot(Math.cos(aa2) * rrr, Math.sin(aa2) * rrr, 0, rax, ray, 0);
            var fz = (qz / rrr + 1) / 2;
            if (!proj(qx, qy, qz)) { prx = NaN; continue; }
            if (prx === prx && (rg.kind === 1 || kk2 % 3 === 0)) {
              ctx.strokeStyle = rgba(col, (0.08 + 0.5 * fz) * ral, 0.3 * fz);
              ctx.lineWidth = (rg.kind === 1 ? 0.8 + 1.2 * fz : 2.2) * sc * 1.2;
              ctx.beginPath(); ctx.moveTo(prx, pry);
              if (rg.kind === 1) { ctx.lineTo(sx, sy); } else { ctx.lineTo(prx + 0.1, pry); }
              ctx.stroke();
            }
            prx = sx; pry = sy;
          }
        }
        for (var nd = 0; nd < 2; nd++) {      // running lights
          var an = timeSec * (1.4 + ri * 0.5) * optMotion + nd * 3.14 + ri;
          rot(Math.cos(an) * rrr, Math.sin(an) * rrr, 0, rax, ray, 0);
          if (!proj(qx, qy, qz)) { continue; }
          var fn = (qz / rrr + 1) / 2;
          dot(ctx, sprHot, sx, sy, (9 + 12 * fn) * sc, (0.3 + 0.7 * fn) * pr);
        }
      }
      ctx.globalAlpha = 1;
    }

    // lightning while thinking (and on strong beats)
    boltTimer -= dt;
    if (boltTimer <= 0) {
      boltTimer = 0.05;
      bolts = [];
      var nb = 0;
      if (live && optPulses && cur.bolts > 0.3 && Math.random() < 0.55 * cur.bolts) { nb = 1 + Math.floor(Math.random() * 3); }
      if (live && optPulses && bt > 0.9) { nb = Math.max(nb, 4); }
      for (var bn = 0; bn < nb; bn++) {
        var rb = RINGS[bn % 3], ab = Math.random() * 6.2832;
        rot(Math.cos(ab) * rb.r, Math.sin(ab) * rb.r, 0, rb.ax + ringRot[bn % 3][0], rb.ay + ringRot[bn % 3][1], 0);
        if (!proj(qx, qy, qz)) { continue; }
        var dir = Math.atan2(sy - midY, sx - midX), pts2 = [[midX + Math.cos(dir) * R * 0.95, midY + Math.sin(dir) * R * 0.95], [sx, sy]];
        for (var lvl = 0, off = R * 0.28; lvl < 5; lvl++, off *= 0.55) {
          var np2 = [pts2[0]];
          for (var q2 = 1; q2 < pts2.length; q2++) {
            var A = pts2[q2 - 1], B = pts2[q2];
            np2.push([(A[0] + B[0]) / 2 + (Math.random() - 0.5) * off, (A[1] + B[1]) / 2 + (Math.random() - 0.5) * off], B);
          }
          pts2 = np2;
        }
        bolts.push({ pts: pts2, a: 0.6 + Math.random() * 0.4 });
      }
    }
    for (var bi = 0; bi < bolts.length; bi++) {
      var bo = bolts[bi], layers = [[7, 0.08, 0], [3, 0.3, 0.4], [1.2, 1, 0.95]];
      for (var ly = 0; ly < 3; ly++) {
        ctx.strokeStyle = rgba(col, layers[ly][1] * bo.a, layers[ly][2]); ctx.lineWidth = layers[ly][0] * sc * 1.2;
        ctx.beginPath(); ctx.moveTo(bo.pts[0][0], bo.pts[0][1]);
        for (var bp = 1; bp < bo.pts.length; bp++) { ctx.lineTo(bo.pts[bp][0], bo.pts[bp][1]); }
        ctx.stroke();
      }
    }

    // voice ring around the edge
    if (live && optSpec > 0) {
      var vr = R * 1.9, vlen = R * 0.12;
      for (k = 0; k < 72; k++) {
        var hk = k < 36 ? k : 71 - k;
        var synth = (0.16 + 0.55 * lv) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(hk * 0.5 - timeSec * 3))) * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(hk * 0.9 - timeSec * 5 + 1.7)));
        var v = (specSmooth[hk] * specW + synth * (1 - specW)) * (0.25 + 0.75 * Math.min(1, lv * 1.5 + (stateName === 'idle' ? 0 : 0.2)));
        var aV = k / 72 * 6.2832 - 1.5708;
        ctx.strokeStyle = rgba(col, (0.15 + 0.6 * v) * optSpec, v * 0.5); ctx.lineWidth = 2 * sc * 1.3;
        ctx.beginPath(); ctx.moveTo(midX + Math.cos(aV) * vr, midY + Math.sin(aV) * vr);
        ctx.lineTo(midX + Math.cos(aV) * (vr + 2 + v * vlen), midY + Math.sin(aV) * (vr + 2 + v * vlen)); ctx.stroke();
      }
    }

    // shockwaves
    for (k = 0; k < shocks.length; k++) {
      var sw = shocks[k], ps = (timeSec - sw.t) / (0.6 + 0.5 * sw.big);
      if (ps < 0 || ps > 1) { continue; }
      var rS = R * (1 + (sw.big * 3.5 + 0.6) * (1 - Math.pow(1 - ps, 3))), fS = 1 - ps;
      ctx.strokeStyle = rgba(col, 0.12 * fS * sw.big + 0.04); ctx.lineWidth = 30 * fS * sc;
      ctx.beginPath(); ctx.arc(midX, midY, rS, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.85 * fS, 0.7); ctx.lineWidth = (1 + 3 * fS) * sc;
      ctx.beginPath(); ctx.arc(midX, midY, rS, 0, 6.2832); ctx.stroke();
    }

    // ignition flash
    var flash = 0.85 * after(ignAt, 12);
    if (flash > 0.01) {
      var fg = ctx.createRadialGradient(midX, midY, 0, midX, midY, Math.max(w, h) * 0.7);
      fg.addColorStop(0, rgba(col, flash, 0.9)); fg.addColorStop(1, rgba(col, flash * 0.4, 0.6));
      ctx.fillStyle = fg; ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  window.JarvisSphere = {
    init: function (cv) {
      if (started || !cv || typeof cv.getContext !== 'function') { return; }
      started = true;
      canvas = cv;
      ctx = canvas.getContext('2d');
      var m = mk(1, 1); trail = m[0]; tctx = m[1];
      m = mk(1, 1); bloom = m[0]; bctx = m[1];
      canvas.addEventListener('contextrestored', function () { sprKey = ''; });
      resize();
      rebuildSprites();
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(resize);
        ro.observe(canvas);
        if (canvas.parentElement) { ro.observe(canvas.parentElement); }
      } else {
        window.addEventListener('resize', resize);
      }
      document.addEventListener('visibilitychange', function () { lastNow = nowMsFn(); });
      lastNow = nowMsFn();
      window.requestAnimationFrame(frame);
    },

    /* Implosion -> ignition. Called on INITIALIZE; calling it again replays it. */
    ignite: function () {
      igniteAt = timeSec; ignited = false; sparks = []; shocks = []; beats = [];
      for (var k = 0; k < NP_MAX; k++) { pPX[k] = NaN; }
      for (k = 0; k < N_DISK; k++) { dPX[k] = NaN; }
      if (tctx) { tctx.clearRect(0, 0, trail.width, trail.height); }
    },

    /* INITIALIZE: the same surge the boot core does, so the hand-off matches */
    pulse: function () { addBeat(1.2); addShock(0.8); },

    setState: function (s) {
      if (typeof s !== 'string' || !PALETTES.hasOwnProperty(s) || s === stateName) { return; }
      stateName = s;
      target = STATES[s];
      if (s === 'thinking' && ignAt >= 0) { addShock(0.2); }
    },

    setLevel: function (v) {
      if (typeof v !== 'number' || !isFinite(v)) { return; }
      rawLevel = v < 0 ? 0 : (v > 1 ? 1 : v);
    },

    setSpectrum: function (arr) {
      if (arr === null || arr === undefined || typeof arr.length !== 'number' || arr.length === 0) { return; }
      if (ingestSpectrum(arr)) { lastSpecMs = nowMsFn(); }
    },

    setAccent: function (hex) {
      if (hex === null || hex === undefined) { accentOn = false; return; }
      var c = parseHex(hex);
      if (!c) { return; }
      accent = c;
      accentOn = true;
    },

    setOptions: function (opts) {
      if (!opts || typeof opts !== 'object') { return; }
      function num(v, lo, hi) { v = +v; return isFinite(v) ? clamp(v, lo, hi) : null; }
      var v;
      if (opts.density !== undefined && (v = num(opts.density, 0.05, 1)) !== null) { optDensity = v; np = Math.max(400, Math.round(NP_MAX * v)); }
      if (opts.intensity !== undefined && (v = num(opts.intensity, 0, 2)) !== null) { optIntensity = v; }
      if (opts.motion !== undefined && (v = num(opts.motion, 0, 2)) !== null) { optMotion = v; }
      if (opts.web !== undefined && (v = num(opts.web, 0, 2)) !== null) { optWeb = v; }
      if (opts.spec !== undefined && (v = num(opts.spec, 0, 2)) !== null) { optSpec = v; }
      if (opts.hud !== undefined && (v = num(opts.hud, 0, 2)) !== null) { optHud = v; }
      if (opts.pulses !== undefined) { optPulses = opts.pulses ? 1 : 0; }
    }
  };
})();
