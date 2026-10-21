export type Point = [number, number];
export const effects = [
  "GRID FLOW",
  "COLOR WAVE",
  "PARTICLE",
  "GEOMETRIC",
  "NOISE",
  "IMAGE",
  "VIDEO",
  "CAMERA LIVE",
] as const;
export type Region = {
  id: string;
  name: string;
  points: Point[];
  visible: boolean;
  source: string;
  mesh: number;
  speed: number;
  brightness: number;
  scale: number;
  color: string;
  asset?: string;
};
export type State = {
  version: 1;
  regions: Region[];
  width: number;
  height: number;
  enabled: boolean;
  blackout: boolean;
  pattern: string;
  spacing: number;
  line: number;
  light: number;
  calibration: {
    cameraPoints: Point[];
    projectorPoints: Point[];
    matrix: number[];
    error: number;
  } | null;
};
export const square: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
export function region(name = "SURFACE 01"): Region {
  return {
    id: crypto.randomUUID(),
    name,
    points: [
      [0.15, 0.15],
      [0.85, 0.15],
      [0.85, 0.85],
      [0.15, 0.85],
    ],
    visible: true,
    source: "COLOR WAVE",
    mesh: 16,
    speed: 1,
    brightness: 1,
    scale: 1,
    color: "#79fbd3",
  };
}
export function initial(): State {
  return {
    version: 1,
    regions: [region()],
    width: 1920,
    height: 1080,
    enabled: true,
    blackout: false,
    pattern: "NONE",
    spacing: 12,
    line: 2,
    light: 1,
    calibration: null,
  };
}
export function homography(src: Point[], dst: Point[]): number[] {
  if (src.length < 4 || src.length !== dst.length)
    throw Error("4点以上の対応点が必要です");
  const a: number[][] = [],
    b: number[] = [];
  src.forEach(([x, y], i) => {
    const [u, v] = dst[i];
    a.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y],
      [0, 0, 0, x, y, 1, -v * x, -v * y],
    );
    b.push(u, v);
  });
  const m = Array.from({ length: 8 }, (_, i) => [
    ...Array.from({ length: 8 }, (_, j) =>
      a.reduce((s, r) => s + r[i] * r[j], 0),
    ),
    a.reduce((s, r, k) => s + r[i] * b[k], 0),
  ]);
  for (let i = 0; i < 8; i++) {
    let p = i;
    for (let j = i + 1; j < 8; j++)
      if (Math.abs(m[j][i]) > Math.abs(m[p][i])) p = j;
    [m[i], m[p]] = [m[p], m[i]];
    if (Math.abs(m[i][i]) < 1e-10)
      throw Error("点が重なっているか、同一直線上にあります");
    const d = m[i][i];
    m[i] = m[i].map((v) => v / d);
    for (let j = 0; j < 8; j++)
      if (j !== i) {
        const k = m[j][i];
        m[j] = m[j].map((v, l) => v - k * m[i][l]);
      }
  }
  return [...m.map((r) => r[8]), 1];
}
export function transform(h: number[], [x, y]: Point): Point {
  const z = h[6] * x + h[7] * y + h[8];
  if (Math.abs(z) < 1e-10) throw Error("変換できない座標です");
  return [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z];
}
export function convex(p: Point[]) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i],
      b = p[(i + 1) % 4],
      c = p[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 0.00001) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}
export function parse(text: string): State {
  const s = JSON.parse(text);
  const finite = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const points = (p: any) =>
    Array.isArray(p) &&
    p.length === 4 &&
    p.every(
      (v: any) =>
        Array.isArray(v) &&
        v.length === 2 &&
        v.every((n: any) => finite(n, 0, 1)),
    ) &&
    convex(p);
  if (
    s.version !== 1 ||
    !Array.isArray(s.regions) ||
    s.regions.length > 32 ||
    !finite(s.width, 320, 4096) ||
    !finite(s.height, 240, 2160) ||
    !["enabled", "blackout"].every((k) => typeof s[k] === "boolean") ||
    ![
      "NONE",
      "CHECKERBOARD",
      "GRID",
      "DOT GRID",
      "CROSSHAIR",
      "SOLID WHITE",
      "RGB TEST",
      "NUMBERED POINTS",
      "REFERENCE",
    ].includes(s.pattern) ||
    !finite(s.spacing, 4, 40) ||
    !finite(s.line, 1, 10) ||
    !finite(s.light, 0, 1)
  )
    throw Error("無効な設定ファイル");
  const ids = new Set();
  for (const r of s.regions) {
    if (
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      typeof r.name !== "string" ||
      r.name.length > 80 ||
      !points(r.points) ||
      !effects.includes(r.source) ||
      typeof r.visible !== "boolean" ||
      !finite(r.mesh, 1, 64) ||
      !finite(r.speed, 0, 4) ||
      !finite(r.brightness, 0, 2) ||
      !finite(r.scale, 0.2, 4) ||
      !/^#[0-9a-f]{6}$/i.test(r.color) ||
      (r.asset !== undefined && typeof r.asset !== "string")
    )
      throw Error("無効な領域");
    ids.add(r.id);
  }
  if (s.calibration !== null) {
    const c = s.calibration;
    if (
      !c ||
      !Array.isArray(c.matrix) ||
      c.matrix.length !== 9 ||
      !c.matrix.every((v: any) => finite(v, -1e8, 1e8)) ||
      !finite(c.error, 0, 1e8) ||
      !Array.isArray(c.cameraPoints) ||
      !Array.isArray(c.projectorPoints) ||
      c.cameraPoints.length !== c.projectorPoints.length ||
      c.cameraPoints.length < 4 ||
      ![...c.cameraPoints, ...c.projectorPoints].every(
        (p: any) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((v: any) => finite(v, 0, 1)),
      )
    )
      throw Error("無効なキャリブレーション");
  }
  return s;
}
export const KEY = "projection-playground-v1";
export function save(s: State) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
export function restore() {
  try {
    return parse(localStorage.getItem(KEY) || "");
  } catch {
    return initial();
  }
}
export function add(s: State) {
  if (s.regions.length >= 32) throw Error("最大32領域");
  s.regions.push(
    region(`SURFACE ${String(s.regions.length + 1).padStart(2, "0")}`),
  );
}
export function remove(s: State, id: string) {
  s.regions = s.regions.filter((r) => r.id !== id);
}
