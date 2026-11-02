// Full View remains a document (the sidebar can continue below the arena),
// but its playfield must fit the first screen. CSS reserves the HUD/control
// rows and contains the complete logical canvas in the remaining space.
export function attachViewportFit(playfield) {
  const doc = playfield.ownerDocument;
  const win = doc.defaultView;
  const main = playfield.closest('main');
  function fit() {
    const top = playfield.getBoundingClientRect().top + win.scrollY;
    const bottom = parseFloat(win.getComputedStyle(main).paddingBottom) || 0;
    main.style.setProperty('--playfield-height', `${Math.max(0, win.innerHeight - top - bottom)}px`);
  }
  const observer = new win.ResizeObserver(fit);
  observer.observe(doc.querySelector('header'));
  win.addEventListener('resize', fit);
  win.visualViewport?.addEventListener('resize', fit);
  fit();
  return () => {
    observer.disconnect();
    win.removeEventListener('resize', fit);
    win.visualViewport?.removeEventListener('resize', fit);
    main.style.removeProperty('--playfield-height');
  };
}
