import type { CSSProperties } from "react";
import { C } from "../theme";
import type { Rarity } from "./packs";

/* ————————————————— rarity, as a finish —————————————————
   One place that turns a rarity into pixels, so the gallery tile, the card
   detail and the pack reveal cannot drift apart.

   Common and rare are built from the theme tokens and invert with the page.
   Epic and legendary are fixed metal in both themes, following the call
   .dex-shiny already made — and on those two the glyph flips to near-black,
   because white on a mirror fails contrast at any size. Legibility outranks
   decoration: the hanzi is the card's job. */

export interface Finish {
  /** CSS class carrying the metallic treatments; empty for the paper grades. */
  className: string;
  style: CSSProperties;
  /** Colour for the hanzi itself. */
  glyph: string;
  /** Colour for pinyin and other secondary text. */
  sub: string;
  /** Colour for the rarity pips. */
  pip: string;
  label: string;
  /** Material name, shown where the card has room for it. */
  material: string;
}

const METAL_INK = "#16181B";

export function finishOf(rarity: Rarity): Finish {
  switch (rarity) {
    case "legendary":
      return {
        className: "rar-legendary",
        style: {},
        glyph: METAL_INK,
        sub: "#3F4247",
        pip: METAL_INK,
        label: "legendary",
        material: "镜 mirror",
      };
    case "epic":
      return {
        className: "rar-epic",
        style: {},
        glyph: "#FFFFFF",
        sub: "#E4E7EA",
        pip: "#EEF1F4",
        label: "epic",
        material: "银 satin",
      };
    case "rare":
      // 墨 ink — deeper stock than a common, and a doubled rule. The inner
      // rule is drawn with an inset shadow so the tile keeps one box model.
      return {
        className: "",
        style: {
          background: C.ink,
          border: `1px solid ${C.dim}`,
          boxShadow: `inset 0 0 0 1px ${C.ink}, inset 0 0 0 2px ${C.ink3}`,
        },
        glyph: C.paper,
        sub: C.dim,
        pip: C.dim,
        label: "rare",
        material: "墨 ink",
      };
    default:
      return {
        className: "",
        style: { background: C.ink2, border: `1px solid ${C.line}` },
        glyph: C.paper,
        sub: C.faint,
        pip: C.line,
        label: "common",
        material: "纸 paper",
      };
  }
}

export const PIPS: Record<Rarity, string> = {
  common: "•",
  rare: "••",
  epic: "•••",
  legendary: "••••",
};
