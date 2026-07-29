import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bristles, DEFAULT_INK, strokeOutline, widthProfile, type InkParams, type SamplePoint } from "../lib/ink";
import { glyphCanvasTransform, gradeAttempt, toCanvasSpace, toGlyphSpace, type CharacterStrokes, type Point, type Verdict } from "../lib/strokes";
import { C } from "../theme";

/* ————————————————— 墨 the brush pad —————————————————
   Write the character by hand. Strokes are kept as the points and timings they
   were drawn with, so the ink controls restyle what is already on the paper
   rather than only affecting the next stroke.

   The pad grades against makemeahanzi's stroke centrelines: which strokes you
   got, which you missed, and whether they came out in the taught order. Order
   is coached rather than required — writing 思 with the box built the wrong way
   round is still writing 思 — so the proof asks for every stroke, and the
   sequence gets a nudge. */

export type Surface = "plain" | "grid" | "scroll";
export type PadMode = "write" | "trace";

interface Stroke { points: SamplePoint[] }

export interface BrushPadProps {
  hanzi: string;
  /** Null while loading, and for a character with no stroke data at all. */
  target: CharacterStrokes | null;
  /**
   * Hand the attempt in. Fires on the learner's say-so, not the pad's: whatever
   * is on the paper gets graded, complete or not. Null verdict means there was
   * nothing to grade it against (no stroke data for this character).
   *
   * It used to fire itself the instant the last stroke landed, which meant a
   * wrong attempt could never be submitted at all — the only way past a
   * character you had got wrong was to skip it, and a skip records nothing. An
   * attempt you can't hand in is an attempt the scheduler never learns from.
   */
  onSubmit?: (verdict: Verdict | null) => void;
  /** Graded already: the paper is read-only and the actions step aside. */
  submitted?: boolean;
  ink: InkParams;
  onInk: (ink: InkParams) => void;
  surface: Surface;
  mode: PadMode;
  showStrokeOrder: boolean;
}

const PAPER = "#f4f1ea";
const INK_COLOR = "#1a1a1a";

export function BrushPad({
  hanzi, target, onSubmit, submitted = false, ink, surface, mode, showStrokeOrder,
}: BrushPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(320);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<SamplePoint[] | null>(null);
  const startedAt = useRef(0);
  // The stroke index being demonstrated by "show me", or null when idle.
  const [teaching, setTeaching] = useState<number | null>(null);

  // Square, and as wide as the column allows.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize(Math.max(220, Math.min(el.clientWidth, 420)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A new character is a clean sheet.
  useEffect(() => {
    setStrokes([]);
    setTeaching(null);
  }, [hanzi]);

  const medians = useMemo<Point[][]>(
    () => (target?.medians ?? []).map((m) => m.map(([x, y]) => [x, y] as Point)),
    [target],
  );

  const verdict = useMemo(() => {
    if (!medians.length || !strokes.length) return null;
    const drawn = strokes.map((s) => toGlyphSpace(s.points.map((p) => [p.x, p.y] as Point), size));
    return gradeAttempt(drawn, medians);
  }, [strokes, medians, size]);


  /* ——— rendering ——— */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // ——— paper ———
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, size, size);
    if (surface === "grid" || surface === "scroll") {
      ctx.strokeStyle = "rgba(120,110,95,0.22)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      // The 田字格 a beginner learns inside: quarters plus the diagonals.
      ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
      if (surface === "grid") {
        ctx.moveTo(0, 0); ctx.lineTo(size, size);
        ctx.moveTo(size, 0); ctx.lineTo(0, size);
      }
      ctx.stroke();
    }
    if (surface === "scroll") {
      // A single ruled column, the way a hanging scroll is written.
      ctx.strokeStyle = "rgba(120,110,95,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(size * 0.12, size * 0.06, size * 0.76, size * 0.88);
    }

    // ——— the character being copied ———
    if (mode === "trace" && target?.strokes.length) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = INK_COLOR;
      // Shared with toCanvasSpace, so the outline you trace is exactly where
      // the medians being graded are.
      const { ty, sx, sy } = glyphCanvasTransform(size);
      ctx.translate(0, ty);
      ctx.scale(sx, sy);
      for (const path of target.strokes) {
        ctx.fill(new Path2D(path));
      }
      ctx.restore();
    }

    // ——— what has been written ———
    const paint = (points: SamplePoint[]) => {
      if (!points.length) return;
      const widths = widthProfile(points, ink, size);
      const outline = strokeOutline(points, widths);
      // Curve through the outline rather than joining it with straight lines:
      // the centrelines are simplified and a polyline shows every facet, which
      // reads as a cut-paper shape instead of a brush stroke.
      const path = new Path2D();
      if (outline.length < 3) {
        outline.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
      } else {
        path.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) {
          const [x, y] = outline[i];
          const [nx, ny] = outline[(i + 1) % outline.length];
          path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
        }
      }
      path.closePath();

      // Wet ink spreads into the paper before the stroke itself lands on top.
      if (ink.wetness > 0.02) {
        ctx.save();
        ctx.globalAlpha = 0.1 + ink.wetness * 0.18;
        ctx.filter = `blur(${(0.6 + ink.wetness * 2.4).toFixed(2)}px)`;
        ctx.fillStyle = INK_COLOR;
        ctx.fill(path);
        ctx.restore();
      }

      ctx.fillStyle = INK_COLOR;
      ctx.fill(path);

      for (const hair of bristles(points, widths, ink)) {
        ctx.strokeStyle = INK_COLOR;
        ctx.lineWidth = hair.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(hair.from[0], hair.from[1]);
        ctx.lineTo(hair.to[0], hair.to[1]);
        ctx.stroke();
      }
    };

    for (const s of strokes) paint(s.points);
    if (drawing.current) paint(drawing.current);

    // ——— 習 teach: the taught order, numbered ———
    if (showStrokeOrder && medians.length) {
      ctx.font = `600 ${Math.max(9, size * 0.036)}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      medians.forEach((median, i) => {
        const [head] = toCanvasSpace([median[0]], size);
        ctx.fillStyle = "rgba(150,42,36,0.85)";
        ctx.fillText(String(i + 1), head[0], head[1]);
      });
    }

    // ——— "show me": the one stroke being demonstrated ———
    if (teaching !== null && medians[teaching]) {
      const pts = toCanvasSpace(medians[teaching], size);
      ctx.strokeStyle = "rgba(150,42,36,0.9)";
      ctx.lineWidth = Math.max(2, size * 0.012);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      // A dot at the head, so the direction is unambiguous.
      ctx.fillStyle = "rgba(150,42,36,0.9)";
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], Math.max(3, size * 0.016), 0, Math.PI * 2);
      ctx.fill();
    }
  }, [size, strokes, ink, surface, mode, target, showStrokeOrder, medians, teaching]);

  useEffect(() => { draw(); }, [draw]);

  /* ——— pointer input ——— */
  const positionOf = (e: React.PointerEvent): SamplePoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * size,
      y: ((e.clientY - rect.top) / rect.height) * size,
      t: performance.now() - startedAt.current,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (submitted) return; // graded — the paper is a record now, not a draft
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    startedAt.current = performance.now();
    drawing.current = [{ ...positionOf(e), t: 0 }];
    setTeaching(null);
    draw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const point = positionOf(e);
    const last = drawing.current[drawing.current.length - 1];
    // Drop samples that haven't moved — they add nothing and skew the speed.
    if (Math.hypot(point.x - last.x, point.y - last.y) < 1.2) return;
    drawing.current.push(point);
    draw();
  };

  const onPointerUp = () => {
    const points = drawing.current;
    drawing.current = null;
    if (!points?.length) return;
    setStrokes((s) => [...s, { points }]);
  };

  const undo = () => setStrokes((s) => s.slice(0, -1));
  const clear = () => {
    setStrokes([]);
    setTeaching(null);
  };

  /** Walk the taught order stroke by stroke. */
  const showMe = () => {
    if (!medians.length) return;
    let i = 0;
    setTeaching(0);
    const step = window.setInterval(() => {
      i += 1;
      if (i >= medians.length) {
        window.clearInterval(step);
        setTeaching(null);
      } else {
        setTeaching(i);
      }
    }, 620);
  };

  const feedback = (() => {
    if (!medians.length) {
      return target === null
        ? "no stroke data for this character — write freely"
        : null;
    }
    if (!verdict || !strokes.length) return null;
    if (verdict.complete && verdict.orderOk) return "written as taught";
    if (verdict.complete) return "written in a different stroke order";
    if (verdict.stray) return `${verdict.matched} of ${verdict.expected} strokes · ${verdict.stray} unrecognised`;
    return `${verdict.matched} of ${verdict.expected} strokes`;
  })();

  return (
    <div ref={wrapRef} className="w-full flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Brush pad for ${hanzi}. ${strokes.length} stroke${strokes.length === 1 ? "" : "s"} written.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          width: size, height: size, borderRadius: 4,
          border: `1px solid ${C.line}`,
          // The pad owns the gesture: without this a drag scrolls the page
          // instead of drawing, which makes writing impossible on a phone.
          touchAction: "none", cursor: "crosshair",
        }}
      />

      {!submitted && (
        <div className="w-full flex items-center justify-between gap-2" style={{ maxWidth: size }}>
          <div className="flex gap-2">
            <button onClick={undo} disabled={!strokes.length}
              className="ui px-3 py-1 t-btn border rounded-full"
              style={{ borderColor: C.line, color: strokes.length ? C.dim : C.faint, opacity: strokes.length ? 1 : 0.5 }}>
              undo
            </button>
            <button onClick={clear} disabled={!strokes.length}
              className="ui px-3 py-1 t-btn border rounded-full"
              style={{ borderColor: C.line, color: strokes.length ? C.dim : C.faint, opacity: strokes.length ? 1 : 0.5 }}>
              clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="ui t-micro" style={{ color: C.faint }}>
              {strokes.length}{medians.length ? ` / ${medians.length}` : ""}
            </div>
            {/* Deliberately enabled for an unfinished character: handing in a
                wrong attempt is how the scheduler finds out you're shaky on it. */}
            {onSubmit && (
              <button onClick={() => onSubmit(verdict)} disabled={!strokes.length}
                className="ui px-4 py-1 t-btn border rounded-full"
                style={{
                  borderColor: strokes.length ? C.paper : C.line,
                  color: strokes.length ? C.paper : C.faint,
                  opacity: strokes.length ? 1 : 0.5,
                }}>
                submit
              </button>
            )}
          </div>
        </div>
      )}

      {/* While writing this is live coaching. Once graded the verdict belongs to
          whoever owns the session, so only the teaching aid stays. */}
      {(submitted || feedback) && (
        <div className="ui t-micro text-center" style={{ color: C.faint, maxWidth: size }}>
          {!submitted && feedback}
          {medians.length > 0 && (
            <>
              {!submitted && feedback ? " · " : ""}
              <button onClick={showMe} className="ui underline" style={{ color: C.dim }}>show me</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
