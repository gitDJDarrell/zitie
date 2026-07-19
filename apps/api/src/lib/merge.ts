// Server-side mirror of the client's additive-merge import logic
// (see apps/web ImportView.normalizeItem / run): scalars update, pos/examples
// union, notes append, omitted fields preserved, duplicates keyed by hanzi.

export interface ExampleSentence {
  zh: string;
  py?: string;
  en?: string;
}

export interface NormalizedCard {
  hanzi: string;
  pinyin: string;
  meaning: string;
  pos?: string[];
  compound?: boolean;
  radical?: string;
  strokes?: number;
  examples?: ExampleSentence[];
  notes?: string;
}

export interface ExistingCard {
  pos: string[];
  compound: boolean;
  radical: string | null;
  strokes: number | null;
  examples: ExampleSentence[] | null;
  notes: string | null;
}

export function normalizeItem(item: any, i: number): NormalizedCard {
  if (!item || !item.hanzi || !item.pinyin || !item.meaning) {
    throw new Error(`Item ${i + 1} is missing hanzi, pinyin, or meaning.`);
  }
  const out: NormalizedCard = {
    hanzi: String(item.hanzi),
    pinyin: String(item.pinyin),
    meaning: String(item.meaning),
  };
  if (Array.isArray(item.pos)) out.pos = item.pos.map(String);
  if ("compound" in item) out.compound = !!item.compound;
  if (item.radical) out.radical = String(item.radical);
  if (Number.isFinite(Number(item.strokes))) out.strokes = Number(item.strokes);
  if (Array.isArray(item.examples)) {
    out.examples = item.examples
      .filter((e: any) => e && e.zh)
      .map((e: any) => ({ zh: String(e.zh), py: e.py ? String(e.py) : "", en: e.en ? String(e.en) : "" }));
  }
  if (item.notes) out.notes = String(item.notes);
  return out;
}

// Applies `norm` on top of `prev` the same way the client expands an existing entry.
export function mergeCard(prev: ExistingCard, norm: NormalizedCard) {
  const merged: {
    pinyin: string; meaning: string; pos: string[]; compound: boolean;
    radical: string | null; strokes: number | null;
    examples: ExampleSentence[] | null; notes: string | null;
  } = {
    pinyin: norm.pinyin,
    meaning: norm.meaning,
    pos: norm.pos ?? prev.pos,
    compound: norm.compound ?? prev.compound,
    radical: norm.radical ?? prev.radical,
    strokes: norm.strokes ?? prev.strokes,
    examples: norm.examples ?? prev.examples,
    notes: norm.notes ?? prev.notes,
  };
  if (prev.pos?.length && norm.pos) {
    merged.pos = [...new Set([...prev.pos, ...norm.pos])];
  }
  if (prev.examples?.length && norm.examples?.length) {
    const have = new Set(prev.examples.map((e) => e.zh));
    merged.examples = [...prev.examples, ...norm.examples.filter((e) => !have.has(e.zh))];
  }
  if (prev.notes && norm.notes) {
    // Never lose existing note text: append when new, keep as-is when the
    // incoming note is already contained in it.
    merged.notes = prev.notes.includes(norm.notes) ? prev.notes : `${prev.notes} ${norm.notes}`;
  }
  return merged;
}
