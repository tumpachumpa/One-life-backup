let audioContext = null;
let unlocked = false;
let listenersRegistered = false;
let sfxVolume = 1;
const activeAudioHandles = new Set();

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

export async function unlockSound() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  unlocked = ctx.state === "running";
  return unlocked;
}

export function ensureSoundUnlockHooks() {
  if (typeof window === "undefined" || listenersRegistered) return;
  listenersRegistered = true;
  const tryUnlock = () => {
    unlockSound();
  };
  window.addEventListener("pointerdown", tryUnlock);
  window.addEventListener("keydown", tryUnlock);
  window.addEventListener("touchend", tryUnlock);
}

function playTone({ frequency = 440, duration = 0.08, volume = 0.03, type = "square", attack = 0.003, release = 0.05 } = {}) {
  const finalVolume = Math.max(0, Math.min(1, volume * sfxVolume));
  if (finalVolume <= 0) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  if (!unlocked && ctx.state !== "running") return false;
  unlocked = ctx.state === "running";

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, finalVolume), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + release + 0.01);
  return true;
}

export function setSfxVolume(value) {
  sfxVolume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
  for (const handle of activeAudioHandles) {
    if (handle.audio) {
      handle.audio.volume = Math.max(0, Math.min(1, (handle.baseVolume ?? 1) * sfxVolume));
    }
  }
}

export function getSfxVolume() {
  return sfxVolume;
}

export function playHeroAttackSound() {
  return playTone({
    frequency: 740,
    duration: 0.055,
    volume: 0.028,
    type: "square",
    attack: 0.002,
    release: 0.04,
  });
}

export function playTickSound() {
  return playTone({
    frequency: 880,
    duration: 0.035,
    volume: 0.018,
    type: "sine",
    attack: 0.002,
    release: 0.03,
  });
}

function cleanupManagedAudio(handle) {
  if (!handle || handle.cleanedUp) return;
  handle.cleanedUp = true;
  activeAudioHandles.delete(handle);
  if (handle.stopTimer) {
    clearTimeout(handle.stopTimer);
    handle.stopTimer = null;
  }
  if (handle.audio) {
    handle.audio.onended = null;
    handle.audio.onpause = null;
  }
}

export function playManagedSound({
  src,
  startTimeMs = 0,
  durationMs = null,
  loop = false,
  volume = 1,
  playbackRate = 1,
} = {}) {
  if (typeof window === "undefined" || !src) return null;

  const audio = new Audio(src);
  const startTimeSeconds = Math.max(0, startTimeMs) / 1000;
  const safePlaybackRate = Math.max(0.1, playbackRate || 1);
  audio.preload = "auto";
  audio.loop = !!loop;
  audio.volume = Math.max(0, Math.min(1, (volume ?? 1) * sfxVolume));
  audio.playbackRate = safePlaybackRate;

  const handle = {
    audio,
    baseVolume: Math.max(0, Math.min(1, volume ?? 1)),
    stopTimer: null,
    cleanedUp: false,
    stop() {
      if (handle.cleanedUp) return;
      cleanupManagedAudio(handle);
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore seek errors during teardown.
      }
      audio.removeAttribute("src");
      audio.load();
    },
  };

  const applyStartOffset = () => {
    if (startTimeSeconds <= 0) return;
    try {
      audio.currentTime = startTimeSeconds;
    } catch {
      // Metadata may not be ready yet; the loadedmetadata hook will retry.
    }
  };

  audio.addEventListener("loadedmetadata", applyStartOffset, { once: true });
  audio.onended = () => {
    cleanupManagedAudio(handle);
  };

  activeAudioHandles.add(handle);
  applyStartOffset();

  const playPromise = audio.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {
      cleanupManagedAudio(handle);
    });
  }

  if (durationMs != null && durationMs > 0) {
    handle.stopTimer = window.setTimeout(() => {
      handle.stop();
    }, durationMs);
  }

  return handle;
}

export function stopAllManagedSounds() {
  for (const handle of [...activeAudioHandles]) {
    handle.stop();
  }
}
