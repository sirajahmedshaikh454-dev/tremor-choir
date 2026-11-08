import { normalize, project, voiceFor, replayAt, fibSphere, VOWELS } from './lib.js';

const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson';
const REPLAY_SECONDS = 60;
const MAX_VOICES = 48;
const $ = id => document.getElementById(id);
const cv = $('globe'), g = cv.getContext('2d');
const DEPTH_COLORS = ['#ff4a1c', '#e6c75a', '#4fb3a9'];
const depthClass = d => d < 70 ? 0 : d < 300 ? 1 : 2;
const fmtDate = t => new Date(t).toLocaleString('en-GB', { timeZone: 'UTC', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).toUpperCase() + ' UTC';

// ---------- data ----------
let quakes = [], t0 = 0, t1 = 1;
async function load() {
  try {
    const r = await fetch(FEED, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    quakes = normalize(await r.json());
    if (quakes.length < 10) throw new Error('empty feed');
    $('src').textContent = 'live · USGS, past 30 days, M2.5+';
  } catch {
    quakes = normalize(await (await fetch('sample.json')).json());
    $('src').textContent = 'offline · archived USGS sample';
  }
  t0 = quakes[0].time; t1 = quakes.at(-1).time;
  quakes.forEach(q => { q.at = replayAt(q.time, t0, t1, REPLAY_SECONDS); q.lit = 0; q.cls = depthClass(q.depth); });
  $('total').textContent = quakes.length;
  $('clock').textContent = fmtDate(t0);
}

// ---------- audio ----------
let ctx, master, active = 0;
function initAudio() {
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 6;
  const rev = ctx.createConvolver(); rev.buffer = impulse(4);
  wet = ctx.createGain(); wet.gain.value = abyss ? 0.95 : 0.55;
  master.connect(comp); master.connect(rev).connect(wet).connect(comp);
  analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
  comp.connect(analyser).connect(ctx.destination);
  wave = new Float32Array(analyser.fftSize);
}
let analyser, wave, wet, abyss = false;
function impulse(sec) {
  const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
  return b;
}
// One voice: a buzzing sawtooth "vocal fold" shaped by three vowel formants.
function sing(q, scale = 1) {
  if (!ctx || active >= MAX_VOICES || (abyss && q.depth < 300)) return;
  active++;
  const v = voiceFor(q), t = ctx.currentTime;
  if (abyss) { v.freq /= 2; v.dur *= 1.8; v.gain = Math.min(v.gain * 1.6, 0.6); }
  const end = t + v.dur;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = v.freq; osc.detune.value = (Math.random() - 0.5) * 16;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 4.2 + Math.random() * 1.6; lg.gain.value = v.freq * 0.009;
  lfo.connect(lg).connect(osc.frequency);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(v.gain * scale, t + Math.min(0.15, v.dur * 0.3));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  VOWELS[v.vowel].forEach((f, i) => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6 + i * 3;
    const fg = ctx.createGain(); fg.gain.value = [2.2, 1.2, 0.6][i];
    osc.connect(bp).connect(fg).connect(env);
  });
  const pan = ctx.createStereoPanner(); pan.pan.value = v.pan;
  env.connect(pan).connect(master);
  osc.start(t); lfo.start(t); osc.stop(end + 0.05); lfo.stop(end + 0.05);
  osc.onended = () => { active--; pan.disconnect(); };
}

// The ground itself: a falling sub-bass thud plus a gravelly noise rumble, for M6+.
function boom(q) {
  if (!ctx) return;
  const t = ctx.currentTime, len = 2.5 + (q.mag - 6) * 1.5;
  const sub = ctx.createOscillator(), sg = ctx.createGain();
  sub.frequency.setValueAtTime(64, t); sub.frequency.exponentialRampToValueAtTime(26, t + len);
  sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.8, t + 0.04); sg.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const noise = ctx.createBufferSource(); noise.buffer = impulse(len);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
  const ng = ctx.createGain(); ng.gain.value = 0.9;
  sub.connect(sg).connect(master); noise.connect(lp).connect(ng).connect(master);
  sub.start(t); sub.stop(t + len); noise.start(t);
  shocks.push({ q, born: performance.now(), len });
}
const shocks = [];
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- replay ----------
let paused = false, playing = false, elapsed = 0, next = 0, sung = 0, rot = -2.2, tilt = 0.38, last = performance.now();
const ghosts = fibSphere(2400);

function tick(dt) {
  if (!playing) return;
  elapsed += dt;
  while (next < quakes.length && quakes[next].at <= elapsed) {
    const q = quakes[next++];
    q.lit = performance.now(); sung++;
    sing(q);
    logLine(q);
    if (q.mag >= 5.5) pendingMark = 'M' + q.mag.toFixed(1);
    if (q.mag >= 6) boom(q);
  }
  $('count').textContent = sung;
  $('clock').textContent = fmtDate(t0 + Math.min(elapsed / REPLAY_SECONDS, 1) * (t1 - t0));
  if (elapsed > REPLAY_SECONDS + 3) finish(); // every replay quake has at <= REPLAY_SECONDS; live ones are Infinity
}

const log = $('log');
let lastLog = 0;
function logLine(q, force = false) {
  const now = performance.now();
  if (!force && q.mag < 4.5 && now - lastLog < 220) return; // keep it readable; big ones always print
  lastLog = now;
  const li = document.createElement('li');
  li.innerHTML = `<b style="color:${DEPTH_COLORS[q.cls]}">M${q.mag.toFixed(1)}</b> · ${Math.round(q.depth)} km · `;
  li.append(q.place || 'unnamed sea');
  log.prepend(li);
  while (log.children.length > 6) log.lastChild.remove();
  [...log.children].forEach((el, i) => el.style.opacity = 1 - i * 0.16);
}

function finish() {
  playing = false;
  $('coda').classList.add('on'); document.body.classList.add('ended');
  const go = $('go'); go.disabled = false; go.classList.remove('gone'); $('goLabel').textContent = 'Sing it again';
}

function start() {
  if (!ctx) initAudio();
  ctx.resume();
  quakes = quakes.filter(q => q.at !== Infinity); // drop quakes added by live mode
  quakes.forEach(q => q.lit = 0);
  elapsed = 0; next = 0; sung = 0; playing = true; paused = false;
  $('coda').classList.remove('on'); document.body.classList.remove('ended');
  const go = $('go'); go.classList.add('gone'); go.disabled = true; go.blur();
  trace.length = 0; lastDay = '';
}

// ---------- drawing ----------
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function draw(now) {
  let cx = W / 2, cy = (H - 130) / 2 + 10;
  const R = Math.min(W * (W < 640 ? 0.44 : 0.34), (H - 150) * 0.42);
  g.fillStyle = '#0d0c0a'; g.fillRect(0, 0, W, H);

  // shockwaves: the screen shakes and a ring rolls across the planet
  let shake = 0;
  for (let i = shocks.length - 1; i >= 0; i--) {
    const k = (now - shocks[i].born) / 1000 / shocks[i].len;
    if (k >= 1) { shocks.splice(i, 1); continue; }
    shake = Math.max(shake, (1 - k) ** 3 * (shocks[i].q.mag - 5) * 5);
  }
  if (!calm.matches && shake > 0.2) { cx += (Math.random() - 0.5) * shake; cy += (Math.random() - 0.5) * shake; }
  view = { cx, cy, R };
  for (const { q, born, len } of shocks) {
    const k = Math.max(0, (now - born) / 1000 / len), s = project(q.lon, q.lat, rot, tilt);
    g.strokeStyle = '#ff4a1c'; g.globalAlpha = (1 - k) * 0.7; g.lineWidth = 2 * (1 - k) + 0.5;
    g.beginPath(); g.arc(cx + s.x * R, cy - s.y * R, k * R * 1.6, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 1;

  // faint limb
  g.strokeStyle = 'rgba(236,228,210,0.10)'; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();

  for (const p of ghosts) {
    const s = project(p.lon, p.lat, rot, tilt);
    if (s.z > 0) { g.fillStyle = `rgba(236,228,210,${0.08 + s.z * 0.2})`; g.fillRect(cx + s.x * R, cy - s.y * R, 1.2, 1.2); }
  }

  for (const q of quakes) {
    if (!q.lit) continue;
    const s = project(q.lon, q.lat, rot, tilt);
    const age = Math.max(0, (now - q.lit) / 1000), front = s.z > 0;
    const x = cx + s.x * R, y = cy - s.y * R, col = DEPTH_COLORS[q.cls];
    const size = 0.8 + Math.max(q.mag - 2, 0) * 0.7;
    g.globalAlpha = (front ? 0.85 : 0.06) * (abyss && q.cls < 2 ? 0.12 : 1);
    g.fillStyle = col;
    g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill();
    const life = 0.6 + q.mag * 0.5;
    if (age < life && front) {
      g.globalAlpha = (1 - age / life) * 0.9;
      g.strokeStyle = col; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, size + age * (6 + q.mag * 5), 0, Math.PI * 2); g.stroke();
    }
  }
  g.globalAlpha = 1;
  drawDrum();
}

// ---------- seismograph drum: the choir's own waveform, scrolling like paper ----------
const trace = [];
let lastDay = '';
function sampleTrace() {
  if (!analyser || !(playing || live)) return;
  analyser.getFloatTimeDomainData(wave);
  let lo = 0, hi = 0;
  for (const s of wave) { if (s < lo) lo = s; if (s > hi) hi = s; }
  const day = fmtDate(t0 + Math.min(elapsed / REPLAY_SECONDS, 1) * (t1 - t0)).slice(0, 6);
  trace.push({ lo, hi, day: playing && day !== lastDay ? day : null, mark: pendingMark });
  lastDay = day; pendingMark = null;
  if (trace.length > 4000) trace.splice(0, trace.length - 4000);
}
let pendingMark = null;

function drawDrum() {
  const top = H - 112, h = 72, mid = top + h / 2, x0 = 16, x1 = W - 16, px = 1.5;
  g.strokeStyle = 'rgba(236,228,210,0.08)'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(x0, top + i * h / 4 + .5); g.lineTo(x1, top + i * h / 4 + .5); g.stroke(); }
  g.font = '10px "IBM Plex Mono", monospace';
  const n = Math.min(trace.length, Math.floor((x1 - x0) / px));
  g.strokeStyle = '#ece4d2'; g.beginPath();
  for (let i = 0; i < n; i++) {
    const s = trace[trace.length - 1 - i], x = x1 - i * px;
    g.moveTo(x, mid - Math.min(s.hi * 1.15, 1) * h / 2);
    g.lineTo(x, mid - Math.max(s.lo * 1.15, -1) * h / 2);
  }
  g.stroke();
  let labelX = Infinity; // drawing right-to-left; skip labels that would collide
  for (let i = 0; i < n; i++) {
    const s = trace[trace.length - 1 - i], x = x1 - i * px;
    if (s.mark && labelX - x < 42) { g.fillStyle = '#ff4a1c'; g.fillRect(x, top - 4, 1, h + 4); continue; }
    if (s.mark) labelX = x;
    if (s.day) { g.fillStyle = 'rgba(236,228,210,0.35)'; g.fillRect(x, top + h + 4, 1, 6); g.fillText(s.day, x + 4, top + h + 14); }
    if (s.mark) { g.fillStyle = '#ff4a1c'; g.fillRect(x, top - 8, 1, h + 8); g.fillText(s.mark, x + 4, top - 2); }
  }
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (!drag && !paused) rot += dt * 0.06;
  tick(dt);
  sampleTrace();
  draw(now);
  requestAnimationFrame(frame);
}

// ---------- live mode: the planet, in real time ----------
const LIVE_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
let live = null;
const seen = new Set();
async function pollLive(first) {
  try {
    const r = await fetch(LIVE_FEED, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const feats = (await r.json()).features ?? [];
    const fresh = feats.filter(f => f.id && !seen.has(f.id));
    fresh.forEach(f => seen.add(f.id));
    // first poll: sing only the latest quake so you hear something right away
    const toSing = normalize({ features: first === true ? fresh.slice(0, 1) : fresh });
    toSing.forEach((q, i) => setTimeout(() => {
      if (!live) return;
      q.cls = depthClass(q.depth); q.at = Infinity; q.lit = performance.now();
      quakes.push(q); sing(q, 1.3); if (q.mag >= 6) boom(q); logLine(q, true);
      pendingMark = 'M' + q.mag.toFixed(1);
    }, i * 900));
    if (live) $('src').textContent = `LIVE · ${feats.length} quakes this hour · checks every minute`;
  } catch {
    if (live) $('src').textContent = 'LIVE · USGS unreachable, retrying…';
  }
}
function toggleLive() {
  $('liveBtn').setAttribute('aria-pressed', String(!live));
  if (live) { clearInterval(live); live = null; $('src').textContent = 'live mode off · press R to replay'; return; }
  if (!ctx) initAudio();
  ctx.resume();
  playing = false; paused = false;
  const go = $('go'); go.classList.add('gone'); go.disabled = true; go.blur();
  $('coda').classList.remove('on');
  $('clock').textContent = 'NOW';
  live = setInterval(pollLive, 60_000);
  pollLive(true);
}

// ---------- touch the planet ----------
let view = { cx: 0, cy: 0, R: 1 }, drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  rot += dx * 0.006; tilt = Math.max(-1.3, Math.min(1.3, tilt + dy * 0.005));
});
cv.addEventListener('pointerup', e => {
  if (drag && drag.moved < 6) pluck(e.clientX, e.clientY);
  drag = null;
});
cv.addEventListener('pointercancel', () => { drag = null; });

// Tap a lit quake to hear it again.
function pluck(px, py) {
  let best = null, bd = 18 * 18;
  for (const q of quakes) {
    if (!q.lit) continue;
    const s = project(q.lon, q.lat, rot, tilt);
    if (s.z <= 0) continue;
    const d = (view.cx + s.x * view.R - px) ** 2 + (view.cy - s.y * view.R - py) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  if (!best) return;
  if (!ctx) initAudio();
  ctx.resume();
  best.lit = performance.now();
  sing(best, 1.4);
  if (best.mag >= 6) boom(best);
  lastLog = 0; logLine(best, true);
}

// ???
let typed = '';
function toggleAbyss() {
  abyss = !abyss;
  document.body.classList.toggle('abyss', abyss);
  document.querySelector('h1 em').textContent = abyss ? 'Abyss' : 'Choir';
  if (wet) wet.gain.setTargetAtTime(abyss ? 0.95 : 0.55, ctx.currentTime, 0.5);
}

addEventListener('keydown', e => {
  if (e.key.length === 1) { typed = (typed + e.key.toLowerCase()).slice(-5); if (typed === 'abyss') { typed = ''; toggleAbyss(); } }
  if (e.target.closest?.('button') && e.code === 'Space') return; // let the button handle its own Space
  if (e.code === 'Space' && quakes.length && !live && $('go').classList.contains('gone')) { playing = !playing; paused = !playing; if (playing) ctx.resume(); e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') { if (quakes.length) { if (live) toggleLive(); start(); } }
  else if (e.key === 'l' || e.key === 'L') { if (quakes.length) toggleLive(); }
  else if (e.key === 'ArrowLeft') rot -= 0.25;
  else if (e.key === 'ArrowRight') rot += 0.25;
  else if (e.key === 'ArrowUp') tilt = Math.max(-1.3, tilt - 0.15);
  else if (e.key === 'ArrowDown') tilt = Math.min(1.3, tilt + 0.15);
});

$('liveBtn').addEventListener('click', () => { if (quakes.length) toggleLive(); });
addEventListener('resize', resize);
$('go').addEventListener('click', start);
resize();
requestAnimationFrame(frame);
load().then(() => {
  $('go').disabled = false;
  $('goLabel').textContent = 'Listen';
}, () => {
  $('goLabel').textContent = 'The planet is silent';
  $('src').textContent = 'could not load USGS feed or sample.json';
});
