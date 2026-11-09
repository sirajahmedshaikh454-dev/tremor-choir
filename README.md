# Tremor Choir

> Thirty days of a restless planet, sung in sixty seconds.

Tremor Choir replays the last 30 days of real earthquakes (around 2,000 events from the USGS live feed) as a **choir**, compressed into one minute, on a slowly turning dot globe. Every quake becomes a synthesized human-like voice. No coastlines or map are drawn, yet as the voices pile up, **the Pacific Ring of Fire, the Andes and the mid-ocean ridges trace themselves**: the outline of the tectonic plates appears out of sound.

![Replay in progress: the western Pacific arc drawing itself](docs/ring-of-fire.jpg)

---

## Contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [Controls](#controls)
- [How it works](#how-it-works)
- [Data sources](#data-sources)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Security & privacy](#security--privacy)
- [Accessibility](#accessibility)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Skills & methodology](#skills--methodology)
- [License](#license)

---

## Highlights

| Feature | What you experience |
|---|---|
| **60-second replay** | 30 days of M2.5+ quakes play in order, each at its real relative time. |
| **Voice per quake** | Depth sets the pitch, magnitude sets the loudness, length and vowel, and longitude sets the stereo position. |
| **Ground rumble** | M6+ quakes add a falling sub-bass thud, a shockwave ring across the globe and a short screen shake. |
| **Seismograph drum** | A scrolling strip draws the choir's own audio waveform, with day ticks and red marks for every M5.5+. |
| **Live mode** | Checks USGS every minute and sings each new quake as it happens. |
| **Touch the planet** | Drag to spin the globe; tap any lit quake to hear it again. |
| **Offline fallback** | If USGS can't be reached, a bundled 2,068-quake snapshot plays instead, and the status line says so. |

## Quick start

**Requirements:** Node.js 18 or newer and a modern browser (Chrome, Edge or Firefox). No packages to install.

```bash
git clone https://github.com/sirajahmedshaikh454-dev/tremor-choir.git
cd tremor-choir
npm start
```

Open **http://localhost:5173** and press **Listen**. Headphones are recommended: the stereo position carries information.

## Controls

| Input | Action |
|---|---|
| **Listen** / **Sing it again** | Start or restart the 60-second replay |
| `Space` | Pause / resume (the globe freezes so you can tap dots) |
| `R` | Restart the replay |
| `L` or the **LIVE** chip | Toggle live mode (real-time quakes) |
| Drag | Rotate and tilt the globe |
| Click / tap a dot | Replay that quake's voice |
| Arrow keys | Nudge the globe |

## How it works

### Mapping data to sound

| Quake property | Sound parameter | Why |
|---|---|---|
| Depth (0–700 km) | Pitch across 4 octaves of D dorian, deep = low | Deep-subduction quakes become a bass section; the scale keeps any overlap musical. |
| Magnitude | Loudness (cubic curve), note length, vowel (*ee → eh → ah → oh → oo*) | Small quakes whisper; big ones open up and hold. |
| Longitude | Stereo pan (−180° = left, +180° = right) | You hear where on Earth it happened. |
| M ≥ 6 | Sub-bass + filtered noise rumble | The ground itself answers. |

### Synthesis

Each voice is a **formant synthesizer**, the method used for speech before recorded samples: a sawtooth oscillator (standing in for the vocal folds) with gentle vibrato, fed through three parallel band-pass filters tuned to real vowel formant frequencies. All voices go through a dynamics compressor and a convolution reverb whose impulse response is generated at runtime from decaying noise. At most 48 voices play at once, so the audio graph stays bounded.

### Visuals

- **Orthographic projection** on a 2D canvas, using hand-written math (`lib.js`, no 3D library).
- A 2,400-point Fibonacci sphere forms the ghost globe.
- Quakes are coloured by seismology's depth classes: **shallow < 70 km** (vermilion), **intermediate** (sulfur), **deep > 300 km** (teal).
- The seismograph drum samples the analyser node's time-domain peaks every frame.

### Architecture

```
USGS GeoJSON ──► lib.normalize() ──► sorted quakes ──► replay clock (rAF)
                                                         │
                         ┌───────────────────────────────┼────────────────────┐
                         ▼                               ▼                    ▼
                  sing() / boom()                  draw globe            log + HUD
                  Web Audio graph ─► analyser ─► seismograph drum
```

## Data sources

| Mode | Endpoint | Notes |
|---|---|---|
| Replay | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson` | Free, no API key, CORS-enabled |
| Live | `.../summary/all_hour.geojson` | Checked every 60 s |
| Offline | `sample.json` | Compact snapshot taken 8 Nov 2026: `[lon, lat, depth, mag, time, place]` rows |

Earthquake data courtesy of the U.S. Geological Survey.

## Project structure

```
tremor-choir/
├── index.html     # page shell, HUD, legend
├── style.css      # art direction: soot, bone paper, vermilion, sulfur, teal
├── app.js         # data loading, audio graph, replay loop, drawing, input, live mode
├── lib.js         # pure functions: normalize, project, pitch/vowel/voice mapping, fibSphere
├── server.js      # zero-dependency static server (localhost only)
├── sample.json    # offline fallback data
├── test.js        # node:test checks for lib.js
└── docs/          # screenshots
```

## Testing

```bash
npm test
```

The tests cover:

- **`normalize`**: GeoJSON and compact input, dropping invalid rows (including the `null` magnitude case, since `+null === 0` would otherwise invent a magnitude-0 quake), and sorting by time.
- **`project`**: the front and back hemispheres.
- **`pitchFor` / `voiceFor`**: deeper quakes always sing lower, and gain, duration and pan stay within safe ranges.
- **Replay timing and sphere generation.**

Manual browser checks covered a full 60-second replay (2,069/2,069 voices, then the closing caption), pause and resume, tap-to-replay, live mode, the easter egg, and phone width (375 px, no horizontal scroll), all with zero console errors.

## Security & privacy

- The server binds to **127.0.0.1** only.
- It refuses path traversal, dotfiles (such as `.git`) and unknown file types.
- Malformed URLs return `400` instead of crashing the process.
- Responses include `X-Content-Type-Options: nosniff`.
- Place names from the feed go into the page as **text nodes**, never as HTML.
- No accounts, cookies, analytics or personal data. The only outbound requests are to USGS and Google Fonts.

## Accessibility

- The start button and live chip are real `<button>` elements with visible focus rings and `aria-pressed` state.
- Key controls work from the keyboard.
- `prefers-reduced-motion` turns off the screen shake and breathing animations.
- The colour legend pairs each colour with a text label.

## Known limitations

- Browsers pause `requestAnimationFrame` in hidden tabs, so the replay pauses too.
- The audio mix was tuned by numbers, not by ear across many speaker types.
- Up to 48 voices play at once; during dense swarms, quieter voices are skipped.
- Not tested in Safari or on a physical touch device.

## Roadmap

- [ ] Hum into the microphone to "find" the quake that matches your pitch.
- [ ] Volcanoes and tsunami buoys as extra sections of the orchestra.
- [ ] A "your birthday" mode that sings every quake from the day you were born.

## Skills & methodology

**How it was built**

1. **Research → pitch → commit.** Three concepts were pitched; the boldest that could run locally was chosen (live data + audio + emergent visual).
2. **Floor first, then ceiling.** A minimal end-to-end version (data → voices → globe) was built, tested and committed before any extras. Each layer after that (seismograph drum → ground rumble and interaction → live mode → easter egg) was added, run in a real browser and committed on its own.
3. **One commit per change**, pushed straight away: 8 commits, each building or fixing one thing.
4. **Tests for risky logic only.** The pure functions live in `lib.js` so they can be tested without a browser. A failing test caught the `null`-magnitude bug before release.
5. **Browser verification.** The full replay was run in the in-app browser at desktop and phone widths, checking console errors after every layer.
6. **Review passes.** A manual security review of the server found that a malformed URL crashed the process; it was fixed and re-probed with traversal, dotfile and bad-encoding requests.

**Bugs found and fixed during the build:** a negative canvas radius (the rAF timestamp can be slightly earlier than `performance.now()`); `Space` re-clicking a hidden-but-focused button; the replay never finishing after live mode; the closing caption overlapping the HUD on narrow screens.

**Tools and skills used:** Claude Code (Opus) with the in-app browser for verification, Web Audio API, Canvas 2D, Node's built-in `node:test`, and the USGS GeoJSON feeds. The *ponytail* "smallest complete change" discipline kept it dependency-free.

## License

MIT. Earthquake data: USGS, public domain.

---

<details>
<summary>Spoiler: the easter egg</summary>

While it's playing, type **abyss**. The title becomes *Tremor Abyss*, every quake shallower than 300 km goes silent and dark, and only the deep-subduction quakes sing, an octave lower in a long, drowned reverb. These are slabs of old ocean floor sinking hundreds of kilometres into the mantle. Type it again to come back up.

</details>
