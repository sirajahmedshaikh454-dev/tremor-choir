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
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  master.connect(comp); master.connect(rev).connect(wet).connect(comp);
  analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
  comp.connect(analyser).connect(ctx.destination);
  wave = new Float32Array(analyser.fftSize);
}
let analyser, wave;
function impulse(sec) {
  const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
  return b;
}
// One voice: a buzzing sawtooth "vocal fold" shaped by three vowel formants.
function sing(q, scale = 1) {
  if (!ctx || active >= MAX_VOICES) return;
  active++;
  const v = voiceFor(q), t = ctx.currentTime, end = t + v.dur;
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

// ---------- replay ----------
let playing = false, elapsed = 0, next = 0, sung = 0, rot = -2.2, tilt = 0.38, last = performance.now();
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
  }
  $('count').textContent = sung;
  $('clock').textContent = fmtDate(t0 + Math.min(elapsed / REPLAY_SECONDS, 1) * (t1 - t0));
  if (next >= quakes.length && elapsed > REPLAY_SECONDS + 3) finish();
}

const log = $('log');
let lastLog = 0;
function logLine(q) {
  const now = performance.now();
  if (q.mag < 4.5 && now - lastLog < 220) return; // keep it readable; big ones always print
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
  $('coda').classList.add('on');
  const go = $('go'); go.classList.remove('gone'); $('goLabel').textContent = 'Sing it again';
}

function start() {
  if (!ctx) initAudio();
  ctx.resume();
  quakes.forEach(q => q.lit = 0);
  elapsed = 0; next = 0; sung = 0; playing = true;
  $('coda').classList.remove('on');
  $('go').classList.add('gone');
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
  const cx = W / 2, cy = (H - 130) / 2 + 10, R = Math.min(W * (W < 640 ? 0.44 : 0.34), (H - 150) * 0.42);
  g.fillStyle = '#0d0c0a'; g.fillRect(0, 0, W, H);

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
    const age = (now - q.lit) / 1000, front = s.z > 0;
    const x = cx + s.x * R, y = cy - s.y * R, col = DEPTH_COLORS[q.cls];
    const size = 0.8 + Math.max(q.mag - 2, 0) * 0.7;
    g.globalAlpha = front ? 0.85 : 0.06;
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
  if (!analyser || !playing) return;
  analyser.getFloatTimeDomainData(wave);
  let lo = 0, hi = 0;
  for (const s of wave) { if (s < lo) lo = s; if (s > hi) hi = s; }
  const day = fmtDate(t0 + Math.min(elapsed / REPLAY_SECONDS, 1) * (t1 - t0)).slice(0, 6);
  trace.push({ lo, hi, day: day !== lastDay ? day : null, mark: pendingMark });
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
  rot += dt * 0.06;
  tick(dt);
  sampleTrace();
  draw(now);
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
$('go').addEventListener('click', start);
resize();
requestAnimationFrame(frame);
load().then(() => {
  $('go').disabled = false;
  $('goLabel').textContent = 'Listen';
});
