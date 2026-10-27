// Keep the canvas backing store matched to its displayed size and the device
// pixel ratio. The CSS aspect-ratio keeps the displayed size proportional to
// the logical 920 × 790 coordinate system, and the renderer scales logical
// coordinates onto whatever backing size this produces. Resizing never touches
// game state.

const MAX_PIXEL_RATIO = 2;

export function attachCanvasScaling(canvas) {
  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const ratio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  resize();
  window.addEventListener('resize', resize);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);

  return function detach() {
    window.removeEventListener('resize', resize);
    observer?.disconnect();
  };
}
