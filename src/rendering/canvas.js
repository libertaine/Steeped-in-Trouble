// Keep the canvas backing store matched to its displayed size and the device
// pixel ratio. The CSS aspect-ratio keeps the displayed size proportional to
// the logical 920 × 790 coordinate system, and the renderer scales logical
// coordinates onto whatever backing size this produces. Resizing never touches
// game state.

const MAX_PIXEL_RATIO = 2;

export function attachCanvasScaling(canvas, redraw) {
  /** @returns {boolean} whether the backing store was written, which clears it */
  function fit() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return false;
    const ratio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    const changed = canvas.width !== width || canvas.height !== height;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return changed;
  }

  // A ResizeObserver runs after the frame's draw and before its paint, so a
  // cleared canvas would be presented empty unless it is repainted right here.
  function resize() {
    if (fit()) redraw?.();
  }

  fit(); // Nothing has been drawn yet; the first frame paints at this size.
  window.addEventListener('resize', resize);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);

  return function detach() {
    window.removeEventListener('resize', resize);
    observer?.disconnect();
  };
}
