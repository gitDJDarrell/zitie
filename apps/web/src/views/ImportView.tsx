import { useRef, useState } from "react";
import { api } from "../api/client";
import { SectionLabel } from "../components/atoms";
import { DEX_BANDS, DEX_INDEX } from "../data/dex";
import { fileToApiImage } from "../lib/image";
import { C } from "../theme";
import type { Card } from "../types";

interface GenCard {
  hanzi: string; pinyin: string; meaning: string; pos: string[]; compound: boolean;
  radical?: string; strokes?: number;
  examples?: { zh: string; py?: string; en?: string }[]; notes?: string;
}

interface RevealItem { card: GenCard; isNew: boolean }

/* ————————————————— import ————————————————— */
const SCHEMA_EXAMPLE = `[
  { "hanzi": "水", "pinyin": "shuǐ", "meaning": "water",
    "pos": ["noun"], "compound": false,
    "radical": "水", "strokes": 4,
    "examples": [{ "zh": "热水", "py": "rè shuǐ", "en": "hot water" }],
    "notes": "Pictograph of a flowing stream." }
]`;

export function ImportView({ bank, onImport }: {
  bank: Card[]; onImport: (items: unknown[]) => Promise<{ added: number; updated: number }>;
}) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [aiText, setAiText] = useState("");
  const [aiImage, setAiImage] = useState<{ mediaType: string; data: string; name: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // capture reveal sequence: entries are already imported; this walks through
  // them one at a time. idx === items.length renders the summary screen.
  const [reveal, setReveal] = useState<{ items: RevealItem[]; idx: number } | null>(null);

  async function attachImage(file: File) {
    setAiMsg(null);
    try {
      const img = await fileToApiImage(file);
      setAiImage({ ...img, name: file.name || "pasted image" });
    } catch (e: any) {
      setAiMsg({ ok: false, t: e.message || "Could not read that image." });
    }
  }

  function onAiPaste(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find(i => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void attachImage(file);
    }
  }

  async function generate() {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const { cards } = await api.aiExtract({
        text: aiText.trim() || undefined,
        image: aiImage ? { mediaType: aiImage.mediaType, data: aiImage.data } : undefined,
      });
      if (!cards.length) {
        setAiMsg({ ok: false, t: "No Chinese vocabulary found in that input." });
        return;
      }
      // Snapshot before import so first-time catches can be marked NEW.
      const before = new Set(bank.map(c => c.hanzi));
      await onImport(cards);
      const items = (cards as GenCard[]).map(card => ({ card, isNew: !before.has(card.hanzi) }));
      // New catches first — they're the exciting part of a bulk page.
      items.sort((a, b) => Number(b.isNew) - Number(a.isNew));
      setReveal({ items, idx: 0 });
      setAiText("");
      setAiImage(null);
    } catch (e: any) {
      setAiMsg({ ok: false, t: e.message || "Generation failed." });
    } finally {
      setAiBusy(false);
    }
  }

  async function run() {
    let arr: unknown;
    try {
      arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error("Expected a JSON array.");
    } catch (e: any) {
      setMsg({ ok: false, t: e.message });
      return;
    }
    setBusy(true);
    try {
      const { added, updated } = await onImport(arr);
      setMsg({ ok: true, t: `Imported: ${added} new, ${updated} expanded/updated.` });
      setText("");
    } catch (e: any) {
      setMsg({ ok: false, t: e.message || "Import failed." });
    } finally {
      setBusy(false);
    }
  }

  function exportBank() {
    const out = JSON.stringify(bank.map(({ id, added, ...rest }) => rest), null, 2);
    navigator.clipboard && navigator.clipboard.writeText(out);
    setMsg({ ok: true, t: "Bank copied to clipboard as JSON." });
  }

  /* ——— capture reveal sequence ——— */
  if (reveal) {
    const { items, idx } = reveal;
    const newCount = items.filter(i => i.isNew).length;

    if (idx >= items.length) {
      return (
        <div className="flex flex-col items-center gap-5 pt-10">
          <div className="hz text-5xl" style={{ color: C.paper }}>获</div>
          <p className="ui text-sm text-center leading-relaxed" style={{ color: C.dim }}>
            Collection updated —{" "}
            <span style={{ color: C.paper }}>{newCount}</span> new{" "}
            {newCount === 1 ? "entry" : "entries"} caught
            {items.length - newCount > 0 && <>, {items.length - newCount} expanded</>}.
          </p>
          <button onClick={() => setReveal(null)}
            className="ui px-8 py-2 text-xs uppercase tracking-widest border rounded"
            style={{ borderColor: C.paper, color: C.paper }}>Done</button>
        </div>
      );
    }

    const { card, isNew } = items[idx];
    const slot = DEX_INDEX.get(card.hanzi);
    const band = slot ? DEX_BANDS.find(b => b.id === slot.bandId) : undefined;

    return (
      <div className="flex flex-col items-center gap-5 pt-4">
        <div className="w-full max-w-sm flex justify-between items-baseline ui text-xs tracking-widest uppercase" style={{ color: C.faint }}>
          <span>entry {idx + 1} of {items.length}</span>
          <button onClick={() => setReveal({ items, idx: items.length })} className="px-1 py-1" style={{ color: C.faint }}>
            skip all »
          </button>
        </div>

        <div key={idx} className="relative w-full max-w-sm rounded-lg px-6 py-10 flex flex-col items-center gap-4"
          style={{ background: C.ink2, border: `1px solid ${C.line}`, minHeight: 340 }}>
          {isNew && (
            <div className="stamp absolute top-3 right-3 ui text-xs uppercase tracking-widest px-2 py-1 border-2 rounded"
              style={{ borderColor: C.paper, color: C.paper, transform: "rotate(-8deg)" }}>
              new
            </div>
          )}
          <div className="ui text-xs uppercase tracking-widest" style={{ color: C.faint }}>
            {slot
              ? <>图鉴 No. {String(slot.n).padStart(4, "0")} · {band?.label}</>
              : card.compound ? "compound · beyond the dex" : "beyond the dex"}
          </div>
          <div className="stamp hz font-black" style={{ color: C.paper, fontSize: card.hanzi.length > 2 ? 56 : 88, lineHeight: 1.1 }}>
            {card.hanzi}
          </div>
          <div className="mono text-xl" style={{ color: C.paper }}>{card.pinyin}</div>
          <div className="ui text-sm text-center leading-relaxed" style={{ color: C.paper }}>{card.meaning}</div>
          <div className="ui text-xs" style={{ color: C.faint }}>
            {card.pos.join(" · ")}
            {(card.radical || card.strokes) && (
              <> — {card.radical ? `radical ${card.radical}` : ""}{card.radical && card.strokes ? " · " : ""}{card.strokes ? `${card.strokes} strokes` : ""}</>
            )}
          </div>
          {card.examples && card.examples.length > 0 && (
            <div className="w-full flex flex-col gap-1 pt-3 mt-1" style={{ borderTop: `1px solid ${C.ink3}` }}>
              {card.examples.slice(0, 2).map((ex, i) => (
                <div key={i} className="text-center">
                  <span className="hz text-sm" style={{ color: C.paper }}>{ex.zh}</span>
                  {ex.py && <span className="mono text-xs" style={{ color: C.dim }}>{" "}{ex.py}</span>}
                  {ex.en && <div className="ui text-xs" style={{ color: C.dim }}>{ex.en}</div>}
                </div>
              ))}
            </div>
          )}
          {!isNew && (
            <div className="ui text-xs italic" style={{ color: C.faint }}>already collected — entry expanded</div>
          )}
        </div>

        <button onClick={() => setReveal({ items, idx: idx + 1 })}
          className="ui px-10 py-3 text-xs uppercase tracking-widest border rounded"
          style={{ borderColor: C.paper, color: C.paper }}>
          {idx + 1 === items.length ? "Finish" : "Next →"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel zh="释" en="generate with ai" />
        <p className="ui text-xs leading-relaxed" style={{ color: C.dim }}>
          Type or paste vocabulary in any form — a word list, sentences, or a screenshot of a
          textbook page (paste it right here, or attach a file). Each catch is added to your
          collection and revealed one by one. Existing entries only ever expand — nothing is lost.
        </p>
        <textarea
          value={aiText} onChange={e => setAiText(e.target.value)} onPaste={onAiPaste}
          rows={3} placeholder={"Paste hanzi, a word list, or a screenshot here\ne.g. 我喜欢喝热茶"}
          className="hz w-full p-3 text-sm rounded border bg-transparent"
          style={{ borderColor: C.line, color: C.paper }}
        />
        <input
          ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void attachImage(f); e.target.value = ""; }}
        />
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={generate} disabled={aiBusy || (!aiText.trim() && !aiImage)}
            className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
            style={{ borderColor: C.paper, color: C.paper, opacity: aiBusy || (!aiText.trim() && !aiImage) ? 0.35 : 1 }}>
            {aiBusy ? "Generating…" : "Generate entries"}
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={aiBusy}
            className="ui px-4 py-2 text-xs uppercase tracking-widest border rounded"
            style={{ borderColor: C.line, color: C.dim }}>
            Attach screenshot
          </button>
          {aiImage && (
            <span className="ui text-xs flex items-center gap-1" style={{ color: C.dim }}>
              {aiImage.name}
              <button onClick={() => setAiImage(null)} aria-label="Remove image"
                className="px-1" style={{ color: C.faint }}>✕</button>
            </span>
          )}
        </div>
        {aiBusy && (
          <p className="ui text-xs" style={{ color: C.faint }}>
            Reading the vocabulary and writing detailed entries — this can take a minute for a full page…
          </p>
        )}
        {aiMsg && <div className="ui text-xs" style={{ color: aiMsg.ok ? C.dim : C.cinnabar }}>{aiMsg.t}</div>}
      </div>

      <div className="w-full h-px" style={{ background: C.ink3 }} />

      <SectionLabel zh="入" en="import vocabulary" />
      <p className="ui text-xs leading-relaxed" style={{ color: C.dim }}>
        Paste a JSON array. Required per entry: <span className="mono">hanzi</span>, <span className="mono">pinyin</span>, <span className="mono">meaning</span>. Optional: <span className="mono">pos</span>, <span className="mono">compound</span>, <span className="mono">radical</span>, <span className="mono">strokes</span>, <span className="mono">examples</span>, <span className="mono">notes</span>. Re-importing an existing hanzi expands it: new fields fill in, examples and pos merge without duplicates, and omitted fields are kept as-is.
      </p>
      <pre className="mono text-xs p-3 rounded overflow-x-auto" style={{ background: C.ink2, color: C.faint, border: `1px solid ${C.line}` }}>{SCHEMA_EXAMPLE}</pre>
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        rows={8} placeholder="Paste JSON here"
        className="mono w-full p-3 text-xs rounded border bg-transparent"
        style={{ borderColor: C.line, color: C.paper }}
      />
      <div className="flex gap-3">
        <button onClick={run} disabled={!text.trim() || busy}
          className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
          style={{ borderColor: C.paper, color: C.paper, opacity: text.trim() && !busy ? 1 : 0.35 }}>
          {busy ? "Importing…" : "Import"}
        </button>
        <button onClick={exportBank} disabled={!bank.length}
          className="ui px-6 py-2 text-xs uppercase tracking-widest border rounded"
          style={{ borderColor: C.line, color: C.dim, opacity: bank.length ? 1 : 0.35 }}>Copy bank</button>
      </div>
      {msg && <div className="ui text-xs" style={{ color: msg.ok ? C.dim : C.cinnabar }}>{msg.t}</div>}
    </div>
  );
}
