import { useRef, useState } from "react";
import { api } from "../api/client";
import { SectionLabel } from "../components/atoms";
import { fileToApiImage } from "../lib/image";
import { C } from "../theme";
import type { Card } from "../types";

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
      setText(JSON.stringify(cards, null, 2));
      setAiMsg({ ok: true, t: `Generated ${cards.length} entr${cards.length === 1 ? "y" : "ies"} — review below, edit if needed, then press Import.` });
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel zh="释" en="generate with ai" />
        <p className="ui text-xs leading-relaxed" style={{ color: C.dim }}>
          Type or paste vocabulary in any form — a word list, sentences, or a screenshot of a
          textbook page (paste it right here, or attach a file). Full entries with pinyin,
          meanings, examples, and notes are generated for review before anything enters the bank.
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
