import { useRef, useState } from "react";
import { api } from "../api/client";
import { SectionLabel } from "../components/atoms";
import { DEX_LEVELS, DEX_INDEX } from "../data/dex";
import { captureNativePhoto, isNativePlatform } from "../lib/camera";
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
export function ImportView({ bank, onImport }: {
  bank: Card[]; onImport: (items: unknown[]) => Promise<{ added: number; updated: number }>;
}) {
  const [aiText, setAiText] = useState("");
  const [aiImage, setAiImage] = useState<{ mediaType: string; data: string; name: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // capture reveal sequence: entries are already imported; this walks through
  // them one at a time. idx === items.length renders the summary screen.
  const [reveal, setReveal] = useState<{ items: RevealItem[]; idx: number } | null>(null);

  // Extracted-but-not-yet-imported entries, awaiting the user's tap-to-include
  // selection. Nothing touches the bank until confirmImport().
  const [pending, setPending] = useState<GenCard[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function attachImage(file: File) {
    setAiMsg(null);
    try {
      const img = await fileToApiImage(file);
      setAiImage({ ...img, name: file.name || "pasted image" });
    } catch (e: any) {
      setAiMsg({ ok: false, t: e.message || "Could not read that image." });
    }
  }

  // Native shell → the @capacitor/camera plugin; web → the <input capture>
  // fallback (which opens the camera on mobile browsers, a file dialog on desktop).
  async function takePhoto() {
    if (isNativePlatform()) {
      const file = await captureNativePhoto();
      if (file) void attachImage(file);
    } else {
      cameraInputRef.current?.click();
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
      // Hand off to the selection step — nothing is imported yet.
      const generated = cards as GenCard[];
      setPending(generated);
      setSelected(new Set(generated.map((_, i) => i))); // everything selected by default
      setAiText("");
      setAiImage(null);
    } catch (e: any) {
      setAiMsg({ ok: false, t: e.message || "Generation failed." });
    } finally {
      setAiBusy(false);
    }
  }

  function toggleSelected(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function confirmImport() {
    if (!pending || !selected.size) return;
    const chosen = pending.filter((_, i) => selected.has(i));
    setAiBusy(true);
    setAiMsg(null);
    try {
      const before = new Set(bank.map(c => c.hanzi));
      await onImport(chosen);
      const items = chosen.map(card => ({ card, isNew: !before.has(card.hanzi) }));
      // New catches first — they're the exciting part of a bulk page.
      items.sort((a, b) => Number(b.isNew) - Number(a.isNew));
      setPending(null);
      setSelected(new Set());
      setReveal({ items, idx: 0 });
    } catch (e: any) {
      setAiMsg({ ok: false, t: e.message || "Import failed." });
    } finally {
      setAiBusy(false);
    }
  }

  function cancelSelection() {
    setPending(null);
    setSelected(new Set());
  }

  /* ——— selection: tap to include/exclude each extracted word ——— */
  if (pending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <SectionLabel zh="选" en="select entries" />
          <span className="ui text-xs" style={{ color: C.faint }}>{selected.size} / {pending.length} selected</span>
        </div>
        <p className="ui t-body" style={{ color: C.dim }}>
          Tap a word to leave it out. Everything's selected by default — add the rest to your collection when you're ready.
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))" }}>
          {pending.map((card, i) => {
            const isSel = selected.has(i);
            return (
              <button key={i} onClick={() => toggleSelected(i)}
                aria-pressed={isSel}
                aria-label={`${card.hanzi} — ${isSel ? "included, tap to exclude" : "excluded, tap to include"}`}
                className="flex flex-col items-center gap-0.5 py-3 px-1 rounded"
                style={{ background: isSel ? C.paper : "transparent", border: `1px solid ${isSel ? C.paper : C.ink3}` }}>
                <span className="hz text-2xl leading-tight" style={{ color: isSel ? C.ink : C.paper }}>{card.hanzi}</span>
                <span className="mono" style={{ fontSize: 10, color: isSel ? C.ink : C.dim }}>{card.pinyin}</span>
                <span className="ui truncate w-full text-center" style={{ fontSize: 11, color: isSel ? C.ink : C.faint }}>{card.meaning}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={confirmImport} disabled={!selected.size || aiBusy}
            className="ui px-6 py-2 t-btn border rounded"
            style={{ borderColor: C.paper, color: C.paper, opacity: selected.size && !aiBusy ? 1 : 0.35 }}>
            {aiBusy ? "Adding…" : `Add ${selected.size} to collection`}
          </button>
          <button onClick={cancelSelection} disabled={aiBusy}
            className="ui px-4 py-2 t-btn border rounded"
            style={{ borderColor: C.line, color: C.dim }}>
            Cancel
          </button>
          <span className="w-px h-4" style={{ background: C.line }} />
          <button onClick={() => setSelected(new Set(pending.map((_, i) => i)))}
            className="ui text-xs" style={{ color: C.faint }}>select all</button>
          <button onClick={() => setSelected(new Set())}
            className="ui text-xs" style={{ color: C.faint }}>select none</button>
        </div>
        {aiMsg && <div className="ui text-xs" style={{ color: aiMsg.ok ? C.dim : C.cinnabar }}>{aiMsg.t}</div>}
      </div>
    );
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
            className="ui px-8 py-2 t-btn border rounded"
            style={{ borderColor: C.paper, color: C.paper }}>Done</button>
        </div>
      );
    }

    const { card, isNew } = items[idx];
    const slot = DEX_INDEX.get(card.hanzi);
    const level = slot ? DEX_LEVELS.find(l => l.id === slot.levelId) : undefined;

    return (
      <div className="flex flex-col items-center gap-5 pt-4">
        <div className="w-full max-w-sm flex justify-between items-baseline ui t-label" style={{ color: C.faint }}>
          <span>entry {idx + 1} of {items.length}</span>
          <button onClick={() => setReveal({ items, idx: items.length })} className="px-1 py-1" style={{ color: C.faint }}>
            skip all »
          </button>
        </div>

        <div key={idx} className="relative w-full max-w-sm rounded-lg px-6 py-10 flex flex-col items-center gap-4"
          style={{ background: C.ink2, border: `1px solid ${C.line}`, minHeight: 340 }}>
          {isNew && (
            <div className="stamp absolute top-3 right-3 ui t-label px-2 py-1 border-2 rounded"
              style={{ borderColor: C.paper, color: C.paper, transform: "rotate(-8deg)" }}>
              new
            </div>
          )}
          <div className="ui t-label" style={{ color: C.faint }}>
            {slot
              ? <>图鉴 No. {String(slot.n).padStart(4, "0")} · {level?.label}</>
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
          className="ui px-10 py-3 t-label border rounded"
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
        <p className="ui t-body" style={{ color: C.dim }}>
          Type or paste vocabulary in any form — a word list, sentences, a screenshot pasted
          right here, or a photo of a textbook page. You'll pick which words to keep before
          anything's added. Existing entries only ever expand — nothing is lost.
        </p>
        <textarea
          value={aiText} onChange={e => setAiText(e.target.value)} onPaste={onAiPaste}
          rows={3} placeholder={"Paste hanzi, a word list, or a screenshot here\ne.g. 我喜欢喝热茶"}
          className="hz w-full p-3 text-sm rounded border bg-transparent"
          style={{ borderColor: C.line, color: C.paper }}
        />
        {/* Gallery/file picker (no capture) */}
        <input
          ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void attachImage(f); e.target.value = ""; }}
        />
        {/* Camera capture: `capture="environment"` opens the rear camera
            directly on mobile browsers. On desktop the attribute is ignored and
            it falls back to a file dialog. When Capacitor lands (Track C) the
            "Take photo" button switches to the native @capacitor/camera plugin;
            both paths feed the same fileToApiImage pipeline. */}
        <input
          ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void attachImage(f); e.target.value = ""; }}
        />
        <div className="flex gap-3 items-center flex-wrap">
          <button onClick={generate} disabled={aiBusy || (!aiText.trim() && !aiImage)}
            className="ui px-6 py-2 t-btn border rounded"
            style={{ borderColor: C.paper, color: C.paper, opacity: aiBusy || (!aiText.trim() && !aiImage) ? 0.35 : 1 }}>
            {aiBusy ? "Generating…" : "Generate entries"}
          </button>
          <button onClick={takePhoto} disabled={aiBusy}
            className="ui px-4 py-2 t-btn border rounded"
            style={{ borderColor: C.line, color: C.dim }}>
            Take photo
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={aiBusy}
            className="ui px-4 py-2 t-btn border rounded"
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
    </div>
  );
}
