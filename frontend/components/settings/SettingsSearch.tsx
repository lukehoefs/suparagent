"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SETTINGS_PAGES } from "@/lib/settings-nav";
import { rankSettings, settingsEntryHref, settingsSearchKeyAction, type SettingsRegistryEntry } from "@/lib/settings-registry";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

export function SettingsSearch() {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const groups = useMemo(() => {
    const ranked = rankSettings(query);
    return SETTINGS_PAGES.flatMap((page) => {
      const entries = ranked
        .filter(({ entry }) => entry.page === page.id)
        .map(({ entry }) => entry);
      return entries.length ? [{ label: t(`settingsNav.${page.id}`), entries }] : [];
    });
  }, [query, t]);
  const results = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const current = Math.min(active, Math.max(results.length - 1, 0));
  const activeDescendant = results.length ? `${listId}-${current}` : undefined;
  const queryActive = query.trim().length > 0;
  const announcement = !queryActive
    ? ""
    : results.length === 0
      ? t("settingsPage.searchNone")
      : results.length === 1 ? t("settingsPage.searchOne") : t("settingsPage.searchMany", { n: results.length });

  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLElement>("[role=option]")[current]?.scrollIntoView({ block: "nearest" });
  }, [current, query]);

  const open = (entry: SettingsRegistryEntry) => {
    router.push(settingsEntryHref(entry));
    setQuery("");
    setActive(0);
    window.dispatchEvent(new CustomEvent("settings:anchor", { detail: entry.anchorId }));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const action = settingsSearchKeyAction(event.key, current, results.length);
    if (!action) return;
    event.preventDefault();
    if (action.type === "move") {
      setActive(action.active);
    } else if (action.type === "select") {
      const entry = results[current];
      if (entry) open(entry);
    } else {
      setQuery("");
      setActive(0);
    }
  };

  return (
    <div className="relative z-10">
      <label htmlFor={`${listId}-input`} className="sr-only">{t("settingsPage.search")}</label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={queryActive}
        aria-controls={queryActive ? listId : undefined}
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        placeholder={t("settingsPage.search")}
        className="h-control w-full rounded-field border border-line-strong bg-raised px-3 text-body text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus touch:h-touch touch:text-base"
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
      {queryActive && (
        <div className="absolute left-0 right-0 top-full mt-1 overflow-hidden rounded-card bg-raised shadow-float">
          <ul ref={listRef} id={listId} role="listbox" aria-label={t("settingsPage.searchResults")} className="max-h-[min(60vh,24rem)] overflow-y-auto p-1">
            {results.length === 0 ? (
              <li role="presentation"><p className="px-3 py-5 text-center text-sm text-muted">{t("settingsPage.searchNone")}</p></li>
            ) : groups.map((group) => (
                <li key={group.label} role="presentation">
                  <p className="px-3 pb-1 pt-2 text-small font-medium text-faint">{group.label}</p>
                  <ul role="group" aria-label={group.label}>
                    {group.entries.map((entry) => {
                      const index = results.indexOf(entry);
                      return (
                        <li key={entry.id} role="presentation">
                          <button
                            type="button"
                            role="option"
                            id={`${listId}-${index}`}
                            aria-selected={index === current}
                            onMouseMove={() => setActive(index)}
                            onClick={() => open(entry)}
                            className={cn("flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-left text-sm touch:py-3", index === current && "bg-hover")}
                          >
                            <span className="min-w-0 flex-1 truncate text-ink">{entry.title}</span>
                            <span className="shrink-0 truncate text-xs text-muted">{entry.section}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            }
          </ul>
        </div>
      )}
    </div>
  );
}
