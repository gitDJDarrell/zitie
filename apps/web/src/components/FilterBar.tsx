import { C } from "../theme";
import type { Filters } from "../lib/filters";
import { Chip } from "./atoms";

export function FilterBar({ filters, setFilters, posList }: {
  filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; posList: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <input
        value={filters.q}
        onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
        placeholder="Search hanzi, pinyin, or meaning"
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        className="ui w-full px-4 py-3 text-sm rounded border bg-transparent"
        style={{ borderColor: C.line, color: C.paper }}
      />
      <div className="flex flex-wrap gap-2">
        {posList.map(p => (
          <Chip key={p} active={filters.pos.includes(p)}
            onClick={() => setFilters(f => ({ ...f, pos: f.pos.includes(p) ? f.pos.filter(x => x !== p) : [...f.pos, p] }))}>
            {p}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Chip active={filters.age === "all"} onClick={() => setFilters(f => ({ ...f, age: "all" }))}>all</Chip>
        <Chip active={filters.age === "new"} onClick={() => setFilters(f => ({ ...f, age: "new" }))}>new</Chip>
        <Chip active={filters.age === "old"} onClick={() => setFilters(f => ({ ...f, age: "old" }))}>seen</Chip>
        <span className="w-px h-4" style={{ background: C.line }} />
        <Chip active={filters.includeCompound}
          onClick={() => setFilters(f => ({ ...f, includeCompound: !f.includeCompound }))}>
          {filters.includeCompound ? "compounds: shown" : "compounds: hidden"}
        </Chip>
        <Chip active={filters.starred}
          onClick={() => setFilters(f => ({ ...f, starred: !f.starred }))}>
          {"★"} starred
        </Chip>
      </div>
    </div>
  );
}
