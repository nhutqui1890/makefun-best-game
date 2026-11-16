// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// The context is created lazily on the first user gesture (browsers block audio
// before one), and every effect is a short envelope over an oscillator, so the
// whole soundscape is a few dozen lines. A slow two-note drone plays under the
// game; M toggles mute and the choice is kept in localStorage.

const MUTE_KEY = 'emberlight.muted';

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicTimer = null;
  let muted = readMuted();

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    return true;
  }

  /** One blip: oscillator type, start/end frequency, duration, volume. */
  function blip(type, from, to, duration, volume, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Filtered noise burst, for hits and explosions. */
  function noise(duration, volume, cutoff = 1200) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  const droneNotes = [110, 164.81, 130.81, 196];
  let droneStep = 0;
  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    const playNote = () => {
      if (muted || !ctx) return;
      const freq = droneNotes[droneStep % droneNotes.length];
      droneStep += 1;
      const t0 = ctx.currentTime;
      for (const [mult, vol] of [[1, 0.5], [2, 0.16]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.6);
        gain.gain.linearRampToValueAtTime(0, t0 + 3.4);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t0);
        osc.stop(t0 + 3.6);
      }
    };
    playNote();
    musicTimer = window.setInterval(playNote, 2400);
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      if (ensure()) startMusic();
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Storage can be off: mute then lasts this visit only.
      }
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      blip('square', 880, 520, 0.07, 0.10);
    },
    hit() {
      noise(0.08, 0.16, 1800);
    },
    kill() {
      blip('triangle', 420, 90, 0.18, 0.20);
      noise(0.12, 0.12, 900);
    },
    hurt() {
      blip('sawtooth', 220, 55, 0.25, 0.25);
    },
    ember() {
      blip('sine', 660, 1320, 0.12, 0.14);
    },
    dash() {
      noise(0.14, 0.12, 2400);
    },
    upgrade() {
      blip('sine', 523, 523, 0.12, 0.16);
      blip('sine', 659, 659, 0.12, 0.16, 0.09);
      blip('sine', 784, 784, 0.22, 0.18, 0.18);
    },
    wave() {
      blip('triangle', 196, 392, 0.3, 0.18);
    },
    boss() {
      blip('sawtooth', 82, 41, 0.7, 0.28);
      blip('sawtooth', 110, 55, 0.7, 0.20, 0.1);
    },
    victory() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => blip('triangle', n, n, 0.35, 0.18, i * 0.16));
    },
    gameOver() {
      const notes = [392, 311, 233, 175];
      notes.forEach((n, i) => blip('triangle', n, n * 0.94, 0.4, 0.18, i * 0.22));
    },
  };
}
