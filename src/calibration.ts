import { homography, transform, type Point } from "./model";
import { refs } from "./render";
import cvUrl from "@techstark/opencv-js/dist/opencv.js?url";
let loading: Promise<any> | undefined;
export function loadCV() {
  return (loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = cvUrl;
    script.async = true;
    const start = Date.now();
    const check = () => {
      const cv = (window as any).cv;
      if (cv?.Mat) {
        resolve({ cv });
        return;
      }
      if (Date.now() - start > 30000) {
        loading = undefined;
        reject(Error("OpenCV loading timeout"));
        return;
      }
      setTimeout(check, 50);
    };
    script.onload = check;
    script.onerror = () => {
      loading = undefined;
      reject(Error("OpenCV load failed"));
    };
    document.head.append(script);
  }));
}
export async function detect(canvas: HTMLCanvasElement): Promise<Point[]> {
  const { cv } = await loadCV();
  const src = cv.imread(canvas),
    gray = new cv.Mat(),
    binary = new cv.Mat(),
    contours = new cv.MatVector(),
    hierarchy = new cv.Mat();
  const found: Point[] = [];
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, binary, 210, 255, cv.THRESH_BINARY);
    cv.findContours(
      binary,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      try {
        const area = cv.contourArea(cnt),
          perimeter = cv.arcLength(cnt, true),
          rect = cv.boundingRect(cnt);
        if (
          area > 12 &&
          area < canvas.width * canvas.height * 0.008 &&
          (4 * Math.PI * area) / (perimeter * perimeter) > 0.65 &&
          rect.width / rect.height > 0.5 &&
          rect.width / rect.height < 2
        ) {
          const m = cv.moments(cnt);
          found.push([
            m.m10 / m.m00 / canvas.width,
            m.m01 / m.m00 / canvas.height,
          ]);
        }
      } finally {
        cnt.delete();
      }
    }
  } finally {
    src.delete();
    gray.delete();
    binary.delete();
    contours.delete();
    hierarchy.delete();
  }
  if (found.length !== 9)
    throw Error(
      `検出 ${found.length} 点 / 9。露出・向き・照明を調整するか、9点を手動指定してください。`,
    );
  found.sort((a, b) => a[1] - b[1]);
  const sorted: Point[] = [];
  for (let i = 0; i < 9; i += 3)
    sorted.push(...found.slice(i, i + 3).sort((a, b) => a[0] - b[0]));
  return sorted;
}
export function fit(points: Point[], width: number, height: number) {
  const matrix = homography(points, refs);
  const reverse = homography(refs, points);
  const error = Math.sqrt(
    points.reduce((sum, p, i) => {
      const q = transform(reverse, refs[i]);
      return sum + ((p[0] - q[0]) * width) ** 2 + ((p[1] - q[1]) * height) ** 2;
    }, 0) / points.length,
  );
  return { cameraPoints: points, projectorPoints: refs, matrix, error };
}
