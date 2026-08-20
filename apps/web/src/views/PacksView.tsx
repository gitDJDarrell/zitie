import { useState } from "react";
import { api } from "../api/client";
import { ApiError } from "../api/client";
import { SectionLabel, Switch } from "../components/atoms";
import { PACK_COST, RARITY_ORDER } from "../lib/packs";
import { finishOf, PIPS } from "../lib/rarityStyle";
import { C } from "../theme";
import type { Card, Rarity, Wallet } from "../types";

/* ————————————————— 开包 the pack view —————————————————
   Where cards enter the collection, and the only place they do. A pack is
   16 cards; rarity is cosmetic, so every card here carries the same content
   whatever its finish — the finish is the reward, not the material.

   Points are spent here but never earned here. They are minted server-side
   when a proof is verified, so the only route to more packs runs through the
   cards you already hold. */

const TIER_LABEL: Record<number, string> = { 1: "3 packs a month", 2: "7 packs a month", 3: "15 packs a month" };

export function PacksView({ wallet, onWallet, onGranted }: {
  wallet: Wallet | null;
  onWallet: (w: Wallet) => void;
  onGranted: (cards: Card[]) => void;
}) {
  const [opening, setOpening] = useState<Rarity | null>(null);
  const [dealt, setDealt] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const held = (g: Rarity) => wallet?.packs?.[g] ?? 0;
  const total = RARITY_ORDER.reduce((n, g) => n + held(g), 0);

  const open = async (grade: Rarity) => {
    setOpening(grade);
    setError(null);
    try {
      const res = await api.openPack(grade);
      setDealt(res.cards);
      onWallet(res.wallet);
      onGranted(res.cards);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open that pack.");
    } finally {
      setOpening(null);
    }
  };

  const buy = async (grade: Rarity) => {
    setError(null);
    try {
      onWallet(await api.buyPack(grade));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not buy that pack.");
    }
  };

  if (dealt) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <SectionLabel zh="开包" en="pack opened" />
          <button onClick={() => setDealt(null)}
            className="ui px-4 py-2 t-btn border rounded"
            style={{ borderColor: C.line, color: C.paper }}>
            done
          </button>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}>
          {dealt.map((card, i) => {
            const rarity = (card.rarity ?? "common") as Rarity;
            const fin = finishOf(rarity);
            return (
              <div key={card.id}
                className={`pack-card flex flex-col items-center justify-center gap-1 rounded px-1 ${fin.className}`}
                style={{ height: 96, animationDelay: `${Math.min(i, 16) * 45}ms`, ...fin.style }}>
                <span className="hz leading-tight" style={{ color: fin.glyph, fontSize: 30 }}>{card.hanzi}</span>
                <span className="mono t-micro truncate w-full text-center" style={{ color: fin.sub }}>
                  {card.pinyin || "—"}
                </span>
                <span className="ui t-micro" style={{ color: fin.pip, letterSpacing: 2 }}>{PIPS[rarity]}</span>
              </div>
            );
          })}
        </div>
        <p className="ui t-micro" style={{ color: C.faint }}>
          Every card carries the same content — the finish is the prize, not the lesson.
          Study them to earn the points for your next pack.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <SectionLabel zh="开包" en="packs" />
        <div className="ui text-xs text-right" style={{ color: C.dim }}>
          <div><span style={{ color: C.paper }}>{wallet?.points ?? 0}</span> points</div>
          <div className="t-micro" style={{ color: C.faint }}>
            {total} pack{total === 1 ? "" : "s"} unopened
          </div>
        </div>
      </div>

      {error && (
        <p className="ui t-body px-3 py-2 rounded" style={{ color: C.paper, background: C.ink2, border: `1px solid ${C.line}` }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {RARITY_ORDER.map(grade => {
          const fin = finishOf(grade);
          const count = held(grade);
          const cost = PACK_COST[grade];
          const affordable = (wallet?.points ?? 0) >= cost;
          return (
            <div key={grade} className="flex items-stretch gap-2">
              <button
                onClick={() => open(grade)}
                disabled={count < 1 || opening !== null}
                aria-label={`Open a ${grade} pack. ${count} held.`}
                className={`flex-1 flex items-center justify-between gap-3 px-4 py-3 rounded text-left ${count > 0 ? fin.className : ""}`}
                style={count > 0
                  ? fin.style
                  : { background: C.ink2, border: `1px dashed ${C.ink3}`, opacity: 0.55 }}>
                <span className="flex flex-col">
                  <span className="ui t-label" style={{ color: count > 0 ? fin.glyph : C.dim }}>
                    {grade} pack
                  </span>
                  <span className="ui t-micro" style={{ color: count > 0 ? fin.sub : C.faint }}>
                    {fin.material} · 16 cards
                  </span>
                </span>
                <span className="ui t-label" style={{ color: count > 0 ? fin.glyph : C.faint }}>
                  {opening === grade ? "opening…" : count > 0 ? `open (${count})` : "none"}
                </span>
              </button>
              <button
                onClick={() => buy(grade)}
                disabled={!affordable}
                aria-label={`Buy a ${grade} pack for ${cost} points`}
                className="ui px-3 py-2 t-btn border rounded shrink-0"
                style={{
                  borderColor: affordable ? C.line : C.ink3,
                  color: affordable ? C.paper : C.faint,
                  minWidth: 92,
                }}>
                {cost} pts
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 pt-1" style={{ borderTop: `1px solid ${C.ink3}` }}>
        <div className="ui t-micro pt-3" style={{ color: C.faint }}>
          subscription — packs granted at the start of each month
        </div>
        <Switch
          value={String(wallet?.tier ?? 1)}
          options={[
            { value: "1", label: "tier 1" },
            { value: "2", label: "tier 2" },
            { value: "3", label: "tier 3" },
          ]}
          onChange={async (v) => {
            setError(null);
            try {
              onWallet(await api.setTier(Number(v)));
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Could not change tier.");
            }
          }} />
        <p className="ui t-micro" style={{ color: C.faint }}>
          {TIER_LABEL[wallet?.tier ?? 1]} · drawing from HSK {wallet?.tierBand ?? "1"} and the level above
        </p>
      </div>

      <p className="ui t-micro" style={{ color: C.faint }}>
        Points come from studying, never from opening: {} 5 for a proof, 25 for a mastery,
        1 for a review that was actually due.
      </p>
    </div>
  );
}
