import * as THREE from "three";
import { type State } from "./model";
export class Demo {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  group = new THREE.Group();
  texture: THREE.CanvasTexture;
  constructor(canvas: HTMLCanvasElement, source: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setClearColor("#11151d");
    this.texture = new THREE.CanvasTexture(source);
    this.camera.position.set(3, 2.3, 4);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.group);
    const grid = new THREE.GridHelper(8, 16, 0x324247, 0x1e2931);
    grid.position.y = -1.1;
    this.scene.add(grid);
  }
  update(s: State, kind: string) {
    for (const m of [...this.group.children]) {
      this.group.remove(m);
      const mesh = m as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    s.regions
      .filter((r) => r.visible)
      .slice(0, kind === "wall" ? 32 : 3)
      .forEach((r, i) => {
        const geo = new THREE.PlaneGeometry(kind === "cuboid" ? 2.6 : 1.8, 1.8);
        const uv = geo.getAttribute("uv");
        const order = [0, 1, 3, 2];
        for (let j = 0; j < 4; j++) {
          const p = r.points[order[j]];
          uv.setXY(j, p[0], 1 - p[1]);
        }
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            map: this.texture,
            side: THREE.DoubleSide,
          }),
        );
        if (kind === "wall") {
          mesh.position.set(((i % 3) - 1) * 1.9, Math.floor(i / 3) * 1.9, 0);
        } else if (kind === "panels") {
          mesh.position.x = (i - 1) * 1.85;
          mesh.rotation.y = (i - 1) * -0.35;
        } else {
          if (i === 0) mesh.position.z = 0.9;
          if (i === 1) {
            mesh.rotation.y = Math.PI / 2;
            mesh.position.x = kind === "cuboid" ? 1.3 : 0.9;
          }
          if (i === 2) {
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = 0.9;
          }
        }
        this.group.add(mesh);
      });
  }
  draw() {
    const c = this.renderer.domElement,
      w = c.clientWidth || 400,
      h = c.clientHeight || 230;
    if (c.width !== w || c.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.texture.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
