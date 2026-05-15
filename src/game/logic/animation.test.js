import { describe, expect, it } from "vitest";
import { findActiveBands, inferSpriteSheetFramesFromImageData } from "./animation.js";

function makeImageData(width, height, activeRects = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
  }

  for (const rect of activeRects) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const index = (y * width + x) * 4;
        data[index] = 220;
        data[index + 1] = 40;
        data[index + 2] = 20;
        data[index + 3] = 255;
      }
    }
  }

  return { width, height, data };
}

describe("animation helpers", () => {
  it("finds active bands separated by empty gaps", () => {
    expect(findActiveBands([false, true, true, false, false, true, true, true, false], 2, 1)).toEqual([
      { start: 1, end: 2 },
      { start: 5, end: 7 },
    ]);
  });

  it("infers frame bounds from separated sprite groups", () => {
    const imageData = makeImageData(20, 10, [
      { x: 1, y: 1, width: 4, height: 4 },
      { x: 10, y: 2, width: 5, height: 5 },
    ]);

    expect(inferSpriteSheetFramesFromImageData(imageData)).toEqual([
      { x: 1, y: 1, width: 4, height: 4 },
      { x: 10, y: 2, width: 5, height: 5 },
    ]);
  });
});
