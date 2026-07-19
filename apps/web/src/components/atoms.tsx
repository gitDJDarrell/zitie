import { C } from "../theme";

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

export function SectionLabel({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <span className="hz text-base" style={{ color: C.dim }}>{zh}</span>
      <span className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>{en}</span>
    </div>
  );
}

export function Empty({ zh, text }: { zh: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="hz text-5xl" style={{ color: C.faint }}>{zh}</div>
      <p className="ui text-xs text-center max-w-xs leading-relaxed" style={{ color: C.dim }}>{text}</p>
    </div>
  );
}
