import { afterEach, describe, expect, it, vi } from "vitest";
import { getSfxVolume, playHeroAttackSound, setSfxVolume } from "./soundManager.js";

describe("sound manager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSfxVolume(1);
  });

  it("hard-mutes procedural sound effects at zero volume", () => {
    let started = 0;
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() {
        return {
          type: "square",
          frequency: { setValueAtTime() {} },
          connect() {},
          start() { started += 1; },
          stop() {},
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      }
      resume() {
        this.state = "running";
        return Promise.resolve();
      }
    }

    vi.stubGlobal("window", { AudioContext: FakeAudioContext });

    setSfxVolume(1);
    expect(playHeroAttackSound()).toBe(true);
    expect(started).toBe(1);

    setSfxVolume(0);
    expect(getSfxVolume()).toBe(0);
    expect(playHeroAttackSound()).toBe(false);
    expect(started).toBe(1);
  });
});
