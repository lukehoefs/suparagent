"use client";

// An agent's SOUL.md: the person writes who the agent is; the tools section below is kept up to date by
// the app whenever tools are granted or removed. Saving only ever changes the person's part.
// Used as the Soul tab of the agent settings page and inside the old Agents dialog.
import { Info, Lock } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { api, type Agent, type AgentSoul } from "@/lib/api";
import { SOUL_MAX_BYTES, SOUL_PROMPT_BYTES, utf8Bytes } from "@/lib/agent-settings";
import { parseManagedTools } from "@/lib/soul-tools";
import { useT } from "@/lib/use-i18n";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Surface";

const STARTER = (name: string) =>
  `# Soul of ${name}\n\n## Role\n${name} is …\n\n## Voice\n- Direct, friendly, concise.\n\n## Rules\n- Ask before sending, publishing, buying or deleting anything.\n`;

export function SoulPanel({ agent, onDirtyChange }: { agent: Agent; onDirtyChange?: (dirty: boolean) => void }) {
  const t = useT();
  const fieldId = useId();
  const headingId = useId();
  const [soul, setSoul] = useState<AgentSoul | null>(null);
  const [mine, setMine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only a save made here, in this visit: the file carries no saved-at time of its own.
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const doc = await api.getSoul(agent.id);
      setSoul(doc);
      setMine(doc.mine);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agentSettings.soul.loadFailed"));
    }
  }, [agent.id, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const dirty = soul !== null && mine !== soul.mine;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const bytes = utf8Bytes(mine);
  const tooLarge = bytes > SOUL_MAX_BYTES;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const doc = await api.saveSoul(agent.id, mine);
      setSoul(doc);
      setMine(doc.mine);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agentSettings.soul.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const groups = soul ? parseManagedTools(soul.managed) : [];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 font-semibold text-ink">{t("agentSettings.soul.title")}</h2>
          <p className="mt-0.5 text-small text-muted">{t("agentSettings.soul.subtitle", { name: agent.name })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {savedAt && !dirty && (
            <span role="status" className="text-small text-muted">
              {t("agentSettings.savedAt", { time: savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
            </span>
          )}
          {dirty && soul && (
            <Button variant="secondary" onClick={() => setMine(soul.mine)} disabled={busy}>{t("agentSettings.discard")}</Button>
          )}
          <Button variant="primary" onClick={() => void save()} disabled={!dirty || tooLarge} loading={busy}>
            {t("agentSettings.save")}
          </Button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {soul === null ? (
        !error && <SkeletonList rows={4} />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <label htmlFor={fieldId} className="text-label font-medium text-ink">{t("agentSettings.soul.who", { name: agent.name })}</label>
              <Badge tone="accent">{t("agentSettings.badge.editable")}</Badge>
            </div>
            <textarea
              id={fieldId}
              rows={12}
              value={mine}
              onChange={(event) => setMine(event.target.value)}
              placeholder={t("agentSettings.soul.placeholder", { name: agent.name })}
              aria-invalid={tooLarge || undefined}
              className="block min-h-48 w-full resize-y border-0 bg-transparent p-4 font-mono text-[13px] leading-[1.7] text-ink outline-none placeholder:text-faint focus-visible:bg-inset/40 touch:text-base"
            />
            {(!mine.trim() || bytes > SOUL_PROMPT_BYTES) && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5">
                {!mine.trim() && (
                  <Button size="sm" variant="secondary" onClick={() => setMine(STARTER(agent.name))} disabled={busy}>
                    {t("agentSettings.soul.starter")}
                  </Button>
                )}
                {tooLarge ? (
                  <p role="alert" className="text-small text-danger">{t("agentSettings.soul.tooLarge")}</p>
                ) : bytes > SOUL_PROMPT_BYTES ? (
                  <p className="text-small text-warning">{t("agentSettings.soul.promptCap", { name: agent.name })}</p>
                ) : null}
              </div>
            )}
          </Card>

          <div className="rounded-card border border-dashed border-line bg-inset">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line px-4 py-2.5">
              <span className="inline-flex items-center gap-2 text-label font-medium text-ink">
                <Lock size={14} aria-hidden="true" className="shrink-0" />
                {t("agentSettings.soul.toolsTitle")}
              </span>
              <Badge tone="neutral">{t("agentSettings.badge.readOnly")}</Badge>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3.5">
              {groups.length === 0 ? (
                <p className="text-label text-muted">{t("agentSettings.soul.toolsEmpty")}</p>
              ) : (
                groups.map((group, index) => (
                  <div key={`${group.label}-${index}`} className="flex flex-col gap-1.5">
                    {group.label && <h3 className="text-label font-medium text-ink">{group.label}</h3>}
                    <ul className="flex flex-col gap-1.5 text-label">
                      {group.tools.map((tool) => (
                        <li key={tool.name} className="min-w-0 break-words">
                          <span className="font-mono text-ink">{tool.name}</span>{" "}
                          <span className="text-muted">{tool.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              <p className="mt-1 flex items-center gap-1.5 text-small text-muted">
                <Info size={14} aria-hidden="true" className="shrink-0" />
                {t("agentSettings.soul.toolsNote")}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
