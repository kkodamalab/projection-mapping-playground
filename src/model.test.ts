import { describe, it, expect } from "vitest";
import {
  homography,
  transform,
  square,
  initial,
  parse,
  add,
  remove,
  convex,
  save,
  restore,
} from "./model";
describe("mapping", () => {
  it("persists and restores settings", () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem: (k: string, v: string) => memory.set(k, v),
        getItem: (k: string) => memory.get(k),
      },
    });
    const s = initial();
    s.width = 1280;
    save(s);
    expect(restore()).toEqual(s);
    memory.clear();
    expect(restore().version).toBe(1);
  });
  it("identity", () =>
    square.forEach((p) =>
      expect(transform(homography(square, square), p)).toEqual(p),
    ));
  it("projective and inverse", () => {
    const dst: [number, number][] = [
      [0.1, 0.2],
      [0.9, 0.1],
      [0.7, 0.9],
      [0.2, 0.8],
    ];
    const h = homography(square, dst),
      inv = homography(dst, square);
    square.forEach((p, i) =>
      transform(h, p).forEach((n, j) => expect(n).toBeCloseTo(dst[i][j], 9)),
    );
    expect(transform(inv, transform(h, [0.33, 0.71]))[0]).toBeCloseTo(0.33, 9);
  });
  it("rejects degenerate correspondences", () =>
    expect(() =>
      homography(square, [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ]),
    ).toThrow());
  it("rejects crossing quad", () =>
    expect(
      convex([
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 1],
      ]),
    ).toBe(false));
  it("JSON roundtrip", () => {
    const s = initial();
    expect(parse(JSON.stringify(s))).toEqual(s);
  });
  it("rejects malicious or invalid import", () => {
    const s = initial();
    s.regions[0].points[0][0] = NaN;
    expect(() => parse(JSON.stringify(s))).toThrow();
    expect(() => parse('{"version":99}')).toThrow();
  });
  it("adds and deletes independently", () => {
    const s = initial();
    add(s);
    const id = s.regions[0].id;
    remove(s, id);
    expect(s.regions).toHaveLength(1);
    expect(s.regions[0].id).not.toBe(id);
  });
  it("fits more than four synthetic correspondences", () => {
    const src: [number, number][] = [
      [0.1, 0.1],
      [0.5, 0.1],
      [0.9, 0.1],
      [0.1, 0.5],
      [0.5, 0.5],
      [0.9, 0.5],
      [0.1, 0.9],
      [0.5, 0.9],
      [0.9, 0.9],
    ];
    const h = [0.8, 0.1, 0.04, 0.03, 0.7, 0.1, 0.2, 0.05, 1];
    const fit = homography(
      src,
      src.map((p) => transform(h, p)),
    );
    fit.forEach((n, i) => expect(n).toBeCloseTo(h[i], 8));
  });
});
