// Row windowing for the dex grids.
//
// HSK 7-9 alone is 5,602 word slots. Putting them all in the DOM costs a
// second of layout on a phone and janks every scroll after it, so the grid
// renders only the rows near the viewport and reserves the rest as height.
// The arithmetic lives here, away from the DOM, because off-by-one errors in
// it look like tiles that flicker in late.

export interface RowWindow {
  /** First row to render (inclusive). */
  firstRow: number;
  /** Last row to render (inclusive); -1 when there is nothing to render. */
  lastRow: number;
}

export interface WindowInput {
  /** How far the page is scrolled. */
  scrollTop: number;
  /** Height of the visible area. */
  viewportHeight: number;
  /** Distance from the top of the document to the top of the grid. */
  gridTop: number;
  rowHeight: number;
  rowCount: number;
  /** Rows to keep rendered beyond each edge, so scrolling reveals ready tiles. */
  overscan?: number;
}

/**
 * The rows overlapping the viewport, plus overscan. Clamped to the grid, so a
 * grid scrolled past or not yet reached still returns a valid (empty-ish)
 * range rather than negative indices.
 */
export function visibleRows({
  scrollTop, viewportHeight, gridTop, rowHeight, rowCount, overscan = 3,
}: WindowInput): RowWindow {
  if (rowCount <= 0 || rowHeight <= 0) return { firstRow: 0, lastRow: -1 };

  // How far the viewport's top edge sits below the grid's top edge.
  const offset = scrollTop - gridTop;
  const first = Math.floor(offset / rowHeight) - overscan;
  const last = Math.ceil((offset + viewportHeight) / rowHeight) + overscan;

  return {
    firstRow: Math.max(0, Math.min(first, rowCount - 1)),
    lastRow: Math.max(0, Math.min(last, rowCount - 1)),
  };
}

/** How many columns fit, given the grid's width and a minimum tile width. */
export function columnCount(gridWidth: number, minTileWidth: number, gap: number): number {
  if (gridWidth <= 0 || minTileWidth <= 0) return 1;
  return Math.max(1, Math.floor((gridWidth + gap) / (minTileWidth + gap)));
}
