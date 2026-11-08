// Pure helpers: no DOM, no audio. Tested by test.js.

const num = v => (v === null || v === '' || v === undefined ? NaN : +v);

// USGS GeoJSON or our compact [lon,lat,depth,mag,time,place] rows -> sorted quake objects.
export function normalize(data) {
  const rows = Array.isArray(data)
    ? data
    : (data?.features ?? []).map(f => [...(f.geometry?.coordinates ?? []), f.properties?.mag, f.properties?.time, f.properties?.place]);
  return rows
    // null must stay invalid (+null === 0 would invent a magnitude-0 quake)
    .map(([lon, lat, depth, mag, time, place]) => ({ lon: num(lon), lat: num(lat), depth: Math.max(0, num(depth) || 0), mag: num(mag), time: num(time), place: String(place ?? '') }))
    .filter(q => [q.lon, q.lat, q.mag, q.time].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

// Orthographic projection onto a unit sphere rotated by (rot, tilt) radians. z > 0 means facing us.
export function project(lon, lat, rot, tilt) {
  const l = lon * Math.PI / 180 + rot, p = lat * Math.PI / 180;
  const x = Math.cos(p) * Math.sin(l);
  const y0 = Math.sin(p), z0 = Math.cos(p) * Math.cos(l);
  return { x, y: y0 * Math.cos(tilt) - z0 * Math.sin(tilt), z: y0 * Math.sin(tilt) + z0 * Math.cos(tilt) };
}

// D dorian across 4 octaves: deep quakes sing low, shallow ones high.
const SCALE = [0, 2, 3, 5, 7, 9, 10];
export function pitchFor(depthKm) {
  const t = 1 - Math.min(Math.max(depthKm, 0), 700) / 700; // 1 = surface
  const step = Math.round(Math.pow(t, 1.6) * 27);           // shallow quakes dominate; curve spreads them
  const midi = 38 + Math.floor(step / 7) * 12 + SCALE[step % 7];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Vowel formants (Hz) — small quakes whisper "ee", big ones open to "ah"/"oh".
export const VOWELS = { i: [270, 2290, 3010], e: [530, 1840, 2480], a: [730, 1090, 2440], o: [570, 840, 2410], u: [300, 870, 2240] };
export function vowelFor(mag) { return mag < 3 ? 'i' : mag < 4 ? 'e' : mag < 5 ? 'a' : mag < 6 ? 'o' : 'u'; }

export function voiceFor(q) {
  const m = Math.max(q.mag, 0);
  return {
    freq: pitchFor(q.depth),
    vowel: vowelFor(m),
    gain: Math.min(0.02 + Math.pow(m / 8, 3) * 0.9, 0.6),
    dur: Math.min(0.35 + Math.pow(m, 2) * 0.06, 6),
    pan: Math.max(-1, Math.min(1, q.lon / 180)),
  };
}

// Map a quake's real time onto replay seconds.
export function replayAt(time, t0, t1, seconds) { return t1 > t0 ? (time - t0) / (t1 - t0) * seconds : 0; }

// Evenly spread points on a sphere (for the ghost globe).
export function fibSphere(n) {
  const pts = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
    pts.push({ lat: Math.asin(y) * 180 / Math.PI, lon: (Math.atan2(Math.sin(th) * r, Math.cos(th) * r) * 180 / Math.PI) });
  }
  return pts;
}
