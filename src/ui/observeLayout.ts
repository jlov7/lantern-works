/** Apply layout changes in the next frame, after native resize delivery. */
export function observeLayout(elements: Element[], update: () => void): () => void {
  let frame: number | undefined;
  const observer = new ResizeObserver(() => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      update();
    });
  });
  for (const element of elements) observer.observe(element);
  return () => {
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
