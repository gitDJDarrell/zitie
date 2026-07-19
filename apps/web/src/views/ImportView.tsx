import { useState } from "react";
import { SectionLabel } from "../components/atoms";
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
    <div className="flex flex-col gap-4">
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
