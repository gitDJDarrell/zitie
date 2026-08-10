import { speak, speechHint, speechStatus } from "../lib/speech";
import { GRADE_GLYPH, STRENGTH_MAX, strengthLabel, strengthOf } from "../lib/srs";
import { C } from "../theme";
import type { SeenRecord } from "../types";

/* ————————————————— small UI atoms ————————————————— */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="ui px-3 py-1 text-xs tracking-wide rounded-full border"
      style={{
        borderColor: active ? C.paper : C.line,
        color: active ? C.ink : C.dim,
        background: active ? C.paper : "transparent",
      }}
    >{children}</button>
  );
}

export function StarBtn({ starred, onClick }: { starred: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={starred ? "Unstar" : "Mark as tricky"}
      className="absolute top-2 right-2 px-2 py-1 text-xl"
      style={{ color: starred ? C.cinnabar : C.faint, zIndex: 1 }}>
      {starred ? "★" : "☆"}
    </button>
  );
}

// Icon-only star toggle for filter rows — same glyph as StarBtn, but sized
// and bordered like a Chip so it sits naturally in a row of them.
export function StarToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active}
      className="w-8 h-8 flex items-center justify-center text-base rounded-full border"
      style={{
        borderColor: active ? C.paper : C.line,
        color: active ? C.ink : C.faint,
        background: active ? C.paper : "transparent",
      }}>
      {active ? "★" : "☆"}
    </button>
  );
}

// Segmented toggle switch — a single pill with N labeled positions and a
// sliding active segment, for small closed-set choices (seen/unseen/all).
export function Switch<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border p-0.5" style={{ borderColor: C.line }} role="radiogroup">
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          role="radio" aria-checked={value === opt.value}
          className="ui px-3 py-1 text-xs tracking-wide rounded-full"
          style={{
            background: value === opt.value ? C.paper : "transparent",
            color: value === opt.value ? C.ink : C.dim,
          }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Pronounce-aloud button, on every screen that shows a character's answer.
export function SpeakBtn({ text, size = "base", className, style }: {
  text: string; size?: "base" | "lg"; className?: string; style?: React.CSSProperties;
}) {
  const status = speechStatus();
  const ready = status === "ready";
  // Deliberately still rendered when there's no voice. Returning null here made
  // pronunciation vanish from every screen at once on any machine without a
  // Chinese language pack — which is most Windows machines — and an absent
  // control is indistinguishable from a feature that was never built. Muted and
  // explained beats silently gone.
  return (
    <button
      onClick={e => { e.stopPropagation(); if (ready) speak(text); }}
      disabled={!ready}
      aria-label={ready ? `Play pronunciation of ${text}` : `Pronunciation unavailable — ${speechHint(status)}`}
      title={ready ? undefined : speechHint(status) ?? undefined}
      className={`px-2 py-1 leading-none ${size === "lg" ? "text-2xl" : "text-base"} ${className ?? ""}`}
      style={{ color: C.faint, opacity: ready ? 1 : 0.4, cursor: ready ? "pointer" : "default", ...style }}>
      {ready ? "🔊" : "🔇"}
    </button>
  );
}

// Monochrome range slider with discrete stops. Native <input type=range> for
// the pointer/keyboard/a11y behaviour, restyled to match the app.
export function Slider({ value, max, onChange, label, ticks }: {
  value: number; max: number; onChange: (v: number) => void; label: string; ticks?: string[];
}) {
  return (
    <div className="w-full flex flex-col gap-1">
      <input
        type="range" min={0} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={label}
        className="zt-slider w-full"
      />
      {ticks && (
        <div className="flex justify-between px-0.5" aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={i} className="ui" style={{ fontSize: 11, color: i === value ? C.paper : C.faint }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Collapsible section. Collapsed by default so the study screen leads with
// "start a session" rather than a wall of filter chips.
export function Collapsible({ label, summary, open, onToggle, children }: {
  label: string; summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="w-full flex flex-col gap-3">
      <button onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 py-1"
        style={{ color: C.dim }}>
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="ui t-label" style={{ color: C.faint }}>{label}</span>
          {summary && <span className="ui t-meta truncate" style={{ color: C.dim }}>{summary}</span>}
        </span>
        <span aria-hidden="true" className="ui shrink-0" style={{ color: C.faint, fontSize: 11 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && children}
    </div>
  );
}

// Multi-select dropdown built on a native <details> disclosure — keeps the
// panel inline (no portal/z-index games) and closes on outside click for free.
export function MultiSelect({ label, options, selected, onChange, allLabel = "All" }: {
  label: string;
  options: { id: string; label: string; count?: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
}) {
  const chosen = new Set(selected);
  const summary = !selected.length
    ? allLabel
    : options.filter(o => chosen.has(o.id)).map(o => o.label).join(", ") || allLabel;

  function toggle(id: string) {
    onChange(chosen.has(id) ? selected.filter(x => x !== id) : [...selected, id]);
  }

  return (
    <details className="w-full zt-details">
      <summary className="flex items-center justify-between gap-2 px-3 py-2 rounded border cursor-pointer"
        style={{ borderColor: C.line }}>
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="ui t-label" style={{ color: C.faint }}>{label}</span>
          <span className="ui t-meta truncate" style={{ color: C.paper }}>{summary}</span>
        </span>
        <span aria-hidden="true" className="ui shrink-0" style={{ color: C.faint, fontSize: 11 }}>▼</span>
      </summary>
      <div className="flex flex-col gap-1 mt-1 p-2 rounded border" style={{ borderColor: C.line, background: C.ink2 }}>
        <button onClick={() => onChange([])}
          className="flex items-center justify-between px-2 py-1.5 rounded"
          style={{ background: selected.length ? "transparent" : C.ink3 }}>
          <span className="ui t-meta" style={{ color: C.paper }}>{allLabel}</span>
          {!selected.length && <span aria-hidden="true" className="ui t-meta" style={{ color: C.paper }}>✓</span>}
        </button>
        {options.map(o => (
          <button key={o.id} onClick={() => toggle(o.id)} role="checkbox" aria-checked={chosen.has(o.id)}
            className="flex items-center justify-between px-2 py-1.5 rounded"
            style={{ background: chosen.has(o.id) ? C.ink3 : "transparent" }}>
            <span className="ui t-meta" style={{ color: C.paper }}>
              {o.label}
              {o.count != null && <span style={{ color: C.faint }}> · {o.count}</span>}
            </span>
            {chosen.has(o.id) && <span aria-hidden="true" className="ui t-meta" style={{ color: C.paper }}>✓</span>}
          </button>
        ))}
      </div>
    </details>
  );
}

// Rating readout: a mastery bar plus the grade you last pressed. Two different
// questions — "how well do I know this" and "what did I rate it" — so they get
// two marks rather than one conflated score.
export function Rating({ rec, compact = false }: { rec: SeenRecord | undefined; compact?: boolean }) {
  const level = strengthOf(rec);
  const grade = rec?.lastGrade ?? null;
  const label = `${strengthLabel(level)}${grade ? `, last rated ${grade}` : ""}`;

  if (compact) {
    // 56px dex tiles: segmented bar only, with the grade folded into the title.
    return (
      <span className="flex gap-px items-center" role="img" aria-label={label} title={label}>
        {Array.from({ length: STRENGTH_MAX }, (_, i) => (
          <span key={i} style={{
            width: 5, height: 3, borderRadius: 1,
            background: i < level ? "currentColor" : "transparent",
            border: i < level ? "none" : `1px solid currentColor`,
            opacity: i < level ? 0.9 : 0.3,
          }} />
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className="flex gap-px items-center" role="img" aria-label={label}>
        {Array.from({ length: STRENGTH_MAX }, (_, i) => (
          <span key={i} style={{
            width: 6, height: 4, borderRadius: 1,
            background: i < level ? C.paper : "transparent",
            border: i < level ? "none" : `1px solid ${C.line}`,
          }} />
        ))}
      </span>
      {grade && (
        <span className="hz" aria-hidden="true" style={{ color: C.faint, fontSize: 12 }}>
          {GRADE_GLYPH[grade]}
        </span>
      )}
    </span>
  );
}

export function SectionLabel({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <span className="hz text-base" style={{ color: C.dim }}>{zh}</span>
      <span className="ui t-label" style={{ color: C.faint }}>{en}</span>
    </div>
  );
}

export function Empty({ zh, text }: { zh: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="hz text-5xl" style={{ color: C.faint }}>{zh}</div>
      <p className="ui t-body text-center max-w-xs" style={{ color: C.dim }}>{text}</p>
    </div>
  );
}
