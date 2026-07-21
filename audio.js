'use strict';

const PENTATONIC_FREQUENCIES = Object.freeze([293.66, 329.63, 369.99, 440, 493.88]);
const clampAudio = (value, minimum, maximum) => (
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
);
const unitValue = (value) => clampAudio(value, 0, 1);

function pickPentatonicFrequency(randomValue) {
  const index = Math.min(
    PENTATONIC_FREQUENCIES.length - 1,
    Math.floor(unitValue(randomValue) * PENTATONIC_FREQUENCIES.length),
  );
  return PENTATONIC_FREQUENCIES[index];
}

const getRainDelay = (randomValue) => Math.round(700 + unitValue(randomValue) * 1500);
const getChimeDelay = (randomValue) => Math.round(4500 + unitValue(randomValue) * 4500);
const getMasterLevel = (value) => clampAudio(value, 0, 0.18);

function createAmbientScheduler({
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onRain = () => {},
  onChime = () => {},
} = {}) {
  let active = false;
  let rainTimer = null;
  let chimeTimer = null;

  const scheduleRain = () => {
    rainTimer = setTimer(() => {
      if (!active) return;
      onRain();
      scheduleRain();
    }, getRainDelay(random()));
  };
  const scheduleChime = () => {
    chimeTimer = setTimer(() => {
      if (!active) return;
      onChime();
      scheduleChime();
    }, getChimeDelay(random()));
  };

  return {
    start() {
      if (active) return;
      active = true;
      scheduleRain();
      scheduleChime();
    },
    stop() {
      active = false;
      if (rainTimer !== null) clearTimer(rainTimer);
      if (chimeTimer !== null) clearTimer(chimeTimer);
      rainTimer = null;
      chimeTimer = null;
    },
    isActive: () => active,
  };
}

function createAmbientSoundscape({
  AudioContextClass,
  documentRef = typeof document === 'undefined' ? null : document,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onStateChange = () => {},
  masterLevel = 0.14,
} = {}) {
  const Context = AudioContextClass || (
    typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext
  );
  if (!Context) return null;

  let context = null;
  let master = null;
  let windSource = null;
  let windLfo = null;
  let scheduler = null;
  let enabled = false;
  let suspendTimer = null;
  let lifecycleVersion = 0;
  let destroyed = false;

  const disconnectOnEnd = (...nodes) => () => {
    for (const node of nodes) node.disconnect();
  };

  const playRain = () => {
    if (!enabled || !context || context.state !== 'running') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1600 + unitValue(random()) * 1800, now);
    oscillator.frequency.exponentialRampToValueAtTime(900, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain).connect(master);
    oscillator.onended = disconnectOnEnd(oscillator, gain);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  };

  const playChime = () => {
    if (!enabled || !context || context.state !== 'running') return;
    const now = context.currentTime;
    const frequency = pickPentatonicFrequency(random());
    const gain = context.createGain();
    const fundamental = context.createOscillator();
    const overtone = context.createOscillator();
    fundamental.type = 'sine';
    overtone.type = 'triangle';
    fundamental.frequency.setValueAtTime(frequency, now);
    overtone.frequency.setValueAtTime(frequency * 2, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
    fundamental.connect(gain);
    overtone.connect(gain);
    gain.connect(master);
    fundamental.onended = disconnectOnEnd(fundamental, overtone, gain);
    fundamental.start(now);
    overtone.start(now);
    fundamental.stop(now + 3.8);
    overtone.stop(now + 3.8);
  };

  const createWind = () => {
    const frameCount = context.sampleRate * 2;
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = random() * 2 - 1;
    }
    const filter = context.createBiquadFilter();
    const windGain = context.createGain();
    const lfoGain = context.createGain();
    windSource = context.createBufferSource();
    windLfo = context.createOscillator();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    windGain.gain.value = 0.2;
    windLfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.045;
    windSource.buffer = buffer;
    windSource.loop = true;
    windSource.connect(filter).connect(windGain).connect(master);
    windLfo.connect(lfoGain).connect(windGain.gain);
    windSource.start();
    windLfo.start();
  };

  const ensureContext = () => {
    if (context) return;
    context = new Context();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    createWind();
    scheduler = createAmbientScheduler({
      random,
      setTimer,
      clearTimer,
      onRain: playRain,
      onChime: playChime,
    });
  };

  const rampMaster = (level, seconds) => {
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(level, now + seconds);
  };

  const start = async () => {
    if (destroyed) return false;
    const startVersion = ++lifecycleVersion;
    try {
      ensureContext();
      if (suspendTimer !== null) clearTimer(suspendTimer);
      suspendTimer = null;
      await context.resume();
      if (destroyed || startVersion !== lifecycleVersion) return false;
      enabled = true;
      rampMaster(getMasterLevel(masterLevel), 2);
      scheduler.start();
      onStateChange(true);
      return true;
    } catch (error) {
      if (startVersion === lifecycleVersion) {
        enabled = false;
        onStateChange(false);
      }
      return false;
    }
  };

  const mute = async () => {
    lifecycleVersion += 1;
    if (!context) return true;
    enabled = false;
    scheduler.stop();
    rampMaster(0, 0.28);
    onStateChange(false);
    suspendTimer = setTimer(() => {
      if (!enabled && context.state === 'running') context.suspend();
    }, 320);
    return true;
  };

  const onVisibilityChange = () => {
    if (!context || !documentRef) return;
    if (documentRef.hidden) {
      lifecycleVersion += 1;
      scheduler.stop();
      context.suspend();
    } else if (enabled) {
      const resumeVersion = lifecycleVersion;
      context.resume().then(() => {
        if (!destroyed && enabled && resumeVersion === lifecycleVersion) scheduler.start();
      }).catch(() => {});
    }
  };
  if (documentRef) documentRef.addEventListener('visibilitychange', onVisibilityChange);

  return {
    start,
    mute,
    toggle: () => (enabled ? mute() : start()),
    isEnabled: () => enabled,
    async destroy() {
      lifecycleVersion += 1;
      destroyed = true;
      enabled = false;
      if (scheduler) scheduler.stop();
      if (suspendTimer !== null) clearTimer(suspendTimer);
      if (documentRef) documentRef.removeEventListener('visibilitychange', onVisibilityChange);
      if (windSource) windSource.stop();
      if (windLfo) windLfo.stop();
      if (context) await context.close();
    },
  };
}

const ambientAudioApi = {
  pickPentatonicFrequency,
  getRainDelay,
  getChimeDelay,
  getMasterLevel,
  createAmbientScheduler,
  createAmbientSoundscape,
};

if (typeof window !== 'undefined') {
  window.createAmbientSoundscape = createAmbientSoundscape;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ambientAudioApi;
}
