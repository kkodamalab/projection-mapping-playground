import * as THREE from "three";
import { homography, square, type State, type Region } from "./model";
export const refs = [
  [0.15, 0.15],
  [0.5, 0.15],
  [0.85, 0.15],
  [0.15, 0.5],
  [0.5, 0.5],
  [0.85, 0.5],
  [0.15, 0.85],
  [0.5, 0.85],
  [0.85, 0.85],
] as [number, number][];
export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.Camera();
  items = new Map<
    string,
    {
      mesh: THREE.Mesh;
      canvas: HTMLCanvasElement;
      texture: THREE.CanvasTexture;
    }
  >();
  media = new Map<string, HTMLImageElement | HTMLVideoElement>();
  live: HTMLVideoElement | HTMLCanvasElement | null = null;
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000);
  }
  draw(s: State, time: number) {
    if (this.canvas.width !== s.width || this.canvas.height !== s.height)
      this.renderer.setSize(s.width, s.height, false);
    const list =
      s.pattern === "NONE"
        ? s.regions
        : [
            {
              ...s.regions[0],
              id: "pattern",
              points: square,
              visible: true,
            } as Region,
          ];
    const active = new Set(list.map((r) => r.id));
    for (const [id, item] of this.items)
      if (!active.has(id)) {
        this.scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        (item.mesh.material as THREE.Material).dispose();
        item.texture.dispose();
        this.items.delete(id);
      }
    list.forEach((r, index) => {
      let item = this.items.get(r.id);
      if (!item) {
        const canvas = document.createElement("canvas");
        canvas.width = 960;
        canvas.height = 540;
        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            tex: { value: texture },
            inv: { value: new THREE.Matrix3() },
          },
          vertexShader:
            "varying vec2 pos;void main(){pos=uv;gl_Position=vec4(position.xy,0.,1.);}",
          fragmentShader:
            "uniform sampler2D tex;uniform mat3 inv;varying vec2 pos;void main(){vec3 q=inv*vec3(pos.x,1.-pos.y,1.);vec2 uv=q.xy/q.z;if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)discard;gl_FragColor=texture2D(tex,vec2(uv.x,1.-uv.y));}",
          depthTest: false,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
        this.scene.add(mesh);
        item = { mesh, canvas, texture };
        this.items.set(r.id, item);
      }
      item.mesh.visible = s.enabled && !s.blackout && r.visible;
      item.mesh.renderOrder = index;
      if (!item.mesh.visible) return;
      try {
        const h = homography(r.points, square);
        (item.mesh.material as THREE.ShaderMaterial).uniforms.inv.value.set(
          ...h,
        );
      } catch {
        item.mesh.visible = false;
        return;
      }
      const ctx = item.canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 960, 540);
      if (s.pattern !== "NONE") pattern(ctx, s);
      else effect(ctx, r, time, this.media.get(r.asset || ""), this.live);
      item.texture.needsUpdate = true;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
export function pattern(c: CanvasRenderingContext2D, s: State) {
  const w = c.canvas.width,
    h = c.canvas.height,
    n = s.spacing,
    dx = w / n,
    dy = h / n;
  c.save();
  c.globalAlpha = s.light;
  c.strokeStyle = c.fillStyle = "#fff";
  c.lineWidth = s.line;
  if (s.pattern === "SOLID WHITE") c.fillRect(0, 0, w, h);
  if (s.pattern === "RGB TEST") {
    ["#ff334f", "#39e88b", "#438dff"].forEach((x, i) => {
      c.fillStyle = x;
      c.fillRect((i * w) / 3, 0, w / 3, h);
    });
  }
  if (s.pattern === "CHECKERBOARD")
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if ((x + y) % 2 === 0) c.fillRect(x * dx, y * dy, dx, dy);
  if (s.pattern === "GRID") {
    c.beginPath();
    for (let x = 0; x <= n; x++) {
      c.moveTo(x * dx, 0);
      c.lineTo(x * dx, h);
      c.moveTo(0, x * dy);
      c.lineTo(w, x * dy);
    }
    c.stroke();
  }
  if (s.pattern === "DOT GRID")
    for (let y = 1; y < n; y++)
      for (let x = 1; x < n; x++) {
        c.beginPath();
        c.arc(x * dx, y * dy, s.line + 1, 0, Math.PI * 2);
        c.fill();
      }
  if (s.pattern === "CROSSHAIR") {
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w / 2, h);
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
    c.stroke();
  }
  if (["NUMBERED POINTS", "REFERENCE"].includes(s.pattern))
    refs.forEach(([x, y], i) => {
      c.beginPath();
      c.arc(x * w, y * h, s.pattern === "REFERENCE" ? 8 : 5, 0, Math.PI * 2);
      c.fill();
      if (s.pattern !== "REFERENCE") {
        c.font = "20px monospace";
        c.fillText(String(i + 1), x * w + 12, y * h - 12);
      }
    });
  c.restore();
}
function effect(
  c: CanvasRenderingContext2D,
  r: Region,
  t: number,
  media: HTMLImageElement | HTMLVideoElement | undefined,
  live: HTMLVideoElement | HTMLCanvasElement | null,
) {
  const w = 960,
    h = 540;
  t = (t * r.speed) / 1000;
  c.save();
  c.globalAlpha = Math.min(1, r.brightness);
  c.fillStyle = c.strokeStyle = r.color;
  c.lineWidth = 2;
  const scale = r.scale;
  if (["IMAGE", "VIDEO", "CAMERA LIVE"].includes(r.source)) {
    const m = r.source === "CAMERA LIVE" ? live : media;
    if (r.source === "VIDEO" && m instanceof HTMLVideoElement && Number.isFinite(m.duration) && m.duration > 0) {
      const target = t % m.duration;
      if (!m.seeking && Math.abs(m.currentTime - target) > .3) m.currentTime = target;
      if (r.speed === 0) m.pause();
      else { m.playbackRate = Math.max(.0625,r.speed); if(m.paused) void m.play().catch(()=>{}); }
    }
    if (m && (!(m instanceof HTMLVideoElement) || m.readyState >= 2))
      c.drawImage(m, 0, 0, w, h);
    else {
      c.font = "22px monospace";
      c.fillText("LOAD MEDIA / START CAMERA", 220, 270);
    }
  }
  if (r.source === "COLOR WAVE" || r.source === "NOISE") {
    for (let y = 0; y < h; y += 12)
      for (let x = 0; x < w; x += 12) {
        const v =
          Math.sin(x * 0.009 * scale + t) +
          Math.sin(y * 0.013 * scale - t * 0.7) +
          Math.sin((x + y) * 0.006 + t);
        c.fillStyle =
          r.source === "NOISE"
            ? `hsl(165 65% ${25 + v * 8}%)`
            : `hsl(${180 + v * 40 + t * 25} 85% 60%)`;
        c.fillRect(x, y, 12, 12);
      }
  }
  if (r.source === "GRID FLOW") {
    c.beginPath();
    for (let x = 0; x < w; x += 40 / scale)
      for (let y = 0; y < h; y += 8) {
        const xx = x + Math.sin(y * 0.013 + t + x * 0.004) * 18;
        y === 0 ? c.moveTo(xx, y) : c.lineTo(xx, y);
      }
    for (let y = 0; y < h; y += 40 / scale) {
      c.moveTo(0, y);
      c.lineTo(w, y);
    }
    c.stroke();
  }
  if (r.source === "PARTICLE")
    for (let i = 0; i < 160; i++) {
      const x = (((i * 137.5 + t * 35) % w) + w) % w,
        y = h / 2 + Math.sin(i * 12.4 + t * 0.4) * h * 0.45;
      c.beginPath();
      c.arc(x, y, (2 + (i % 4)) * scale, 0, Math.PI * 2);
      c.fill();
    }
  if (r.source === "GEOMETRIC")
    for (let i = 0; i < 12; i++) {
      c.save();
      c.translate(w / 2, h / 2);
      c.rotate(t * 0.15 + i * 0.15);
      const d = (i * 30 + 20) * scale;
      c.strokeRect(-d / 2, -d / 2, d, d);
      c.restore();
    }
  c.restore();
  if (r.brightness > 1) {
    c.save();
    c.globalCompositeOperation = "screen";
    c.globalAlpha = r.brightness - 1;
    c.drawImage(c.canvas, 0, 0);
    c.restore();
  }
}
