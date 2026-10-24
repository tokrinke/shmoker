// Soft, synthesized table sounds (no audio files). Muted by default; the choice is remembered.
//
// Everything is routed through one master volume, a gentle low-pass filter (keeps clicks from being
// harsh) and a tiny echo that gives the sounds a little room. Tweak the numbers below to taste.
const STORAGE_KEY = 'poker-sound-enabled';

const MASTER_VOLUME = 0.55; // overall loudness, 0 to 1
const SOFTNESS_HZ = 7000; // lower = duller and softer, higher = brighter
const ROOM_AMOUNT = 0.16; // how much echo/room is mixed in

let context: AudioContext | null = null;
let output: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

export const isSoundEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};
export const setSoundEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
};

function audio() {
  if (!context || !output) {
    context = new AudioContext();
    output = context.createGain();
    output.gain.value = MASTER_VOLUME;

    const soften = context.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = SOFTNESS_HZ;

    const echo = context.createDelay();
    echo.delayTime.value = 0.085;
    const feedback = context.createGain();
    feedback.gain.value = 0.24;
    const wet = context.createGain();
    wet.gain.value = ROOM_AMOUNT;

    output.connect(soften);
    soften.connect(context.destination);
    soften.connect(echo);
    echo.connect(feedback);
    feedback.connect(echo);
    echo.connect(wet);
    wet.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return { context, output };
}

/** A short burst of filtered noise: the "flick" of a card or the "clack" of a chip. */
function burst(options: { at?: number; from: number; to?: number; q?: number; duration: number; volume: number }) {
  const { context: c, output: out } = audio();
  const start = c.currentTime + (options.at ?? 0);
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = options.q ?? 0.9;
  filter.frequency.setValueAtTime(options.from, start);
  if (options.to) filter.frequency.exponentialRampToValueAtTime(options.to, start + options.duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(options.volume, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  source.connect(filter).connect(gain).connect(out);
  source.start(start, Math.random() * 0.4);
  source.stop(start + options.duration + 0.03);
}

/** A pure tone with a soft attack and a smooth fade. */
function ping(options: { at?: number; freq: number; to?: number; duration: number; volume: number; attack?: number }) {
  const { context: c, output: out } = audio();
  const start = c.currentTime + (options.at ?? 0);
  const oscillator = c.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(options.freq, start);
  if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, start + options.duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(options.volume, start + (options.attack ?? 0.005));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  oscillator.connect(gain).connect(out);
  oscillator.start(start);
  oscillator.stop(start + options.duration + 0.03);
}

/** A mellow bell: the note plus two quiet overtones. */
function bell(freq: number, at: number, duration: number, volume: number) {
  ping({ at, freq, duration, volume, attack: 0.012 });
  ping({ at, freq: freq * 2.0, duration: duration * 0.6, volume: volume * 0.28, attack: 0.012 });
  ping({ at, freq: freq * 3.01, duration: duration * 0.35, volume: volume * 0.1, attack: 0.012 });
}

const jitter = (amount: number) => (Math.random() - 0.5) * 2 * amount;
const play = (sound: () => void) => () => {
  if (isSoundEnabled()) sound();
};

export const sounds = {
  /** A crisp, satisfying tap as each card lands on the felt. Pass how many cards, and the gap between them. */
  deal: (count = 1, spacing = 0.11) => {
    if (!isSoundEnabled()) return;
    for (let i = 0; i < count; i++) {
      const at = i * spacing + jitter(0.006);
      ping({ at, freq: 260 + jitter(14), to: 88, duration: 0.11, volume: 0.42, attack: 0.002 }); // the "body" of the tap
      burst({ at, from: 2400 + jitter(200), q: 1.5, duration: 0.03, volume: 0.24 }); // the crisp edge
      burst({ at: at + 0.012, from: 900, q: 0.8, duration: 0.05, volume: 0.1 }); // a little felt
    }
  },

  /** A few ceramic chips clicking together. */
  chips: play(() => {
    [0, 0.05, 0.11].forEach((at, index) => {
      const delay = at + jitter(0.008);
      burst({ at: delay, from: 6500 + jitter(500), q: 2.2, duration: 0.035, volume: 0.22 - index * 0.04 });
      ping({ at: delay, freq: 2300 + jitter(350), duration: 0.09, volume: 0.07 });
    });
  }),

  /** A light double knock on the table. */
  check: play(() => {
    [0, 0.1].forEach((at) => {
      ping({ at, freq: 185, duration: 0.1, volume: 0.32 });
      burst({ at, from: 1300, q: 1.2, duration: 0.03, volume: 0.16 });
    });
  }),

  /** Cards pushed away. */
  fold: play(() => {
    burst({ from: 2600, to: 650, q: 0.6, duration: 0.2, volume: 0.17 });
  }),

  /** A soft two-note chime when it becomes your turn. */
  yourTurn: play(() => {
    bell(659.25, 0, 0.55, 0.15);
    bell(880, 0.14, 0.7, 0.13);
  }),

  /** A warm rising chord when you win a pot. */
  win: play(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => bell(freq, index * 0.1, 1.0, index === 3 ? 0.15 : 0.11));
  }),
};
