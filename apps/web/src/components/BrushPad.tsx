import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bristles, flyingWhite, inkColor, strokeOutline, tonProfile, travel, widthProfile,
  type InkParams, type SamplePoint,
} from "../lib/ink";
import { PAPER_TONES, paperTexture } from "../lib/paper";
import {
  glyphCanvasTransform, gradeAttempt, toCanvasSpace, toGlyphSpace,
  type CharacterStrokes, type Point, type Verdict,
} from "../lib/strokes";
import { C, isDarkTheme } from "../theme";

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
   */
  onSubmit?: (verdict: Verdict | null) => void;
  /** Graded already: the paper is read-only and the actions step aside. */
  submitted?: boolean;
  ink: InkParams;
  surface: Surface;
  mode: PadMode;
  showStrokeOrder: boolean;
  /** Position in a multi-character word, for the caption. 1-based. */
  step?: { index: number; total: number };
}

export function BrushPad({
  hanzi, target, onSubmit, submitted = false, ink, surface, mode, showStrokeOrder, step,
}: BrushPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(320);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<SamplePoint[] | null>(null);
  const startedAt = useRef(0);
  // The stroke index being demonstrated by "show me", or null when idle.
  const [teaching, setTeaching] = useState<number | null>(null);
  const dark = isDarkTheme();
  const tone = dark ? PAPER_TONES.dark : PAPER_TONES.light;

  // Square, as wide as the column allows — and no taller than the window can
  // spare. Width alone gave a pad that pushed its own controls off a laptop
  // screen, which is the thing this layout exists to avoid.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      // Side by side, the whole screen should fit without scrolling, so the pad
      // gives up height to make that true. Stacked — a phone — the tray sits
      // below the paper and the page scrolls anyway, so height buys nothing and
      // a pad shrunk to fit would just be a worse pad to write on.
      const sideBySide = window.innerWidth >= 640;
      const roomForHeight = sideBySide
        // Header, prompt, the pad's own controls, the feedback line, the skip
        // link and the nav bar come to roughly this much.
        ? Math.round((window.innerHeight - 500) * 0.98)
        : Infinity;
      setSize(Math.max(200, Math.min(el.clientWidth, 440, roomForHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
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
    // A generated sheet rather than a flat fill: fibres, tonal drift and a
    // vignette, so ink sits *on* something.
    ctx.drawImage(paperTexture(size, tone, ink.seed % 5), 0, 0, size, size);

    if (surface === "grid" || surface === "scroll") {
      ctx.strokeStyle = tone.rule;
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
      ctx.strokeStyle = tone.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(size * 0.12, size * 0.06, size * 0.76, size * 0.88);
    }

    // ——— the character being copied ———
    if (mode === "trace" && target?.strokes.length) {
      ctx.save();
      ctx.globalAlpha = dark ? 0.2 : 0.14;
      ctx.fillStyle = inkColor(0.5);
      // Shared with toCanvasSpace, so the outline you trace is exactly where
      // the medians being graded are.
      const { ty, sx, sy } = glyphCanvasTransform(size);
      ctx.translate(0, ty);
      ctx.scale(sx, sy);
      for (const path of target.strokes) ctx.fill(new Path2D(path));
      ctx.restore();
    }

    // ——— what has been written ———
    for (const s of strokes) paintStroke(ctx, s.points, ink, size);
    if (drawing.current) paintStroke(ctx, drawing.current, ink, size);

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
  }, [size, strokes, ink, surface, mode, target, showStrokeOrder, medians, teaching, tone, dark]);

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
      return target === null ? "no stroke data — write freely" : null;
    }
    if (!verdict || !strokes.length) return null;
    if (verdict.complete && verdict.orderOk) return "written as taught";
    if (verdict.complete) return "written in a different stroke order";
    if (verdict.stray) return `${verdict.matched} of ${verdict.expected} · ${verdict.stray} unrecognised`;
    return `${verdict.matched} of ${verdict.expected} strokes`;
  })();

  return (
    <div ref={wrapRef} className="w-full flex flex-col items-center gap-2">
      {step && step.total > 1 && (
        <div className="ui t-micro self-start" style={{ color: C.faint }}>
          character {step.index} of {step.total}
        </div>
      )}
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
          width: size, height: size, borderRadius: 2,
          border: `1px solid ${C.line}`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.06)",
          // The pad owns the gesture: without this a drag scrolls the page
          // instead of drawing, which makes writing impossible on a phone.
          touchAction: "none", cursor: submitted ? "default" : "crosshair",
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
                hand in
              </button>
            )}
          </div>
        </div>
      )}

      {feedback && (
        <div className="ui t-micro text-center" style={{ color: C.faint, maxWidth: size }}>
          {feedback}
          {medians.length > 0 && (
            <>
              {" · "}
              <button onClick={showMe} className="ui underline" style={{ color: C.dim }}>show me</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One stroke, laid down the way ink actually lands: a damp halo where the
 * paper drinks it, the body of the stroke in a tone that fades as the brush
 * spends what it is carrying, dry streaks carved back out, and the hairs that
 * trail off a fast tail.
 */
function paintStroke(
  ctx: CanvasRenderingContext2D, points: SamplePoint[], ink: InkParams, size: number,
): void {
  if (!points.length) return;
  const widths = widthProfile(points, ink, size);
  const tones = tonProfile(points, ink);
  const outline = strokeOutline(points, widths, ink.slant);
  const path = outlinePath(outline);

  // 潤 — water pushing into the fibres before the stroke itself lands on top.
  if (ink.water > 0.02) {
    ctx.save();
    ctx.globalAlpha = 0.08 + ink.water * 0.22;
    ctx.filter = `blur(${(0.5 + ink.water * 3.2).toFixed(2)}px)`;
    ctx.fillStyle = inkColor(ink.density * 0.7);
    ctx.fill(path);
    ctx.restore();
  }

  // The body. A gradient down the stroke carries the tone profile, so a long
  // stroke visibly runs out of ink rather than being one flat value.
  const head = points[0], tail = points[points.length - 1];
  const body = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
  const stops = 5;
  for (let i = 0; i <= stops; i++) {
    const at = i / stops;
    const idx = Math.min(tones.length - 1, Math.round(at * (tones.length - 1)));
    body.addColorStop(at, inkColor(tones[idx]));
  }
  ctx.fillStyle = body;
  ctx.fill(path);

  // 飛白 — carve the dry streaks back out with the paper showing through.
  const streaks = flyingWhite(points, ink);
  if (streaks.length) {
    const along = travel(points);
    ctx.save();
    ctx.clip(path);
    ctx.globalCompositeOperation = "destination-out";
    for (const streak of streaks) {
      const from = indexAt(along, streak.from);
      const to = indexAt(along, streak.to);
      if (to <= from) continue;
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const p = points[i];
        const n = normalAt(points, i);
        const w = widths[i] * streak.offset;
        const x = p.x + n[0] * w, y = p.y + n[1] * w;
        if (i === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = Math.max(0.5, widths[Math.round((from + to) / 2)] * streak.width);
      ctx.lineCap = "round";
      // Thin ink, not bare paper: a dry patch still holds some pigment, and
      // punching a hole straight through looks like damage.
      ctx.globalAlpha = 0.22 + streak.width * 0.9;
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const hair of bristles(points, widths, ink)) {
    ctx.strokeStyle = inkColor(tones[tones.length - 1] * 0.85);
    ctx.lineWidth = hair.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hair.from[0], hair.from[1]);
    ctx.lineTo(hair.to[0], hair.to[1]);
    ctx.stroke();
  }
}

/** The outline as a smooth closed path — a polyline shows every facet. */
function outlinePath(outline: [number, number][]): Path2D {
  const path = new Path2D();
  if (outline.length < 3) {
    outline.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    return path;
  }
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x, y] = outline[i];
    const [nx, ny] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  path.closePath();
  return path;
}

/** Nearest sample index to a fractional position along the stroke. */
function indexAt(along: number[], at: number): number {
  let best = 0;
  for (let i = 1; i < along.length; i++) {
    if (Math.abs(along[i] - at) < Math.abs(along[best] - at)) best = i;
  }
  return best;
}

function normalAt(points: SamplePoint[], i: number): [number, number] {
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(points.length - 1, i + 1)];
  const dx = next.x - prev.x, dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}
