import { createRecordedMusic } from './recordedMusic';
// The city's sound engine: local CC0 recordings plus procedural ambience and fallback music. `createEngine(ctx)` builds the master chain and the layers; the layers only start
// working when their level (from lib/game/soundZones.js) is above silence, and stop again when it falls, so a quiet part of the map costs almost nothing.
//   engine.update(mix, extras, now)  sets the level of every layer from mixZones() (extras: { birds, crickets, hour })
//   engine.tick(now)                 schedules the notes and one-off sounds a little ahead of time (call about every 100 ms)
//   engine.close()                   stops it
// What each layer plays (the notes) is in lib/game/musicRules.js.
import { ARCADE, JAZZ, MUZAK, WALTZ, arcadeStep, jazzStep, jetPass, keyboardBurst, marketBell, midiHz, mooParams, moodFor, MOODS, musicStep, muzakStep, nextDelay, stepSeconds, waltzStep } from '@/lib/game/musicRules';
import { birdCall, cricketBurst, nextCallDelay } from '@/lib/game/soundscape';

const AHEAD = 0.35; // seconds scheduled ahead of the clock

function noiseBuffer(ctx, seconds, kind) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = kind === 'brown' ? (last + 0.02 * white) / 1.02 : white;
    data[i] = kind === 'brown' ? last * 3.5 : white;
  }
  return buffer;
}

export function createEngine(ctx, { rand = Math.random } = {}) {
  // ---- the chain: layers -> master -> a tone filter (muffles indoors) -> a compressor (never clips) -> out
  const master = ctx.createGain();
  master.gain.value = 0;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 16000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 5;
  master.connect(tone);
  tone.connect(comp);
  comp.connect(ctx.destination);
  const recordings = createRecordedMusic(ctx, master);
  const white = noiseBuffer(ctx, 4, 'white');
  const brown = noiseBuffer(ctx, 4, 'brown');

  // ---- voices
  const env = (g, t, a, dur, r, vol) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + r);
  };
  const voice = (out, { type = 'sine', hz, t, dur = 0.2, vol = 0.3, a = 0.005, r = 0.08, lp = 0, detune = 0, glideTo = 0 }) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    env(g, t, a, dur, r, vol);
    let node = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + r + 0.05);
  };
  const hit = (out, { t, dur = 0.05, vol = 0.3, type = 'highpass', freq = 5000, q = 0.7, buffer = white }) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loopStart = rand() * 2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, 0.002, dur, 0.03, vol);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, rand() * 2);
    s.stop(t + dur + 0.08);
  };

  // ---- a layer: a gain node on the master, with a way to be switched on and off
  const layers = {};
  const makeLayer = (name, build) => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const L = { name, gain, level: 0, on: false, nodes: [], next: 0, step: 0, timers: {} };
    L.build = () => build(L);
    layers[name] = L;
    return L;
  };
  // looped noise through a filter, with an optional slow wobble in its level
  const noiseLoop = (L, { buffer = white, type = 'lowpass', freq = 500, q = 0.7, gain = 1, wobble = 0, wobbleDepth = 0.4 }) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(L.gain);
    src.start(0, rand() * 2);
    L.nodes.push(src);
    if (wobble) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = wobble;
      const depth = ctx.createGain();
      depth.gain.value = gain * wobbleDepth;
      lfo.connect(depth);
      depth.connect(g.gain);
      lfo.start();
      L.nodes.push(lfo);
    }
    return { src, f, g };
  };

  // the steady sounds
  makeLayer('hum', (L) => noiseLoop(L, { buffer: brown, type: 'lowpass', freq: 260, q: 0.7, gain: 1 }));
  makeLayer('street', (L) => {
    const n = noiseLoop(L, { type: 'bandpass', freq: 520, q: 0.5, gain: 1 });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const depth = ctx.createGain();
    depth.gain.value = 180;
    lfo.connect(depth);
    depth.connect(n.f.frequency);
    lfo.start();
    L.nodes.push(lfo);
  });
  makeLayer('water', (L) => noiseLoop(L, { type: 'bandpass', freq: 1400, q: 0.4, gain: 1, wobble: 0.3, wobbleDepth: 0.3 }));
  makeLayer('fountain', (L) => noiseLoop(L, { type: 'bandpass', freq: 3200, q: 0.5, gain: 1, wobble: 0.45, wobbleDepth: 0.15 }));
  makeLayer('wind', (L) => noiseLoop(L, { type: 'bandpass', freq: 380, q: 0.9, gain: 1, wobble: 0.09, wobbleDepth: 0.7 }));
  makeLayer('crowd', (L) => {
    noiseLoop(L, { type: 'bandpass', freq: 800, q: 0.6, gain: 1, wobble: 0.7, wobbleDepth: 0.5 });
    noiseLoop(L, { type: 'bandpass', freq: 1500, q: 0.7, gain: 0.7, wobble: 1.9, wobbleDepth: 0.5 });
  });
  makeLayer('hvac', (L) => noiseLoop(L, { buffer: brown, type: 'lowpass', freq: 180, q: 0.6, gain: 1 }));
  makeLayer('rumble', (L) => noiseLoop(L, { buffer: brown, type: 'lowpass', freq: 120, q: 0.6, gain: 1, wobble: 0.2, wobbleDepth: 0.5 }));

  // the music and the played layers, each on a bus of its own
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.36;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 1800;
  delay.connect(dlp);
  dlp.connect(feedback);
  feedback.connect(delay);
  dlp.connect(wet);
  const music = makeLayer('music', () => {});
  music.gain.connect(delay);
  wet.connect(master);
  const arcade = makeLayer('arcade', () => {});
  const jazz = makeLayer('jazz', () => {});
  const funfair = makeLayer('funfair', () => {});
  const mall = makeLayer('mall', () => {});

  // the layers other layers drive: each zone is some steady layers and some played ones, with a share of the zone's level
  const ZONE_LAYERS = {
    arcade: [['arcade', 1]],
    jazz: [['jazz', 1]],
    office: [['hvac', 0.7]],
    market: [['crowd', 0.55]],
    park: [['fountain', 0.4]],
    water: [['water', 0.8]],
    mall: [['mall', 1], ['crowd', 0.35]],
    airport: [['rumble', 0.7]],
    funfair: [['funfair', 1], ['crowd', 0.45], ['rumble', 0.25]],
    farm: [['wind', 0.7]],
  };
  const GAIN = { music: 0.55, arcade: 0.2, jazz: 0.42, funfair: 0.3, mall: 0.3, hum: 0.5, street: 0.2, water: 0.3, fountain: 0.22, wind: 0.22, crowd: 0.2, hvac: 0.3, rumble: 0.3 };

  const build = (L) => {
    if (L.on) return;
    L.on = true;
    L.nodes = [];
    L.build();
  };
  const stop = (L) => {
    if (!L.on) return;
    L.on = false;
    for (const n of L.nodes) {
      try {
        n.stop?.();
      } catch {
        /* already stopped */
      }
    }
    L.nodes = [];
    L.next = 0;
    L.step = 0;
  };

  // ---- the played layers: each has a step length and plays its notes through a function
  const swing = (step, base) => (step % 2 === 1 ? base * 0.12 : 0);
  const PLAY = {
    music: {
      dur: () => stepSeconds(MOODS[state.mood].bpm),
      play: (t, step) => {
        const mood = MOODS[state.mood];
        const s = musicStep(state.mood, step, rand);
        if (s.chord) {
          for (const m of s.chord) {
            for (const d of [-7, 7]) voice(music.gain, { type: 'triangle', hz: midiHz(m), t, dur: stepSeconds(mood.bpm) * 15, vol: 0.05, a: 1.6, r: 2.2, lp: 1400, detune: d });
          }
        }
        if (s.bass !== null) voice(music.gain, { type: 'sine', hz: midiHz(s.bass), t, dur: stepSeconds(mood.bpm) * 6, vol: 0.2, a: 0.02, r: 0.4 });
        for (const a of s.arp) voice(music.gain, { type: 'triangle', hz: midiHz(a.midi), t, dur: 0.15, vol: 0.13, a: 0.004, r: stepSeconds(mood.bpm) * a.dur, lp: 3200 });
      },
    },
    arcade: {
      dur: () => 60 / ARCADE.bpm / 4,
      play: (t, step, s) => {
        for (const n of arcadeStep(step, rand)) {
          const len = n.steps * s;
          if (n.wave === 'square') voice(arcade.gain, { type: 'square', hz: midiHz(n.midi), t, dur: len * 0.9, vol: n.vol * 0.5, a: 0.002, r: 0.02, lp: 3400 });
          else if (n.wave === 'noise') hit(arcade.gain, { t, dur: 0.05, vol: n.vol, type: n.vol > 0.3 ? 'lowpass' : 'highpass', freq: n.vol > 0.3 ? 220 : 7000 });
          else if (n.wave === 'coin') {
            voice(arcade.gain, { type: 'square', hz: midiHz(n.midi), t, dur: 0.07, vol: n.vol * 0.4, a: 0.001, r: 0.01, lp: 5000 });
            voice(arcade.gain, { type: 'square', hz: midiHz(n.midi + 5), t: t + 0.07, dur: 0.22, vol: n.vol * 0.4, a: 0.001, r: 0.15, lp: 5000 });
          } else if (n.wave === 'laser') voice(arcade.gain, { type: 'square', hz: n.from, t, dur: len, vol: n.vol * 0.35, a: 0.001, r: 0.03, glideTo: n.to, lp: 4000 });
        }
      },
    },
    jazz: {
      dur: () => 60 / JAZZ.bpm / 2,
      play: (t0, step, s) => {
        const t = t0 + swing(step, s);
        for (const n of jazzStep(step, rand)) {
          if (n.wave === 'bass') voice(jazz.gain, { type: 'triangle', hz: midiHz(n.midi), t, dur: s * 1.6, vol: n.vol * 0.5, a: 0.01, r: 0.25, lp: 700 });
          else if (n.wave === 'chord') for (const m of n.midi) voice(jazz.gain, { type: 'triangle', hz: midiHz(m), t, dur: s * 1.2, vol: n.vol * 0.28, a: 0.01, r: 0.35, lp: 1800 });
          else if (n.wave === 'brush') hit(jazz.gain, { t, dur: 0.09, vol: n.vol, type: 'bandpass', freq: 5200, q: 0.6 });
          else if (n.wave === 'lead') voice(jazz.gain, { type: 'sine', hz: midiHz(n.midi), t, dur: s * 0.9, vol: n.vol, a: 0.01, r: 0.3 });
        }
      },
    },
    funfair: {
      dur: () => 60 / WALTZ.bpm,
      play: (t, step, s) => {
        for (const n of waltzStep(step)) {
          const notes = Array.isArray(n.midi) ? n.midi : [n.midi];
          for (const m of notes) {
            voice(funfair.gain, { type: 'sawtooth', hz: midiHz(m), t, dur: s * 0.85, vol: n.vol * 0.28, a: 0.01, r: 0.06, lp: 1900 });
            voice(funfair.gain, { type: 'square', hz: midiHz(m) * 2, t, dur: s * 0.85, vol: n.vol * 0.1, a: 0.01, r: 0.06, lp: 2400, detune: 6 });
          }
        }
      },
    },
    mall: {
      dur: () => 60 / MUZAK.bpm / 2,
      play: (t, step) => {
        for (const n of muzakStep(step, rand)) {
          voice(mall.gain, { type: 'sine', hz: midiHz(n.midi), t, dur: 0.1, vol: n.vol * 0.4, a: 0.005, r: 0.7 });
          voice(mall.gain, { type: 'sine', hz: midiHz(n.midi) * 4, t, dur: 0.05, vol: n.vol * 0.06, a: 0.002, r: 0.4 });
        }
      },
    },
  };

  // ---- one-off sounds: each a function of its layer's level; `timers` hold when the next one is due
  const oneOffs = [
    // [layer, zone it belongs to, base delay in seconds, what it makes]
    ['office', 'office', 5, (t) => keyboardBurst(rand).forEach((dt) => hit(layers.hvac.gain, { t: t + dt, dur: 0.012, vol: 0.5, type: 'highpass', freq: 2500 + rand() * 1500 }))],
    ['market', 'market', 7, (t) => {
      const b = marketBell(rand);
      voice(layers.crowd.gain, { type: 'sine', hz: midiHz(b.midi), t, dur: 0.05, vol: 0.22, a: 0.002, r: b.dur });
    }],
    ['farm', 'farm', 14, (t) => {
      const c = mooParams(rand);
      voice(layers.wind.gain, { type: 'sawtooth', hz: c.from, t, dur: c.dur, vol: 0.35, a: 0.15, r: 0.2, glideTo: c.to, lp: 420 });
    }],
    ['airport', 'airport', 22, (t) => {
      const j = jetPass(rand);
      const s = ctx.createBufferSource();
      s.buffer = white;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.8;
      f.frequency.setValueAtTime(j.peakHz * 0.5, t);
      f.frequency.linearRampToValueAtTime(j.peakHz, t + j.dur * 0.45);
      f.frequency.linearRampToValueAtTime(j.peakHz * 0.4, t + j.dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.7, t + j.dur * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, t + j.dur);
      s.connect(f);
      f.connect(g);
      g.connect(layers.rumble.gain);
      s.start(t, rand() * 2);
      s.stop(t + j.dur + 0.1);
    }],
    ['funfair', 'funfair', 11, (t) => {
      // the coaster's rush and screams: a swell of rumble and two high glides
      voice(funfair.gain, { type: 'sine', hz: 900, t, dur: 1.1, vol: 0.12, a: 0.3, r: 0.4, glideTo: 1500 });
      voice(funfair.gain, { type: 'sine', hz: 1200, t: t + 0.2, dur: 0.9, vol: 0.09, a: 0.3, r: 0.4, glideTo: 700 });
      hit(layers.crowd.gain, { t, dur: 1.6, vol: 0.5, type: 'bandpass', freq: 1800, q: 0.5 });
    }],
    ['street', 'street', 9, (t) => {
      // now and then a horn
      voice(layers.street.gain, { type: 'square', hz: 392, t, dur: 0.22, vol: 0.08, a: 0.01, r: 0.05, lp: 1500 });
      voice(layers.street.gain, { type: 'square', hz: 494, t, dur: 0.22, vol: 0.06, a: 0.01, r: 0.05, lp: 1500 });
    }],
  ];

  const state = { mood: 'bright', levels: {}, zones: {}, birds: 0, crickets: 0, callTimers: { birds: 0, crickets: 0 } };

  // ---- update: from a mix, the level of every layer (smoothly)
  function update(mix, extras = {}, now = ctx.currentTime) {
    state.mood = moodFor(extras.sky);
    state.birds = extras.birds ?? 0;
    state.crickets = extras.crickets ?? 0;
    state.zones = { ...mix.local, street: mix.street };
    const recordedLayer = recordings.update(mix, extras);
    const want = { hum: mix.city, street: mix.street, music: mix.music };
    for (const zone of Object.keys(ZONE_LAYERS)) {
      const v = mix.local[zone] ?? 0;
      for (const [layer, share] of ZONE_LAYERS[zone]) want[layer] = Math.max(want[layer] ?? 0, v * share);
    }
    if (recordedLayer) want[recordedLayer] = 0;
    // The music switch silences local tunes as well as the city soundtrack.
    if (extras.musicOn === false) for (const key of ['music', 'arcade', 'jazz', 'mall', 'funfair']) want[key] = 0;
    for (const L of Object.values(layers)) {
      const v = want[L.name] ?? 0;
      state.levels[L.name] = v;
      if (v > 0.02 && !L.on) build(L);
      if (v > 0.02 || L.level > 0.02) L.gain.gain.setTargetAtTime(v * (GAIN[L.name] ?? 0.3), now, 0.5);
      L.level = v;
      if (v <= 0.02 && L.on && L.gain.gain.value < 0.003) stop(L);
    }
    master.gain.setTargetAtTime(mix.master * (extras.volume ?? 0.6) * 0.9, now, 0.5);
    tone.frequency.setTargetAtTime(mix.lowpass, now, 0.4);
  }

  // ---- tick: schedule what is due
  function tick(now = ctx.currentTime) {
    if (ctx.state !== 'running') return;
    for (const [name, p] of Object.entries(PLAY)) {
      const L = layers[name];
      if (!L.on || L.level <= 0.02) continue;
      const s = p.dur();
      if (L.next < now - 0.1) L.next = now + 0.05; // it had stopped: start again now
      while (L.next < now + AHEAD) {
        p.play(L.next, L.step, s);
        L.next += s;
        L.step++;
      }
    }
    for (const [layer, zone, base, make] of oneOffs) {
      const L = layers[layer] ?? layers[ZONE_LAYERS[layer]?.[0]?.[0]];
      const level = state.zones[zone] ?? 0;
      if (!L || !L.on || !(level > 0.04)) continue;
      if (!L.timers[layer]) L.timers[layer] = now + nextDelay(base, level, rand);
      if (now >= L.timers[layer]) {
        make(now + 0.05);
        L.timers[layer] = now + nextDelay(base, level, rand);
      }
    }
    // birds and crickets: calls from time to time, more where it is green
    for (const kind of ['birds', 'crickets']) {
      const level = state[kind];
      if (!(level > 0.02)) continue;
      if (!state.callTimers[kind]) state.callTimers[kind] = now + nextCallDelay(level, rand) / 1000;
      if (now >= state.callTimers[kind]) {
        const notes = kind === 'birds' ? birdCall(rand) : cricketBurst(rand);
        for (const [start, length, a, b] of notes) voice(master, { type: 'sine', hz: a, t: now + 0.02 + start, dur: length, vol: (kind === 'birds' ? 0.05 : 0.025) * level, a: length * 0.3, r: length * 0.7, glideTo: kind === 'birds' && b ? b : 0 });
        state.callTimers[kind] = now + nextCallDelay(level, rand) / 1000;
      }
    }
  }

  return {
    update,
    tick,
    levels: state.levels,
    close: () => {
      recordings.close();
      for (const L of Object.values(layers)) stop(L);
      try {
        ctx.close();
      } catch {
        /* closed */
      }
    },
  };
}
