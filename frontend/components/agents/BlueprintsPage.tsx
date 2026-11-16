"use client";

import { ArrowLeft, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { AGENTS_HREF } from "@/lib/agent-pages";
import { blueprintCountKey, blueprintsHref, categorySlug, parseBlueprintCategory } from "@/lib/blueprint-browse";
import { BLUEPRINTS, filterBlueprints, type BlueprintCategory } from "@/lib/blueprints";
import { resolveLocale } from "@/lib/i18n";
import { useLanguageChoice, useT } from "@/lib/use-i18n";
import { BlueprintCard } from "./blueprints/BlueprintCard";
import { CategoryChips } from "./blueprints/CategoryChips";

// A link that looks like a secondary button (components/ui/Button), for page-to-page moves.
const LINK_BUTTON =
  "inline-flex h-control shrink-0 items-center justify-center gap-2 rounded-field border border-line bg-raised px-3 text-label font-medium text-ink transition-colors duration-(--dur-fast) hover:bg-hover touch:h-touch";

// Blueprints (design: Blueprints.html): the starting points from lib/blueprints.ts, searchable and
// filtered by category. The category lives in the address (?category=) so a reload keeps it; the
// search is per visit. Nothing is built behind a blueprint: "Build from this" opens New agent with
// it filled in.
export function BlueprintsPage() {
  const t = useT();
  const locale = resolveLocale(useLanguageChoice());
  const router = useRouter();
  const params = useSearchParams();
  const { mayManageAgents } = useAppShell();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const requested = params.get("category");
  const category = parseBlueprintCategory(requested);
  const shown = useMemo(() => filterBlueprints(BLUEPRINTS, query, category), [query, category]);

  // An unknown or oddly written ?category= becomes the canonical address, so the chips and a reload agree.
  useEffect(() => {
    if (requested !== null && requested !== (category ? categorySlug(category) : null)) {
      router.replace(blueprintsHref(category), { scroll: false });
    }
  }, [requested, category, router]);

  const choose = (next: BlueprintCategory | null) => router.replace(blueprintsHref(next), { scroll: false });
  // The button goes away with the empty state, so focus moves to the search box rather than the page.
  const clearFilters = () => {
    setQuery("");
    if (category !== null) choose(null);
    searchRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">{t("blueprints.title")}</h1>
          <p className="mt-1 text-body text-muted">{t("blueprints.subtitle", { count: BLUEPRINTS.length })}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex min-w-40 flex-1 items-center sm:w-60 sm:flex-none">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-faint" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t("blueprints.search")}
              placeholder={t("blueprints.search")}
              className="pl-8"
            />
          </div>
          <Link href={AGENTS_HREF} className={LINK_BUTTON}>
            <ArrowLeft size={14} aria-hidden="true" />
            {t("sidebar.allAgents")}
          </Link>
        </div>
      </header>

      <CategoryChips value={category} onChange={choose} />

      <p role="status" className="text-label text-muted">
        {t(blueprintCountKey(locale, shown.length), { count: shown.length })}
      </p>

      {shown.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3">
          {shown.map((blueprint) => (
            <li key={blueprint.id}>
              <BlueprintCard blueprint={blueprint} canBuild={mayManageAgents} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<SearchX size={28} />}
          title={t("blueprints.emptyTitle")}
          description={t("blueprints.emptyBody")}
          action={<Button variant="ghost" onClick={clearFilters}>{t("blueprints.clearFilters")}</Button>}
        />
      )}
    </div>
  );
}
