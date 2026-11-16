"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/identity";
import { useT } from "@/lib/use-i18n";

// The live preview beside the wizard (design: NewAgent.html, aside "Preview"). Before the agent exists it
// has no id, so no identity colour: a neutral circle with the typed initials. Once created, the real avatar.
export function AgentPreview({ name, title, engine, agentId }: { name: string; title: string; engine: string | null; agentId: number | null }) {
  const t = useT();
  const shownName = name.trim();
  const shownTitle = title.trim();
  return (
    <aside aria-label={t("newAgent.preview")} className="flex min-w-0 max-w-[320px] grow basis-[260px] flex-col gap-2.5">
      <p className="text-small text-muted">{t("newAgent.preview")}</p>
      <Card className="flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {agentId !== null ? (
            <Avatar agentId={agentId} name={shownName} size="lg" />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-10 shrink-0 select-none items-center justify-center rounded-full text-[15px] font-semibold",
                shownName ? "bg-hover text-ink" : "border border-dashed border-line-strong text-muted",
              )}
            >
              {initialsOf(shownName)}
            </span>
          )}
          <div className="min-w-0">
            {shownName ? (
              <p className="truncate text-[15px] font-semibold text-ink">{shownName}</p>
            ) : (
              <p className="text-body text-faint">{t("newAgent.previewNoName")}</p>
            )}
            {shownTitle ? <p className="truncate text-small text-muted">{shownTitle}</p> : null}
          </div>
        </div>
        {engine ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge>{engine}</Badge>
          </div>
        ) : null}
        <p className="text-small text-muted">{t("newAgent.previewNote")}</p>
      </Card>
    </aside>
  );
}
