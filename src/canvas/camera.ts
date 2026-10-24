/**
 * Camera transformations for 2D pan and zoom with mouse-anchor preservation.
 */

export interface CameraState {
  x: number;      // pan offset X (screen pixels)
  y: number;      // pan offset Y (screen pixels)
  scale: number;  // zoom multiplier [0.4, 4.0]
}

export const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  scale: 1.0,
};

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 4.0;

/**
 * Screen (canvas client) coordinate to World coordinate
 * @param sx Mouse X on canvas in CSS pixels
 * @param sy Mouse Y on canvas in CSS pixels
 * @param originX World origin (0, 0) on canvas screen (e.g. 0.42 * width)
 * @param originY World origin (0, 0) on canvas screen (e.g. 0.54 * height)
 * @param camera Current camera pan and scale
 */
export function screenToWorld(
  sx: number,
  sy: number,
  originX: number,
  originY: number,
  camera: CameraState
): { x: number; y: number } {
  return {
    x: (sx - originX - camera.x) / camera.scale,
    y: (sy - originY - camera.y) / camera.scale,
  };
}

/**
 * World coordinate to Screen coordinate
 */
export function worldToScreen(
  wx: number,
  wy: number,
  originX: number,
  originY: number,
  camera: CameraState
): { x: number; y: number } {
  return {
    x: wx * camera.scale + camera.x + originX,
    y: wy * camera.scale + camera.y + originY,
  };
}

/**
 * Zoom with mouse anchor: adjusts camera x and y so the world point directly
 * under the cursor remains at the exact same screen pixel coordinates.
 */
export function zoomAtPoint(
  currentCamera: CameraState,
  factor: number,
  sx: number,
  sy: number,
  originX: number,
  originY: number
): CameraState {
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentCamera.scale * factor));
  if (Math.abs(newScale - currentCamera.scale) < 0.0001) {
    return currentCamera;
  }

  // 1. Find world coordinates currently under mouse
  const worldPoint = screenToWorld(sx, sy, originX, originY, currentCamera);

  // 2. Adjust camera translation so worldPoint still projects to (sx, sy) under newScale
  // sx = worldPoint.x * newScale + newCamX + originX
  // => newCamX = sx - originX - worldPoint.x * newScale
  const newX = sx - originX - worldPoint.x * newScale;
  const newY = sy - originY - worldPoint.y * newScale;

  return {
    x: newX,
    y: newY,
    scale: newScale,
  };
}
