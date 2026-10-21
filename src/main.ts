import "./style.css";
import {
  initial,
  restore,
  save,
  parse,
  add,
  remove,
  region,
  effects,
  convex,
  transform,
  homography,
  square,
  type State,
  type Point,
} from "./model";
import { Renderer, refs } from "./render";
import { Sync } from "./sync";
import { Demo } from "./demo";
import { putAsset, getAsset } from "./media";
import { detect, fit } from "./calibration";
const output = new URLSearchParams(location.search).has("output");
let state = restore(),
  selected = state.regions[0]?.id,
  lang = localStorage.getItem("projection-lang") || "ja";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const tr = (ja: string, en: string) => (lang === "ja" ? ja : en);
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const history: string[] = [],
  future: string[] = [];
let win: Window | null = null,
  renderer: Renderer,
  demo: Demo | undefined,
  sync: Sync,
  stream: MediaStream | null = null;
const pending = new Set<string>();
const mediaUrls: string[] = [];
function report(s: string) {
  if ($("status")) $("status").textContent = s;
  else console.info(s);
}
function checkpoint() {
  history.push(JSON.stringify(state));
  if (history.length > 80) history.shift();
  future.length = 0;
}
function changed(refresh = true) {
  try {
    save(state);
  } catch {
    report(
      tr(
        "保存容量が不足しています。JSONをエクスポートしてください。",
        "Storage full. Export JSON.",
      ),
    );
  }
  sync?.publish();
  if (!output) {
    if (refresh) refreshUI();
    drawOverlay();
    demo?.update(state, ($("demo-kind") as HTMLSelectElement).value);
  }
  void loadMedia();
}
async function loadMedia() {
  for (const r of state.regions) {
    if (!r.asset || renderer.media.has(r.asset) || pending.has(r.asset))
      continue;
    pending.add(r.asset);
    try {
      const blob = await getAsset(r.asset);
      if (!blob) {
        report("Media missing: " + r.name);
        continue;
      }
      const url = URL.createObjectURL(blob);
      mediaUrls.push(url);
      const m = blob.type.startsWith("video")
        ? document.createElement("video")
        : new Image();
      m.src = url;
      if (m instanceof HTMLVideoElement) {
        m.muted = true;
        m.loop = true;
        m.playsInline = true;
        await m.play();
      } else await m.decode();
      renderer.media.set(r.asset, m);
    } catch (e) {
      report(String(e));
    } finally {
      pending.delete(r.asset);
    }
  }
}
if (output) {
  document.body.className = "output";
  $("app").innerHTML =
    '<canvas id="render"></canvas><button id="unlock">Click / double-click: fullscreen & media · Esc: exit</button>';
  renderer = new Renderer($("render"));
  const unlock = async () => {
    try {
      await document.documentElement.requestFullscreen();
      $("unlock").classList.add("hidden");
      for (const m of renderer.media.values())
        if (m instanceof HTMLVideoElement) await m.play();
    } catch (e) {
      report(String(e));
    }
  };
  $("unlock").onclick = unlock;
  document.ondblclick = unlock;
  document.addEventListener("fullscreenchange", () => {
    $("unlock").classList.toggle("hidden", !!document.fullscreenElement);
  });
  sync = new Sync(
    (s) => {
      state = s;
      void loadMedia();
    },
    () => state,
    false,
  );
  void loadMedia();
} else {
  $("app").innerHTML =
    `<header><div class="brand"><div class="logo">◈</div><div><h1>Projection Mapping <span class="muted">Playground</span></h1><div class="eyebrow">LIGHT / SPACE / EXPERIMENT</div></div></div><div class="header-actions"><span class="badge">● LOCAL STUDIO</span><button id="language">${lang === "ja" ? "EN" : "日本語"}</button><button id="save" class="primary">${tr("保存", "Save project")}</button></div></header>
 <main class="workspace"><aside class="stack"><section class="panel"><div class="section-title">01 / PROJECTOR <span>↗</span></div><button id="open" class="primary full">${tr("OUTPUTを開く ↗", "Open output ↗")}</button><div class="row spacer"><button id="fullscreen">${tr("全画面", "Fullscreen")}</button><button id="enabled">OUTPUT ON</button></div><button id="blackout" class="danger full spacer">BLACKOUT</button><label>${tr("出力解像度", "Output resolution")}</label><select id="resolution"><option value="1280,720">1280 × 720</option><option value="1920,1080">1920 × 1080</option><option value="2560,1440">2560 × 1440</option><option value="3840,2160">3840 × 2160</option></select><label>TEST PATTERN</label><select id="pattern">${["NONE", "CHECKERBOARD", "GRID", "DOT GRID", "CROSSHAIR", "SOLID WHITE", "RGB TEST", "NUMBERED POINTS", "REFERENCE"].map((x) => `<option>${x}</option>`).join("")}</select><label>${tr("格子間隔 / 線幅", "Grid count / line width")}</label><div class="row"><input aria-label="Grid count" id="spacing" type="range" min="4" max="40"><input aria-label="Line width" id="line" type="range" min="1" max="10"></div><label>${tr("パターン明るさ", "Pattern brightness")}</label><input aria-label="Pattern brightness" id="light" type="range" min="0" max="1" step="0.05"></section>
 <section class="panel"><div class="section-title">02 / MAPPING <span id="count"></span></div><div id="regions"></div><button id="add" class="full">＋ ${tr("領域を追加", "Add surface")}</button><label>${tr("領域名", "Surface name")}</label><input id="name" type="text" maxlength="80"><div class="row spacer"><button id="visible">${tr("表示 / 非表示", "Show / hide")}</button><button id="delete">${tr("削除", "Delete")}</button></div><label>${tr("メッシュ分割数（ガイド）", "Mesh subdivisions (guide)")}</label><input id="mesh" type="range" min="1" max="64"><p class="small">${tr("四隅をドラッグして投影面を合わせます。矢印キーで微調整。", "Drag corners to align. Use arrow keys for fine adjustment.")}</p></section><section class="panel"><div class="section-title">PROJECT</div><div class="row"><button id="load">LOAD</button><button id="export">EXPORT</button><button id="import">IMPORT</button></div><input type="file" id="json-file" accept="application/json,.json" hidden></section></aside>
 <div class="stack"><section><div class="stage-head"><h2>${tr("マッピング・キャンバス", "Mapping canvas")}</h2><div class="toolbar"><button id="undo" title="Undo (Ctrl+Z)">↶</button><button id="redo" title="Redo (Ctrl+Y)">↷</button><button id="reset">RESET</button></div></div><div class="stage"><canvas id="render"></canvas><svg id="overlay" viewBox="0 0 960 540" aria-label="Mapping corner editor"></svg></div><div class="stage-footer"><span><span class="dot">●</span> LIVE PREVIEW <b id="dimensions"></b></span><span id="fps">— FPS</span></div><div class="help">${tr("① HDMIを拡張表示に設定 → ② OUTPUTを開く → ③ ウィンドウをプロジェクターへ移動しダブルクリック → ④ GRIDで位置合わせ → ⑤ エフェクトで投影", "① Extend your HDMI display → ② Open output → ③ Move it to projector and double-click → ④ Align with GRID → ⑤ Choose an effect")}</div></section>
 <section class="panel"><div class="section-title">03 / VISUAL FX <span>${tr("選択中の領域", "SELECTED SURFACE")}</span></div><div class="effects">${effects.map((x, i) => `<button data-effect="${x}"><span class="effect-icon">${["▦", "≈", "⠿", "◇", "≋", "▧", "▷", "◉"][i]}</span>${x}</button>`).join("")}</div><div class="demo-grid"><div><label>${tr("速度", "Speed")} <span id="speed-value"></span></label><input aria-label="Speed" id="speed" type="range" min="0" max="4" step="0.05"><label>${tr("明るさ", "Brightness")}</label><input aria-label="Brightness" id="brightness" type="range" min="0" max="2" step="0.05"></div><div><label>${tr("スケール", "Scale")}</label><input aria-label="Scale" id="scale" type="range" min="0.2" max="4" step="0.05"><div class="row"><input aria-label="Effect color" type="color" id="color"><button id="media-load">${tr("画像 / 動画を読込", "Load image / video")}</button></div><input id="media-file" type="file" accept="image/*,video/*" hidden></div></div></section>
 <section class="panel"><div class="section-title">VIRTUAL STAGE <span>2.5D SIMULATION</span></div><div class="demo-grid"><canvas id="demo" class="demo"></canvas><div><label>${tr("仮想投影対象", "Virtual object")}</label><select id="demo-kind"><option value="cube">${tr("立方体", "Cube")}</option><option value="wall">${tr("平面壁", "Wall")}</option><option value="cuboid">${tr("直方体", "Cuboid")}</option><option value="panels">${tr("3面パネル", "Three panels")}</option></select><button id="preset" class="full spacer">${tr("3面デモを読み込む", "Load three-face demo")}</button><p class="small">${tr("同じ投影映像を仮想面に表示します。実環境との自動位置合わせや3D復元ではありません。", "Uses the same output texture on virtual surfaces. This is not real-world registration or 3D reconstruction.")}</p></div></div></section></div>
 <aside class="stack right"><section class="panel"><div class="section-title">04 / CALIBRATION <span>◉</span></div><div class="row"><button id="manual" class="active">MANUAL</button><button id="assist">CAMERA ASSIST</button></div><label>${tr("カメラ", "Camera")}</label><select id="cameras"><option value="">${tr("既定のカメラ", "Default camera")}</option></select><label>${tr("撮影解像度", "Capture resolution")}</label><select id="camera-resolution"><option value="1280,720">1280 × 720</option><option value="1920,1080">1920 × 1080</option><option value="640,480">640 × 480</option></select><div class="row spacer"><button id="start-camera">${tr("接続", "Connect")}</button><button id="stop-camera">${tr("停止", "Stop")}</button></div><p id="camera-status" class="small">${tr("カメラ未接続 · 手動操作可能", "Camera offline · manual mode ready")}</p><video id="video" class="camera-video" muted playsinline></video><canvas id="camera" class="camera" width="640" height="360"></canvas><div class="row spacer"><button id="reference">${tr("基準点投影", "Project dots")}</button><button id="capture">${tr("撮影", "Capture")}</button></div><button id="detect" class="full spacer">AUTO DETECT</button><div class="row spacer"><button id="points">${tr("9点を手動指定", "Mark 9 points")}</button><button id="synthetic">${tr("合成画像", "Synthetic")}</button></div><p class="small" id="camera-help">${tr("固定した平面で使用。基準点は上段左→右、中段、下段の順です。鏡像・90度以上の回転は非対応。", "Fixed plane only. Dots: top row left to right, then middle and bottom. Mirrored / rotated views unsupported.")}</p><p id="quality" class="small">${tr("対応点なし", "No correspondences")}</p><button id="estimate" class="full">${tr("対応点から変換を推定", "Estimate homography")}</button><button id="target" class="full spacer">${tr("対象の四隅を指定 → 補正", "Mark target corners → correct")}</button><button id="cal-reset" class="full spacer">${tr("キャリブレーションをリセット", "Reset calibration")}</button></section><section class="panel"><div class="section-title">SESSION NOTES</div><p class="small">${tr("設定は自動保存されます。画像・動画はこのブラウザのIndexedDBに保存。JSONには素材本体を含みません。", "Settings autosave. Media lives in this browser’s IndexedDB. JSON exports exclude media files.")}</p><p class="small">${tr("カメラ映像・ファイルはサーバーへ送信しません。OUTPUT全画面は出力側でのクリックが必要です。", "Camera and files stay local. Fullscreen needs a click inside OUTPUT.")}</p></section></aside></main><div id="status" role="status" aria-live="polite"></div>`;
  renderer = new Renderer($("render"));
  demo = new Demo($("demo"), $("render"));
  sync = new Sync(
    () => {},
    () => state,
    true,
  );
  const bind = (id: string, fn: () => void | Promise<void>) => {
    $(id).onclick = () => {
      try {
        Promise.resolve(fn()).catch((e) => report(String(e)));
      } catch (e) {
        report(String(e));
      }
    };
  };
  const mutate = (fn: () => void) => {
    checkpoint();
    fn();
    changed();
  };
  const r = () => state.regions.find((x) => x.id === selected);
  bind("language", () => {
    localStorage.setItem("projection-lang", lang === "ja" ? "en" : "ja");
    location.reload();
  });
  bind("save", () => {
    save(state);
    report(tr("保存しました", "Project saved"));
  });
  bind("load", () => {
    checkpoint();
    state = restore();
    selected = state.regions[0]?.id;
    changed();
  });
  bind("open", () => {
    win = window.open(
      new URL("?output=1", location.href),
      "projection-output",
      "popup,width=1280,height=720",
    );
    if (!win)
      throw Error(
        tr("ポップアップを許可してください", "Allow popups for this site"),
      );
    report(
      tr(
        "OUTPUTをプロジェクター画面へ移動し、ダブルクリックで全画面にしてください。",
        "Move OUTPUT to projector, then double-click for fullscreen.",
      ),
    );
  });
  bind("fullscreen", () => {
    win?.focus();
    report(
      tr(
        "出力ウィンドウをダブルクリックしてください。Escで解除します。",
        "Double-click OUTPUT to enter fullscreen. Esc exits.",
      ),
    );
  });
  bind("enabled", () => mutate(() => (state.enabled = !state.enabled)));
  bind("blackout", () => mutate(() => (state.blackout = !state.blackout)));
  for (const id of ["pattern", "resolution", "spacing", "line", "light"])
    $(id).onchange = () =>
      mutate(() => {
        const value = ($(id) as HTMLInputElement).value;
        if (id === "resolution") {
          [state.width, state.height] = value.split(",").map(Number);
        } else if (id === "pattern") state.pattern = value;
        else (state as any)[id] = Number(value);
      });
  bind("add", () =>
    mutate(() => {
      add(state);
      selected = state.regions.at(-1)!.id;
    }),
  );
  bind("delete", () =>
    mutate(() => {
      remove(state, selected);
      selected = state.regions[0]?.id;
    }),
  );
  bind("visible", () =>
    mutate(() => {
      if (r()) r()!.visible = !r()!.visible;
    }),
  );
  for (const id of ["name", "mesh", "speed", "brightness", "scale", "color"]) {
    const el = $(id) as HTMLInputElement;
    el.onpointerdown = () => checkpoint();
    el.onfocus = () => {
      if (id === "name") checkpoint();
    };
    el.oninput = () => {
      if (r()) {
        (r() as any)[id] = ["name", "color"].includes(id)
          ? el.value
          : Number(el.value);
        changed(false);
        if (id === "name") refreshUI(false);
      }
    };
  }
  document.querySelectorAll<HTMLButtonElement>("[data-effect]").forEach(
    (b) =>
      (b.onclick = () =>
        mutate(() => {
          if (r()) r()!.source = b.dataset.effect!;
          state.pattern = "NONE";
        })),
  );
  bind("reset", () =>
    mutate(() => {
      if (r()) r()!.points = region().points;
    }),
  );
  bind("undo", () => {
    const s = history.pop();
    if (s) {
      future.push(JSON.stringify(state));
      state = parse(s);
      changed();
    }
  });
  bind("redo", () => {
    const s = future.pop();
    if (s) {
      history.push(JSON.stringify(state));
      state = parse(s);
      changed();
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).matches("input,select,textarea")) return;
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      $("undo").click();
    }
    if (e.ctrlKey && e.key === "y") {
      e.preventDefault();
      $("redo").click();
    }
  });
  bind("export", () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "projection-mapping.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  bind("import", () => $("json-file").click());
  $("json-file").onchange = async () => {
    try {
      const f = ($("json-file") as HTMLInputElement).files?.[0];
      if (f) {
        const next = parse(await f.text());
        checkpoint();
        state = next;
        selected = state.regions[0]?.id;
        changed();
      }
    } catch (e) {
      report(String(e));
    }
  };
  bind("media-load", () => $("media-file").click());
  $("media-file").onchange = async () => {
    try {
      const f = ($("media-file") as HTMLInputElement).files?.[0],
        target = r();
      if (!f || !target) return;
      if (!/^(image|video)\//.test(f.type)) throw Error("Unsupported media");
      const id = crypto.randomUUID();
      await putAsset(id, f);
      checkpoint();
      target.asset = id;
      target.source = f.type.startsWith("video") ? "VIDEO" : "IMAGE";
      state.pattern = "NONE";
      changed();
    } catch (e) {
      report(String(e));
    }
  };
  $("demo-kind").onchange = () =>
    demo?.update(state, ($("demo-kind") as HTMLSelectElement).value);
  bind("preset", () =>
    mutate(() => {
      state.regions = ["FRONT", "RIGHT", "TOP"].map((name, i) => ({
        ...region(name),
        source: effects[i],
        points: [
          [0.06 + i * 0.31, 0.18],
          [0.32 + i * 0.31, 0.18],
          [0.32 + i * 0.31, 0.82],
          [0.06 + i * 0.31, 0.82],
        ] as Point[],
      }));
      selected = state.regions[0].id;
      state.pattern = "NONE";
    }),
  );
  bind("manual", () => {
    stopCamera();
    report(
      tr(
        "手動モード。キャンバスの四隅を調整してください。",
        "Manual mode. Adjust canvas corners.",
      ),
    );
  });
  bind("assist", () => {
    report(
      tr(
        "基準点投影 → 接続 → 撮影 → 検出 → 確認 → 変換推定 → 対象四隅を指定。",
        "Project dots → Connect → Capture → Detect → Verify → Estimate → Mark target.",
      ),
    );
  });
  bind("start-camera", startCamera);
  bind("stop-camera", stopCamera);
  bind("reference", () =>
    mutate(() => {
      state.pattern = "REFERENCE";
      state.blackout = false;
      state.enabled = true;
    }),
  );
  bind("capture", capture);
  bind("synthetic", synthetic);
  bind("detect", async () => {
    if (!frozen) capture();
    report(
      tr(
        "OpenCVを読み込み、基準点を検出しています…",
        "Loading OpenCV and detecting dots…",
      ),
    );
    cameraPoints = await detect(snapshot);
    mode = "edit";
    paintCamera();
    estimate(false);
    report(
      tr(
        "検出点の番号を確認し、ずれていればドラッグで修正してください。",
        "Check point numbering; drag to correct.",
      ),
    );
  });
  bind("points", () => {
    if (!frozen) capture();
    cameraPoints = [];
    state.calibration = null;
    mode = "points";
    paintCamera();
    report(
      tr(
        "9点を上段左→右、中段、下段の順にクリックしてください。",
        "Click nine dots, row by row, left to right.",
      ),
    );
  });
  bind("estimate", () => estimate(true));
  bind("target", () => {
    if (!state.calibration) throw Error("Estimate homography first");
    if (state.calibration.error > 3)
      throw Error("Reprojection error exceeds 3 px");
    targetPoints = [];
    mode = "target";
    report(
      tr(
        "カメラ画像上で対象の左上→右上→右下→左下をクリックしてください。",
        "Click target: top-left, top-right, bottom-right, bottom-left.",
      ),
    );
  });
  bind("cal-reset", () =>
    mutate(() => {
      state.calibration = null;
      cameraPoints = [];
      targetPoints = [];
      mode = "edit";
      paintCamera();
      $("quality").textContent = "No correspondences";
    }),
  );
  const overlay = $("overlay");
  let drag = -1;
  overlay.onpointerdown = (e) => {
    const node = e.target as SVGElement;
    const index = node.getAttribute("data-corner");
    if (index === null) return;
    drag = Number(index);
    checkpoint();
    overlay.setPointerCapture(e.pointerId);
  };
  overlay.onpointermove = (e) => {
    if (drag < 0 || !r()) return;
    const box = overlay.getBoundingClientRect();
    const p = r()!.points.map((p) => [...p] as Point);
    p[drag] = [
      Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    ];
    if (convex(p)) {
      r()!.points = p;
      changed(false);
    }
  };
  overlay.onpointerup = () => {
    drag = -1;
  };
  overlay.onpointercancel = () => {
    drag = -1;
  };
  overlay.onkeydown = (e) => {
    const i = (e.target as SVGElement).getAttribute("data-corner");
    if (
      i === null ||
      !r() ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    )
      return;
    e.preventDefault();
    checkpoint();
    const p = r()!.points.map((x) => [...x] as Point),
      axis = e.key === "ArrowLeft" || e.key === "ArrowRight" ? 0 : 1;
    const delta =
      (e.shiftKey ? 10 : 1) / (axis === 0 ? state.width : state.height);
    p[+i][axis] +=
      e.key === "ArrowLeft" || e.key === "ArrowUp" ? -delta : delta;
    if (p[+i].every((v) => v >= 0 && v <= 1) && convex(p)) {
      r()!.points = p;
      changed(false);
      requestAnimationFrame(() =>
        overlay.querySelector<SVGElement>(`[data-corner="${i}"]`)?.focus(),
      );
    }
  };
  refreshUI();
  drawOverlay();
  demo.update(state, "cube");
  void loadMedia();
  void listCameras();
  document.querySelectorAll<HTMLElement>("button,input,select").forEach((e) => {
    if (!e.title)
      e.title = e.getAttribute("aria-label") || e.textContent?.trim() || e.id;
  });
}
function refreshUI(updateInputs = true) {
  if (output) return;
  if (!state.regions.some((r) => r.id === selected))
    selected = state.regions[0]?.id;
  const r = state.regions.find((r) => r.id === selected);
  $("regions").innerHTML = state.regions
    .map(
      (r, i) =>
        `<button class="surface ${r.id === selected ? "selected" : ""}" data-id="${esc(r.id)}"><span><span class="muted">${String(i + 1).padStart(2, "0")}</span> &nbsp;${esc(r.name)}</span><span class="dot">${r.visible ? "●" : "○"}</span></button>`,
    )
    .join("");
  $("regions")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          selected = b.dataset.id!;
          refreshUI();
          drawOverlay();
        }),
    );
  $("count").textContent = String(state.regions.length).padStart(2, "0");
  $("dimensions").textContent = `${state.width} × ${state.height}`;
  $("enabled").textContent = state.enabled ? "OUTPUT ON" : "OUTPUT OFF";
  $("enabled").classList.toggle("active", state.enabled);
  $("blackout").classList.toggle("active", state.blackout);
  ($("resolution") as HTMLSelectElement).value =
    `${state.width},${state.height}`;
  for (const id of ["pattern", "spacing", "line", "light"])
    ($(id) as HTMLInputElement).value = String((state as any)[id]);
  for (const id of ["name", "mesh", "speed", "brightness", "scale", "color"]) {
    const el = $(id) as HTMLInputElement;
    el.disabled = !r;
    if (r && updateInputs) el.value = String((r as any)[id]);
  }
  document.querySelectorAll<HTMLButtonElement>("[data-effect]").forEach((b) => {
    b.classList.toggle("active", b.dataset.effect === r?.source);
    b.disabled = !r;
  });
  $("render").parentElement!.style.aspectRatio =
    `${state.width}/${state.height}`;
}
function drawOverlay() {
  if (output) return;
  const r = state.regions.find((r) => r.id === selected);
  const svg = $("overlay");
  if (!r) {
    svg.innerHTML = "";
    return;
  }
  const h = homography(square, r.points);
  const guides = Array.from({ length: Math.max(0, r.mesh - 1) }, (_, i) => {
    const v = (i + 1) / r.mesh;
    return [
      [transform(h, [v, 0]), transform(h, [v, 1])],
      [transform(h, [0, v]), transform(h, [1, v])],
    ]
      .map(
        ([a, b]) =>
          '<line x1="' +
          a[0] * 960 +
          '" y1="' +
          a[1] * 540 +
          '" x2="' +
          b[0] * 960 +
          '" y2="' +
          b[1] * 540 +
          '" stroke="#a4f4cf" opacity=".16" stroke-width=".5"/>',
      )
      .join("");
  }).join("");
  const poly = r.points.map(([x, y]) => `${x * 960},${y * 540}`).join(" ");
  svg.innerHTML =
    guides +
    `<polygon points="${poly}"/>` +
    r.points
      .map(
        ([x, y], i) =>
          `<circle data-corner="${i}" tabindex="0" role="slider" aria-label="${["Top left", "Top right", "Bottom right", "Bottom left"][i]} corner" cx="${x * 960}" cy="${y * 540}" r="7"/><text x="${x * 960 + 12}" y="${y * 540 - 12}">${["TL", "TR", "BR", "BL"][i]}</text>`,
      )
      .join("");
}
let frozen = false,
  mode = "edit",
  cameraPoints: Point[] = [],
  targetPoints: Point[] = [];
const snapshot = document.createElement("canvas");
snapshot.width = 640;
snapshot.height = 360;
async function listCameras() {
  try {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput",
    );
    const el = $("cameras") as HTMLSelectElement;
    const old = el.value;
    el.innerHTML =
      '<option value="">Default camera</option>' +
      cameras
        .map(
          (d, i) =>
            `<option value="${esc(d.deviceId)}">${esc(d.label || `Camera ${i + 1}`)}</option>`,
        )
        .join("");
    el.value = old;
  } catch {}
}
async function startCamera() {
  stopCamera();
  try {
    const [width, height] = ($("camera-resolution") as HTMLSelectElement).value
      .split(",")
      .map(Number);
    const device = ($("cameras") as HTMLSelectElement).value;
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: width },
        height: { ideal: height },
        ...(device ? { deviceId: { exact: device } } : {}),
      },
      audio: false,
    });
    const v = $("video") as HTMLVideoElement;
    v.srcObject = stream;
    await v.play();
    renderer.live = v;
    frozen = false;
    $("camera-status").textContent =
      `LIVE · ${v.videoWidth} × ${v.videoHeight}`;
    await listCameras();
    report(
      tr(
        "CAMERA LIVEの出力はこのCONTROLを開いたまま使用してください。",
        "Keep CONTROL open for CAMERA LIVE output.",
      ),
    );
  } catch (e) {
    $("camera-status").textContent = tr(
      "カメラ接続不可 · 手動モードで続行できます",
      "Camera unavailable · manual mode ready",
    );
    throw e;
  }
}
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  renderer.live = null;
  if ($("camera-status"))
    $("camera-status").textContent = tr(
      "カメラ停止 · 手動操作可能",
      "Camera stopped · manual ready",
    );
}
function capture() {
  const v = $("video") as HTMLVideoElement;
  if (!v.videoWidth || !stream)
    throw Error(
      tr(
        "カメラを接続するか合成画像を使用してください",
        "Connect camera or use Synthetic",
      ),
    );
  snapshot.width = v.videoWidth;
  snapshot.height = v.videoHeight;
  snapshot.getContext("2d")!.drawImage(v, 0, 0);
  frozen = true;
  cameraPoints = [];
  state.calibration = null;
  paintCamera();
}
function synthetic() {
  snapshot.width = 960;
  snapshot.height = 540;
  const c = snapshot.getContext("2d")!;
  c.fillStyle = "#111";
  c.fillRect(0, 0, 960, 540);
  c.fillStyle = "#fff";
  refs.forEach((p) => {
    const q = transform([0.8, 0.04, 0.06, 0.02, 0.82, 0.05, 0.08, 0.03, 1], p);
    c.beginPath();
    c.arc(q[0] * 960, q[1] * 540, 8, 0, 2 * Math.PI);
    c.fill();
  });
  frozen = true;
  cameraPoints = [];
  state.calibration = null;
  mode = "edit";
  paintCamera();
  report(
    tr(
      "合成画像です。AUTO DETECTで9点の検出をテストできます。",
      "Synthetic image ready. Run AUTO DETECT.",
    ),
  );
}
function paintCamera() {
  if (output) return;
  const c = $("camera") as HTMLCanvasElement;
  c.width = snapshot.width;
  c.height = snapshot.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(snapshot, 0, 0);
  cameraPoints.forEach(([x, y], i) => {
    ctx.strokeStyle = "#8dffca";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x * c.width, y * c.height, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#8dffca";
    ctx.font = "18px monospace";
    ctx.fillText(String(i + 1), x * c.width + 15, y * c.height - 10);
  });
  targetPoints.forEach(([x, y], i) => {
    ctx.fillStyle = "#ffbb66";
    ctx.fillRect(x * c.width - 4, y * c.height - 4, 8, 8);
    ctx.fillText("T" + (i + 1), x * c.width + 10, y * c.height);
  });
}
function estimate(commit: boolean) {
  if (cameraPoints.length !== 9) throw Error("9 correspondences required");
  const cal = fit(cameraPoints, snapshot.width, snapshot.height);
  $("quality").textContent =
    `${cameraPoints.length} points · RMS ${cal.error.toFixed(2)} px · ${cal.error <= 3 ? "PASS" : "FAIL"} · ${Math.max(0, 100 - (cal.error / 3) * 100).toFixed(0)}%`;
  if (commit) {
    if (cal.error > 3) throw Error("RMS > 3 px: correct correspondences");
    checkpoint();
    state.calibration = cal;
    changed();
    report(
      tr(
        "変換を保存しました。対象の四隅を指定して補正します。",
        "Transform saved. Mark target corners to correct.",
      ),
    );
  }
}
if (!output) {
  const c = $("camera");
  let moving = -1;
  c.onpointerdown = (e) => {
    if (!frozen) return;
    const b = c.getBoundingClientRect();
    const p: Point = [
      (e.clientX - b.left) / b.width,
      (e.clientY - b.top) / b.height,
    ];
    if (mode === "points") {
      cameraPoints.push(p);
      if (cameraPoints.length === 9) mode = "edit";
      paintCamera();
    } else if (mode === "target") {
      targetPoints.push(p);
      paintCamera();
      if (targetPoints.length === 4) {
        try {
          const points = targetPoints.map((p) =>
            transform(state.calibration!.matrix, p),
          );
          if (
            !convex(points) ||
            points.some((p) => p.some((v) => v < 0 || v > 1))
          )
            throw Error("Target outside projector or invalid corner order");
          const r = state.regions.find((r) => r.id === selected);
          if (!r) throw Error("Select a surface");
          checkpoint();
          r.points = points;
          state.pattern = "NONE";
          changed();
          report(
            tr(
              "対象平面へ補正しました。実際の投影を確認してください。",
              "Correction applied. Verify physical projection.",
            ),
          );
        } catch (e) {
          report(String(e));
        }
        mode = "edit";
      }
    } else {
      moving = cameraPoints.findIndex(
        (q) =>
          Math.hypot((q[0] - p[0]) * b.width, (q[1] - p[1]) * b.height) < 18,
      );
      c.setPointerCapture(e.pointerId);
    }
  };
  c.onpointermove = (e) => {
    if (moving < 0) return;
    const b = c.getBoundingClientRect();
    cameraPoints[moving] = [
      Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    ];
    state.calibration = null;
    paintCamera();
  };
  c.onpointerup = () => (moving = -1);
}
let frames = 0,
  last = performance.now(),
  lastCamera = 0;
const liveChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("projection-live")
    : null;
let sending = false;
const liveCanvas = document.createElement("canvas");
liveCanvas.width = 640;
liveCanvas.height = 360;
if (output && liveChannel)
  liveChannel.onmessage = async (e) => {
    if (!(e.data instanceof Blob)) return;
    const bitmap = await createImageBitmap(e.data);
    liveCanvas.getContext("2d")!.drawImage(bitmap, 0, 0, 640, 360);
    bitmap.close();
    renderer.live = liveCanvas as unknown as HTMLVideoElement;
  };
function frame(t: number) {
  renderer.draw(state, Date.now() % 3600000);
  if (!output) {
    demo?.draw();
    frames++;
    if (t - last >= 1000) {
      $("fps").textContent = `${Math.round((frames * 1000) / (t - last))} FPS`;
      frames = 0;
      last = t;
    }
    if (stream && !frozen) {
      const v = $("video") as HTMLVideoElement;
      const c = $("camera") as HTMLCanvasElement;
      if (c.width !== v.videoWidth) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
      }
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    }
    if (
      stream &&
      liveChannel &&
      t - lastCamera > 100 &&
      !sending &&
      state.regions.some((r) => r.source === "CAMERA LIVE")
    ) {
      lastCamera = t;
      sending = true;
      liveCanvas
        .getContext("2d")!
        .drawImage($("video") as HTMLVideoElement, 0, 0, 640, 360);
      liveCanvas.toBlob(
        (blob) => {
          if (blob) liveChannel.postMessage(blob);
          sending = false;
        },
        "image/jpeg",
        0.7,
      );
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("beforeunload", () => {
  stream?.getTracks().forEach((t) => t.stop());
  mediaUrls.forEach((u) => URL.revokeObjectURL(u));
});
