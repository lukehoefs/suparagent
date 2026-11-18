"use client";

// The matrix's filters (design: the Permissions.html side column): a search over tools and skills, the
// type (tools, skills), which sources show, and which client's agents. On a narrow page they sit above
// the matrix; beside it once there is room.
import { Search } from "lucide-react";
import { useState } from "react";
import type { PortalClient } from "@/lib/api";
import type { MatrixSource, SourceType } from "@/lib/permissions-matrix";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

// Sources listed before "Show all".
const SOURCES_SHOWN = 6;

// The design's rows: 14 px text on a 21 px line, 8 px apart; on touch each row is a 44 px target.
const FIELDSET = "m-0 flex min-w-0 flex-col gap-2 border-0 p-0 touch:gap-0";
const LEGEND = "pb-2 text-small font-medium text-muted";
const OPTION = "flex min-h-[21px] cursor-pointer items-center gap-2 text-body text-ink touch:min-h-11";
const BOX = "size-4 shrink-0 cursor-pointer accent-(--accent)";

export function FiltersPanel({
  query,
  onQuery,
  types,
  onTypes,
  sources,
  hidden,
  onHidden,
  labelOf,
  clients,
  clientId,
  onClient,
  className,
}: {
  query: string;
  onQuery: (query: string) => void;
  types: ReadonlySet<SourceType>;
  onTypes: (types: Set<SourceType>) => void;
  // Every source of the ticked types, whatever the search.
  sources: MatrixSource[];
  hidden: ReadonlySet<string>;
  onHidden: (hidden: Set<string>) => void;
  labelOf: (source: MatrixSource) => string;
  clients: PortalClient[];
  clientId: string | null;
  onClient: (id: string | null) => void;
  className?: string;
}) {
  const t = useT();
  const [allSources, setAllSources] = useState(false);
  const flipType = (type: SourceType) => {
    const next = new Set(types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onTypes(next);
  };
  const flipSource = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onHidden(next);
  };
  // An unticked source stays listed even past the cut, so it can always be ticked again.
  const listed = allSources ? sources : sources.filter((source, index) => index < SOURCES_SHOWN || hidden.has(source.id));

  return (
    <aside aria-label={t("permissions.filters.label")} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <label className="relative flex items-center">
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-faint" />
        <Input
          type="search"
          aria-label={t("permissions.filters.search")}
          placeholder={t("permissions.filters.search")}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          className="pl-8"
        />
      </label>
      <div className="flex flex-wrap gap-x-8 gap-y-4 @3xl:flex-col">
        <fieldset className={FIELDSET}>
          <legend className={LEGEND}>{t("permissions.filters.type")}</legend>
          <label className={OPTION}>
            <input type="checkbox" className={BOX} checked={types.has("tool")} onChange={() => flipType("tool")} />
            {t("permissions.filters.tools")}
          </label>
          <label className={OPTION}>
            <input type="checkbox" className={BOX} checked={types.has("skill")} onChange={() => flipType("skill")} />
            {t("permissions.filters.skills")}
          </label>
        </fieldset>
        {sources.length > 0 ? (
          <fieldset className={cn(FIELDSET, "max-w-full")}>
            <legend className={LEGEND}>{t("permissions.filters.source")}</legend>
            {listed.map((source) => (
              <label key={source.id} className={OPTION}>
                <input type="checkbox" className={BOX} checked={!hidden.has(source.id)} onChange={() => flipSource(source.id)} />
                <span className="min-w-0 truncate" title={labelOf(source)}>{labelOf(source)}</span>
              </label>
            ))}
            {sources.length > SOURCES_SHOWN ? (
              <button
                type="button"
                aria-expanded={allSources}
                onClick={() => setAllSources((v) => !v)}
                className="flex min-h-8 cursor-pointer items-center self-start text-label text-accent-text underline underline-offset-2 touch:min-h-11"
              >
                {allSources ? t("permissions.filters.fewer") : t("permissions.filters.all", { n: sources.length })}
              </button>
            ) : null}
          </fieldset>
        ) : null}
        {clients.length > 0 ? (
          <div className="flex min-w-48 flex-col gap-1.5">
            <span aria-hidden="true" className="text-small font-medium text-muted">{t("permissions.filters.client")}</span>
            <Select
              aria-label={t("permissions.filters.client")}
              value={clientId ?? ""}
              onChange={(event) => onClient(event.target.value || null)}
              options={[{ value: "", label: t("permissions.filters.allClients") }, ...clients.map((client) => ({ value: client.id, label: client.name }))]}
              className="h-control text-body touch:h-touch"
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
