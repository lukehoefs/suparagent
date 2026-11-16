"use client";

import Link from "next/link";
import { useId } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Surface";
import { newAgentHref } from "@/lib/agent-pages";
import { CATEGORY_LABEL_KEYS } from "@/lib/blueprint-browse";
import type { Blueprint } from "@/lib/blueprints";
import { useT } from "@/lib/use-i18n";

// One blueprint: its name, category and one-line job. "Build from this" opens New agent with the
// blueprint filled in, and shows only to people who may create agents. "Template included" marks
// the five blueprints whose backend template New agent also applies, and shows only to people for
// whom it does (templates are admin-only).
export function BlueprintCard({ blueprint, canBuild, canUseTemplate }: { blueprint: Blueprint; canBuild: boolean; canUseTemplate: boolean }) {
  const t = useT();
  const hintId = useId();
  const hint = t("blueprints.templateIncludedHint");
  const template = canBuild && canUseTemplate && Boolean(blueprint.templateId);
  return (
    <Card className="flex h-full flex-col gap-2 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[15px] font-semibold leading-[22px] text-ink">{blueprint.name}</h3>
        <Badge className="shrink-0 whitespace-nowrap">{t(CATEGORY_LABEL_KEYS[blueprint.category])}</Badge>
      </div>
      <p className="flex-1 text-[13px] leading-[19px] text-muted">{blueprint.job}</p>
      {(canBuild || template) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canBuild && (
            <Link
              href={newAgentHref(blueprint.id)}
              aria-label={t("blueprints.buildNamed", { name: blueprint.name })}
              aria-describedby={template ? hintId : undefined}
              className="inline-flex min-h-6 items-center rounded-inner text-label font-medium text-accent-text underline-offset-4 hover:underline touch:min-h-touch"
            >
              {t("blueprints.build")}
            </Link>
          )}
          {template && (
            <span title={hint} className="inline-flex">
              <Badge>{t("blueprints.templateIncluded")}</Badge>
              <span id={hintId} className="sr-only">{hint}</span>
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
