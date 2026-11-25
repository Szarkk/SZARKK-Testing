/* =========================================================================
   PURE MATH, STORAGE & GEOMETRY HELPERS
   ========================================================================= */

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export function readLS(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val === null ? fallback : val;
  } catch {
    return fallback;
  }
}

export function writeLS(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch {
    // Ignore storage restrictions inside sandboxed iframes
  }
}

export function evalCubic(pts, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * pts[0].x + 3 * uu * t * pts[1].x + 3 * u * tt * pts[2].x + ttt * pts[3].x,
    y: uuu * pts[0].y + 3 * uu * t * pts[1].y + 3 * u * tt * pts[2].y + ttt * pts[3].y
  };
}

export function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.0001) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Vertical ray intersection for Continuous Red Laser vs Thread segments
export function verticalRaySegIntersectY(rayX, rayBottomY, x1, y1, x2, y2) {
  const minX = Math.min(x1, x2) - 5;
  const maxX = Math.max(x1, x2) + 5;
  if (rayX < minX || rayX > maxX) return null;
  const dx = x2 - x1;
  let yHit;
  if (Math.abs(dx) < 0.001) {
    yHit = Math.max(y1, y2);
  } else {
    const t = clamp((rayX - x1) / dx, 0, 1);
    yHit = y1 + (y2 - y1) * t;
  }
  if (yHit <= rayBottomY && yHit >= -10) return yHit;
  return null;
}
