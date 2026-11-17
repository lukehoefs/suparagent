"use client";

// "Skills this server provides": the list a server's own `skills` tool returns (Executor ships one),
// read when the server's card is opened. Read only; it changes nothing about the agent.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toolErrorKey } from "@/lib/agent-tools";
import { useT } from "@/lib/use-i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/ui/Skeleton";

type Skill = { name: string; app: string | null; description: string };

export function ServerSkills({ connectionId, agentName }: { connectionId: string; agentName: string }) {
  const t = useT();
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    api.getCustomMcpSkills(connectionId)
      .then((found) => { if (live) { setSkills(found); setError(null); } })
      .catch((err: unknown) => { if (live) setError(err ?? new Error("")); });
    return () => { live = false; };
  }, [connectionId, tick]);

  const retry = useCallback(() => { setSkills(null); setError(null); setTick((n) => n + 1); }, []);
  const key = toolErrorKey(error);
  const message = key ? t(key) : error instanceof Error ? error.message : "";

  return (
    <section aria-label={t("agentTools.skills.title")} className="flex flex-col gap-2">
      <div>
        <h4 className="text-label font-semibold text-ink">{t("agentTools.skills.title")}</h4>
        <p className="text-small text-muted">{t("agentTools.skills.intro", { name: agentName })}</p>
      </div>
      {error !== null ? (
        <Banner tone="danger" title={t("agentTools.skills.failed")} action={<Button size="sm" onClick={retry}>{t("agentTools.retry")}</Button>}>
          {message || null}
        </Banner>
      ) : skills === null ? (
        <SkeletonList rows={2} />
      ) : skills.length === 0 ? (
        <p className="text-small text-muted">{t("agentTools.skills.none")}</p>
      ) : (
        <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-field border border-line bg-inset">
          {skills.map((skill) => (
            <li key={`${skill.app ?? ""}:${skill.name}`} className="flex flex-col gap-0.5 px-3 py-2">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="break-all font-mono text-[12px] text-ink">{skill.name}</span>
                {skill.app ? <span className="text-small text-muted">{skill.app}</span> : null}
              </span>
              {skill.description ? <span className="line-clamp-2 text-small text-muted" title={skill.description}>{skill.description}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
