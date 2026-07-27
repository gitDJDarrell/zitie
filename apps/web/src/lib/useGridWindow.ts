import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { columnCount, visibleRows } from "./windowing";

export interface GridGeometry {
  /** Minimum tile width — decides how many columns fit. */
  tileMin: number;
  /** Fixed tile height, so rows are uniform and windowing is arithmetic. */
  tileHeight: number;
  gap: number;
  /** Rows kept rendered beyond each edge. */
  overscan?: number;
}

/**
 * Renders only the grid rows near the viewport, reserving the rest as height.
 *
 * Both dexes need this and for the same reason: a level can hold hundreds or
 * thousands of slots, and laying all of them out to show twenty costs a
 * visible pause on a phone and janks every scroll afterwards. Attach `ref` to
 * the grid, render `firstRow`..`lastRow`, and pad above and below with spacers
 * so the scrollbar still describes the whole catalog.
 */
export function useGridWindow(itemCount: number, { tileMin, tileHeight, gap, overscan }: GridGeometry) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const [range, setRange] = useState({ firstRow: 0, lastRow: 20 });

  // Columns follow the element's width, not the viewport's — the grid sits
  // inside a padded, max-width column. Re-attaches when the grid comes back
  // after being emptied, which unmounts the element.
  const hasItems = itemCount > 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(columnCount(el.clientWidth, tileMin, gap));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasItems, tileMin, gap]);

  const rowCount = Math.ceil(itemCount / columns);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setRange(visibleRows({
        scrollTop: window.scrollY,
        viewportHeight: window.innerHeight,
        gridTop: el.getBoundingClientRect().top + window.scrollY,
        rowHeight: tileHeight + gap,
        rowCount,
        overscan,
      }));
    };
    // Coalesce scroll events into one measurement per frame.
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rowCount, tileHeight, gap, overscan]);

  return { ref, columns, rowCount, ...range };
}
