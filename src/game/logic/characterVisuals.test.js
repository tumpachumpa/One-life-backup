import { describe, expect, it } from "vitest";
import {
  getHeroAttackVisual,
  getHeroIdleVisual,
  getHeroPortraitVisual,
  getHeroRunVisual,
} from "./characterVisuals.js";

describe("character visuals", () => {
  it("uses the Hero_real sprite for every fighter visual state", () => {
    const visuals = [
      getHeroIdleVisual("fighter"),
      getHeroPortraitVisual("fighter"),
      getHeroAttackVisual("fighter", () => 0),
      getHeroRunVisual("fighter"),
    ];

    for (const visual of visuals) {
      expect(visual).toMatchObject({
        sprite: "/assets/sprites/Hero_real.png",
        scale: 0.96,
      });
      expect(visual.animation).toBeUndefined();
    }
  });
});
