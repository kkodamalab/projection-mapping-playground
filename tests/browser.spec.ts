import { test, expect } from "@playwright/test";
const state = async (page: any) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("projection-playground-v1")!),
  );
test("mapping, output sync, resolution, history, persistence, fullscreen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#preset").click();
  await expect(page.locator("#regions button")).toHaveCount(3);
  const popup = page.waitForEvent("popup");
  await page.locator("#open").click();
  const out = await popup;
  await out.waitForSelector("#render");
  await page.locator("#resolution").selectOption("1280,720");
  await expect
    .poll(() => out.locator("#render").getAttribute("width"))
    .toBe("1280");
  const handle = page.locator('[data-corner="0"]');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 30, { steps: 4 });
  await page.mouse.up();
  const moved = await state(page);
  expect(moved.regions[0].points[0][0]).toBeGreaterThan(0.06);
  await page.locator("#undo").click();
  expect((await state(page)).regions[0].points[0][0]).toBeCloseTo(0.06);
  await page.locator("#redo").click();
  await page.locator('[data-effect="GEOMETRIC"]').click();
  expect((await state(page)).regions[0].source).toBe("GEOMETRIC");
  await page.locator("#blackout").click();
  await expect
    .poll(() =>
      out.evaluate(() => {
        const c = document.querySelector("canvas")!;
        const gl = c.getContext("webgl2")!;
        const p = new Uint8Array(4);
        gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return [...p.slice(0, 3)];
      }),
    )
    .toEqual([0, 0, 0]);
  await page.locator("#blackout").click();
  await out.locator("#unlock").click();
  await expect
    .poll(() => out.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await out.evaluate(() => document.exitFullscreen());
  await expect(out.locator("#unlock")).toBeVisible();
  await page.reload();
  await expect(page.locator("#regions button")).toHaveCount(3);
  expect((await state(page)).regions[0].source).toBe("GEOMETRIC");
  await page.screenshot({ path: "test-results/studio.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("camera denial retains manual mapping", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.locator("#start-camera").click();
  await expect(page.locator("#camera-status")).toContainText("手動");
  await page.locator("#add").click();
  await expect(page.locator("#regions button")).toHaveCount(2);
});
test("OpenCV synthetic detection and target correction", async ({ page }) => {
  await page.goto("/");
  await page.locator("#synthetic").click();
  await page.locator("#detect").click();
  await expect(page.locator("#quality")).toContainText("PASS", {
    timeout: 45000,
  });
  await page.locator("#estimate").click();
  const before = await state(page);
  expect(before.calibration.cameraPoints).toHaveLength(9);
  expect(before.calibration.error).toBeLessThan(1);
  await page.locator("#target").click();
  const b = (await page.locator("#camera").boundingBox())!;
  for (const [x, y] of [
    [0.25, 0.25],
    [0.65, 0.25],
    [0.65, 0.65],
    [0.25, 0.65],
  ])
    await page.mouse.click(b.x + x * b.width, b.y + y * b.height);
  expect((await state(page)).regions[0].points).not.toEqual(
    before.regions[0].points,
  );
});
test("storage fallback synchronization", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  await page.goto("/");
  const pending = page.waitForEvent("popup");
  await page.locator("#open").click();
  const out = await pending;
  await out.waitForSelector("canvas");
  await page.locator("#resolution").selectOption("1280,720");
  await expect
    .poll(() => out.locator("canvas").getAttribute("width"))
    .toBe("1280");
});
test("JSON export import and image persistence", async ({ page }) => {
  await page.goto("/");
  await page.locator("#preset").click();
  const expected = await state(page);
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("projection-mapping.json");
  await page.locator("#delete").click();
  await page
    .locator("#json-file")
    .setInputFiles({
      name: "mapping.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(expected)),
    });
  await expect(page.locator("#regions button")).toHaveCount(3);
  await page
    .locator("#media-file")
    .setInputFiles({
      name: "test.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>',
      ),
    });
  await expect
    .poll(async () => (await state(page)).regions[0].source)
    .toBe("IMAGE");
  await page.reload();
  expect((await state(page)).regions[0].asset).toBeTruthy();
  await expect(page.locator('[data-effect="IMAGE"]')).toHaveClass(/active/);
});
