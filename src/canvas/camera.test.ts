import test from 'node:test';
import assert from 'node:assert/strict';
import { screenToWorld, worldToScreen, zoomAtPoint, DEFAULT_CAMERA } from './camera.ts';

test('screenToWorld and worldToScreen are inverse transformations', () => {
  const originX = 350;
  const originY = 245;
  const camera = { x: 50, y: -30, scale: 1.5 };

  const worldX = 120;
  const worldY = -80;

  const screen = worldToScreen(worldX, worldY, originX, originY, camera);
  const backToWorld = screenToWorld(screen.x, screen.y, originX, originY, camera);

  assert.ok(Math.abs(backToWorld.x - worldX) < 1e-9);
  assert.ok(Math.abs(backToWorld.y - worldY) < 1e-9);
});

test('zoomAtPoint preserves screen coordinate of anchor point', () => {
  const originX = 350;
  const originY = 245;
  const camera = { ...DEFAULT_CAMERA };

  const mouseScreenX = 400;
  const mouseScreenY = 200;

  // Find world coordinates under mouse before zoom
  const worldBefore = screenToWorld(mouseScreenX, mouseScreenY, originX, originY, camera);

  // Zoom in by 1.25x
  const newCamera = zoomAtPoint(camera, 1.25, mouseScreenX, mouseScreenY, originX, originY);

  // Screen coordinates of that world point after zoom
  const screenAfter = worldToScreen(worldBefore.x, worldBefore.y, originX, originY, newCamera);

  assert.ok(Math.abs(screenAfter.x - mouseScreenX) < 1e-6);
  assert.ok(Math.abs(screenAfter.y - mouseScreenY) < 1e-6);
});

test('zoom clamps within [0.4, 4.0]', () => {
  const originX = 350;
  const originY = 245;

  const zoomedOut = zoomAtPoint({ x: 0, y: 0, scale: 0.5 }, 0.1, 350, 245, originX, originY);
  assert.equal(zoomedOut.scale, 0.4);

  const zoomedIn = zoomAtPoint({ x: 0, y: 0, scale: 3.5 }, 2.0, 350, 245, originX, originY);
  assert.equal(zoomedIn.scale, 4.0);
});

test('continuous zoom from 1.0x to 3.0x preserves cursor world anchor within < 0.5px drift', () => {
  const originX = 487.2; // 1160 * 0.42
  const originY = 437.4; // 810 * 0.54
  const cursorScreenX = 762;
  const cursorScreenY = 288;

  let cam = { ...DEFAULT_CAMERA };
  const initialWorldAnchor = screenToWorld(cursorScreenX, cursorScreenY, originX, originY, cam);

  // Step through wheel zoom ticks (1.12x) until reaching >= 3.0x, then exact factor to 3.0x
  while (cam.scale < 3.0) {
    const nextFactor = cam.scale * 1.12 > 3.0 ? 3.0 / cam.scale : 1.12;
    cam = zoomAtPoint(cam, nextFactor, cursorScreenX, cursorScreenY, originX, originY);

    const projectedScreen = worldToScreen(initialWorldAnchor.x, initialWorldAnchor.y, originX, originY, cam);
    const driftPx = Math.hypot(projectedScreen.x - cursorScreenX, projectedScreen.y - cursorScreenY);
    assert.ok(driftPx < 0.5, `Expected cursor anchor drift < 0.5px at scale ${cam.scale}, got ${driftPx}px`);
  }

  assert.ok(Math.abs(cam.scale - 3.0) < 1e-6);
});

