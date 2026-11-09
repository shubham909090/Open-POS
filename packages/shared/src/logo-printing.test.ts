import { describe, expect, it } from "vitest";
import { logoPrintWidthMm, renderLogoBitmap } from "./logo-printing.js";

function pixels(width: number, height: number, value: number, alpha = 255) {
  const data = new Uint8Array(width * height * 4).fill(value);
  for (let index = 3; index < data.length; index += 4) data[index] = alpha;
  return { width, height, data };
}
function blackCount(data: Uint8Array | Uint8ClampedArray) {
  let count = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index] === 0) count++;
  return count;
}

describe("receipt logo raster", () => {
  it("fits roll-aware sizes, keeps square logos at the selected physical size and centers ink", () => {
    expect(logoPrintWidthMm(384)).toBe(32);
    expect(logoPrintWidthMm(576)).toBe(40);
    expect(logoPrintWidthMm(320, 72)).toBeLessThan(40);
    const result = renderLogoBitmap(pixels(100, 100, 0), 576, { logoWidthMm: 40 });
    expect(result.height).toBe(320);
    expect(result.data[0]).toBe(255);
    expect(result.data[(128 * 4)]).toBe(0);
    expect(result.data[(447 * 4)]).toBe(0);
    expect(result.data[(448 * 4)]).toBe(255);
  });

  it("removes source padding only for printing and composites transparent pixels on white", () => {
    const source = pixels(100, 100, 0, 0);
    for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) source.data[(y * 100 + x) * 4 + 3] = 255;
    const before = new Uint8Array(source.data);
    const result = renderLogoBitmap(source, 384, { logoWidthMm: 20 });
    expect(result.height).toBe(160);
    expect(blackCount(result.data)).toBe(160 * 160);
    expect(source.data).toEqual(before);
    expect(blackCount(renderLogoBitmap(pixels(100, 100, 0, 0), 384).data)).toBe(0);
  });

  it("averages fine strokes when reducing instead of dropping unsampled lines", () => {
    const source = pixels(640, 80, 255);
    // Alternating black/white strokes average to grey. A simple sample would
    // choose only one color and erase all detail at this scale.
    for (let y = 0; y < 80; y++) for (let x = 1; x < 640; x += 2) {
      const offset = (y * 640 + x) * 4;
      source.data[offset] = 0; source.data[offset + 1] = 0; source.data[offset + 2] = 0;
    }
    const result = renderLogoBitmap(source, 320, { logoWidthMm: 12, logoPrintMode: "dither" });
    const black = blackCount(result.data);
    expect(black).toBeGreaterThan(200);
    expect(black).toBeLessThan(96 * result.height);
  });

  it("offers different tonal treatments and preserves independent threshold choices", () => {
    const source = pixels(100, 100, 180);
    expect(blackCount(renderLogoBitmap(source, 384, { logoThreshold: 160 }).data)).toBe(0);
    const darker = renderLogoBitmap(source, 384, { logoThreshold: 200 });
    expect(blackCount(darker.data)).toBeGreaterThan(0);
    const dithered = renderLogoBitmap(source, 384, { logoPrintMode: "dither" });
    expect(blackCount(dithered.data)).toBeGreaterThan(0);
    expect(blackCount(dithered.data)).toBeLessThan(blackCount(darker.data));
  });

  it("retains pale artwork when ink density is raised above its brightness", () => {
    const result = renderLogoBitmap(pixels(10, 10, 251), 384, { logoThreshold: 255 });
    expect(result.height).toBeGreaterThan(1);
    expect(blackCount(result.data)).toBeGreaterThan(0);
  });
});
