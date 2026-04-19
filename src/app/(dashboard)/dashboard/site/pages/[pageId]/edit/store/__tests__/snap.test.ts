/**
 * Unit tests for the snap helper. No DOM.
 */
import { describe, it, expect } from "vitest";
import { snapRect, snapResize } from "../snap";

describe("snap helpers", () => {
  it("snaps left edge to a sibling's right edge", () => {
    const r = snapRect(
      { x: 104, y: 0, w: 50, h: 50 },
      [{ x: 0, y: 0, w: 100, h: 50 }],
    );
    expect(r.x).toBe(100);
    expect(r.guideX).toBe(100);
  });

  it("snaps center to sibling center within threshold", () => {
    const r = snapRect(
      { x: 98, y: 0, w: 40, h: 40 }, // cx = 118
      [{ x: 0, y: 0, w: 240, h: 40 }], // cx = 120
    );
    expect(r.x).toBe(100); // shifted by +2
    expect(r.guideX).toBe(120);
  });

  it("ignores matches outside threshold", () => {
    const r = snapRect(
      { x: 50, y: 0, w: 10, h: 10 },
      [{ x: 200, y: 0, w: 10, h: 10 }],
    );
    expect(r.x).toBe(50);
    expect(r.guideX).toBeNull();
  });

  it("snapResize with 'e' handle only moves right edge", () => {
    const r = snapResize(
      { x: 0, y: 0, w: 98, h: 50 },
      "e",
      [{ x: 100, y: 0, w: 10, h: 10 }],
    );
    expect(r.x).toBe(0);
    expect(r.w).toBe(100);
    expect(r.guideX).toBe(100);
  });

  it("snapResize with 'w' handle adjusts x and keeps right edge", () => {
    const r = snapResize(
      { x: 52, y: 0, w: 100, h: 50 },
      "w",
      [{ x: 50, y: 0, w: 10, h: 10 }],
    );
    // target = x=52; nearest sibling x=50, delta=-2
    expect(r.x).toBe(50);
    expect(r.w).toBe(102);
  });
});
