import { useState } from "react";
import { Chip, Empty } from "../components/atoms";
import { CardDetail } from "../components/CardDetail";
import { FilterBar } from "../components/FilterBar";
import { applyFilters, DAY, type Filters } from "../lib/filters";
import { C } from "../theme";
import type { Card, SeenMap } from "../types";

/* ————————————————— browse ————————————————— */
export function BrowseView({
  bank, srs, filters, setFilters, posList, onDelete, onDeleteMany, onClearAll, onResetSeen, onToggleStar,
  stack, onAddToStack, onRemoveFromStack, onClearStack, onStudyStack,
}: {
  bank: Card[]; srs: SeenMap; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  posList: string[]; onDelete: (id: string) => void; onDeleteMany: (ids: string[]) => void;
  onClearAll: () => void; onResetSeen: (ids: string[] | null) => void; onToggleStar: (id: string) => void;
  stack: string[]; onAddToStack: (ids: string[]) => void; onRemoveFromStack: (ids: string[]) => void;
  onClearStack: () => void; onStudyStack: () => void;
}) {
  const [view, setView] = useState<"all" | "stack">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClearStack, setConfirmClearStack] = useState(false);

  const byId = new Map(bank.map(c => [c.id, c]));
  const stackSet = new Set(stack);
  const allRows = applyFilters(bank, srs, filters);
  // preserve stack order — that order is what a stack study session uses
  const stackRows = stack.map(id => byId.get(id)).filter((c): c is Card => !!c);
  const rows = view === "stack" ? stackRows : allRows;
  const seenCount = bank.filter(c => srs[c.id]).length;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function selectAllFiltered() { setSelected(new Set(rows.map(c => c.id))); }
  function deleteSelected() {
    if (!selected.size) return;
    onDeleteMany([...selected]);
    exitSelect();
  }
  function clearAll() {
    if (!confirmClear) { setConfirmClear(true); setConfirmReset(false); return; }
    onClearAll();
    setConfirmClear(false);
    exitSelect();
  }
  function resetSeen() {
    if (!confirmReset) { setConfirmReset(true); setConfirmClear(false); return; }
    onResetSeen(null);
    setConfirmReset(false);
  }
  function resetSelected() {
    if (!selected.size) return;
    onResetSeen([...selected]);
    exitSelect();
  }
  function addSelectedToStack() {
    if (!selected.size) return;
    onAddToStack([...selected]);
    exitSelect();
  }
  function removeSelectedFromStack() {
    if (!selected.size) return;
    onRemoveFromStack([...selected]);
    exitSelect();
  }
  function clearStack() {
    if (!confirmClearStack) { setConfirmClearStack(true); return; }
    onClearStack();
    setConfirmClearStack(false);
    exitSelect();
  }
  function switchView(v: "all" | "stack") {
    setView(v);
    exitSelect();
    setConfirmClear(false); setConfirmReset(false); setConfirmClearStack(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Chip active={view === "all"} onClick={() => switchView("all")}>all cards</Chip>
        <Chip active={view === "stack"} onClick={() => switchView("stack")}>
          {"▤"} stack{stack.length ? ` (${stack.length})` : ""}
        </Chip>
      </div>

      {view === "all" && <FilterBar filters={filters} setFilters={setFilters} posList={posList} />}

      {view === "stack" && stack.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="ui text-xs leading-relaxed" style={{ color: C.faint }}>
            Preselected for a future session, in this order. Independent of ★ — starring keeps
            flagging tricky cards for review; the stack is a specific lineup you're building.
          </p>
          <button onClick={onStudyStack}
            className="ui px-4 py-2 text-xs uppercase tracking-widest border rounded shrink-0"
            style={{ borderColor: C.paper, color: C.paper }}>
            {"▸"} study this stack
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="ui text-xs" style={{ color: C.faint }}>
          {selectMode ? `${selected.size} selected` : `${rows.length} ${view === "stack" ? "in stack" : `of ${bank.length} characters`}`}
        </div>
        {rows.length > 0 && (
          <div className="flex gap-2">
            {!selectMode ? (
              <>
                <button onClick={() => setSelectMode(true)}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: C.line, color: C.dim }}>Select</button>
                {view === "all" ? (
                  <>
                    <button onClick={resetSeen} onBlur={() => setConfirmReset(false)} disabled={!seenCount}
                      className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                      style={{ borderColor: confirmReset ? C.cinnabar : C.line, color: confirmReset ? C.cinnabar : C.dim, opacity: seenCount ? 1 : 0.5 }}>
                      {confirmReset ? "Tap again to reset" : "Reset seen"}
                    </button>
                    <button onClick={clearAll} onBlur={() => setConfirmClear(false)}
                      className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                      style={{ borderColor: confirmClear ? C.cinnabar : C.line, color: confirmClear ? C.cinnabar : C.dim }}>
                      {confirmClear ? "Tap again to clear all" : "Clear all"}
                    </button>
                  </>
                ) : (
                  <button onClick={clearStack} onBlur={() => setConfirmClearStack(false)}
                    className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                    style={{ borderColor: confirmClearStack ? C.cinnabar : C.line, color: confirmClearStack ? C.cinnabar : C.dim }}>
                    {confirmClearStack ? "Tap again to empty stack" : "Empty stack"}
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={selectAllFiltered}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: C.line, color: C.dim }}>All shown</button>
                {view === "all" ? (
                  <>
                    <button onClick={addSelectedToStack} disabled={!selected.size}
                      className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                      style={{ borderColor: C.line, color: selected.size ? C.dim : C.faint, opacity: selected.size ? 1 : 0.5 }}>
                      {"▤"} Add to stack ({selected.size})
                    </button>
                    <button onClick={resetSelected} disabled={!selected.size}
                      className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                      style={{ borderColor: C.line, color: selected.size ? C.dim : C.faint, opacity: selected.size ? 1 : 0.5 }}>
                      Reset ({selected.size})
                    </button>
                    <button onClick={deleteSelected} disabled={!selected.size}
                      className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                      style={{ borderColor: selected.size ? C.cinnabar : C.line, color: selected.size ? C.cinnabar : C.faint, opacity: selected.size ? 1 : 0.5 }}>
                      Delete ({selected.size})
                    </button>
                  </>
                ) : (
                  <button onClick={removeSelectedFromStack} disabled={!selected.size}
                    className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                    style={{ borderColor: selected.size ? C.cinnabar : C.line, color: selected.size ? C.cinnabar : C.faint, opacity: selected.size ? 1 : 0.5 }}>
                    Remove from stack ({selected.size})
                  </button>
                )}
                <button onClick={exitSelect}
                  className="ui px-3 py-1 text-xs uppercase tracking-widest border rounded"
                  style={{ borderColor: C.line, color: C.dim }}>Cancel</button>
              </>
            )}
          </div>
        )}
      </div>

      {view === "all" && !bank.length && <Empty zh="库空" text="The bank is empty. Import your vocabulary to populate it." />}
      {view === "stack" && !stack.length && (
        <Empty zh="空" text="Nothing in the stack yet. Switch to All cards, select some, and tap Add to stack." />
      )}

      <div className="flex flex-col">
        {rows.map(c => {
          const rec = srs[c.id];
          const ago = rec ? Math.floor((Date.now() - rec.last) / DAY) : null;
          const isSel = selected.has(c.id);
          const inStack = stackSet.has(c.id);
          return (
            <div key={c.id}
              onClick={selectMode ? () => toggle(c.id) : () => setDetailId(c.id)}
              className="flex items-center gap-4 py-3"
              style={{
                borderBottom: `1px solid ${C.ink3}`,
                cursor: "pointer",
                background: isSel ? C.ink2 : "transparent",
              }}>
              {selectMode && (
                <div aria-hidden="true" className="w-5 h-5 shrink-0 rounded flex items-center justify-center"
                  style={{ border: `1px solid ${isSel ? C.cinnabar : C.line}`, color: C.cinnabar, fontSize: 12 }}>
                  {isSel ? "✕" : ""}
                </div>
              )}
              <div className="hz text-3xl font-semibold w-16 shrink-0" style={{ color: C.paper }}>{c.hanzi}</div>
              <div className="flex-1 min-w-0">
                <div className="mono text-sm" style={{ color: C.paper }}>{c.pinyin}</div>
                <div className="ui text-xs truncate" style={{ color: C.dim }}>{c.meaning}</div>
                <div className="ui text-xs mt-1" style={{ color: C.faint }}>
                  {c.pos.join(" · ")}{c.compound ? " · compound" : ""} — {rec ? (ago === 0 ? "seen today" : `seen ${ago}d ago`) : "new"}
                </div>
              </div>
              {!selectMode && (
                <div className="flex items-center shrink-0">
                  <button onClick={e => { e.stopPropagation(); inStack ? onRemoveFromStack([c.id]) : onAddToStack([c.id]); }}
                    aria-label={inStack ? `Remove ${c.hanzi} from stack` : `Add ${c.hanzi} to stack`}
                    className="text-base px-2 py-1" style={{ color: inStack ? C.paper : C.faint }}>
                    {inStack ? "▤" : "▢"}
                  </button>
                  <button onClick={e => { e.stopPropagation(); onToggleStar(c.id); }} aria-label={c.starred ? `Unstar ${c.hanzi}` : `Star ${c.hanzi} as tricky`}
                    className="text-base px-2 py-1" style={{ color: c.starred ? C.cinnabar : C.faint }}>
                    {c.starred ? "★" : "☆"}
                  </button>
                  {view === "all" && (
                    <button onClick={e => { e.stopPropagation(); onDelete(c.id); }} aria-label={`Delete ${c.hanzi}`}
                      className="ui text-xs px-2 py-1" style={{ color: C.faint }}>✕</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(() => {
        const detail = detailId ? bank.find(c => c.id === detailId) : null;
        return detail ? (
          <CardDetail card={detail} srs={srs} onClose={() => setDetailId(null)} onToggleStar={onToggleStar}
            inStack={stackSet.has(detail.id)}
            onToggleStack={() => stackSet.has(detail.id) ? onRemoveFromStack([detail.id]) : onAddToStack([detail.id])} />
        ) : null;
      })()}
    </div>
  );
}
