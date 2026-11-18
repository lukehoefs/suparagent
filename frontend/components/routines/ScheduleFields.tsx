"use client";

// The schedule part of the routine editor (design: Routines.html, Days, Time and Time zone):
// when it runs, and the server's own check of the draft, which says the next dates the scheduler
// would use (POST /routines/preview). Save waits for that check to pass.
import { CalendarDays } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { api, ApiError, type ScheduleKind } from "@/lib/api";
import { browserTimezone, schedulePreviewKey, type ScheduleDraft } from "@/lib/routines";
import {
  formatInZone,
  SCHEDULE_KIND_ORDER,
  schedulePreviewable,
  timeZoneChoices,
  toggleDay,
  usesTimezone,
  weekdayName,
  WEEK_ORDER,
  type DraftField,
} from "@/lib/routines-page";
import type { Words } from "@/lib/agent-automation";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Field, Input, Select } from "@/components/ui/Input";
import { useLocale } from "./shared";

type Preview = { key: string; dates: string[] | null; problem: string | null };

export function ScheduleFields({
  value,
  onChange,
  onPreviewResult,
  problems,
}: {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  // The preview key the server last accepted, or null when it refused the draft.
  onPreviewResult: (key: string, valid: boolean) => void;
  // Shown only once Save has been pressed.
  problems: Partial<Record<DraftField, Words>>;
}) {
  const t = useT();
  const locale = useLocale();
  const daysId = useId();
  const zonesId = useId();
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewKey = schedulePreviewKey(value);
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });
  // Every zone the browser knows, read once: the field also takes any name typed into it.
  const [zones] = useState(() => timeZoneChoices(value.timezone));
  const zoned = usesTimezone(value.kind);
  const shownZone = zoned ? value.timezone.trim() || "UTC" : browserTimezone();
  // An incomplete draft (no day chosen, no date yet) is not sent: the box says what is missing.
  const ready = schedulePreviewable(value);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    const { kind, spec, timezone } = JSON.parse(previewKey) as { kind: ScheduleKind; spec: Record<string, unknown>; timezone: string };
    const timer = setTimeout(() => {
      api.previewSchedule(kind, spec, timezone)
        .then((result) => {
          if (!live) return;
          setPreview({ key: previewKey, dates: result.next_dates, problem: null });
          onPreviewResult(previewKey, true);
        })
        .catch((err: unknown) => {
          if (!live) return;
          setPreview({ key: previewKey, dates: null, problem: err instanceof ApiError && err.message ? err.message : t("routines.preview.invalid") });
          onPreviewResult(previewKey, false);
        });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [previewKey, ready, onPreviewResult, t]);

  const current = preview?.key === previewKey ? preview : null;
  const kindOptions = useMemo(() => SCHEDULE_KIND_ORDER.map((kind) => ({ value: kind, label: t(`routines.kind.${kind}`) })), [t]);

  const zoneField = (
    <Field label={t("routines.field.timezone")} hint={t("routines.field.timezoneHint")}>
      {(ids) => (
        <>
          <Input
            {...ids}
            list={zonesId}
            value={value.timezone}
            onChange={(event) => set({ timezone: event.target.value })}
            spellCheck={false}
            autoComplete="off"
          />
          <datalist id={zonesId}>
            {zones.map((zone) => <option key={zone} value={zone} />)}
          </datalist>
        </>
      )}
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("routines.field.runs")}>
        {(ids) => (
          <Select
            {...ids}
            value={value.kind}
            options={kindOptions}
            onChange={(event) => set({ kind: event.target.value as ScheduleKind })}
            className="h-control touch:h-touch"
          />
        )}
      </Field>

      {value.kind === "weekdays" && (
        <>
          <div className="flex flex-col gap-1.5">
            <span id={daysId} className="text-[13px] font-medium text-ink">{t("routines.field.days")}</span>
            <div role="group" aria-labelledby={daysId} className="flex flex-wrap gap-1.5">
              {WEEK_ORDER.map((day) => {
                const on = value.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    aria-label={weekdayName(day, locale, "long")}
                    onClick={() => set({ days: toggleDay(value.days, day) })}
                    className={cn(
                      "inline-flex size-9 cursor-pointer items-center justify-center rounded-field border text-small font-medium transition-colors duration-(--dur-fast) touch:size-11",
                      on ? "border-accent bg-accent-bg text-accent-text" : "border-line bg-raised text-muted hover:bg-hover hover:text-ink",
                    )}
                  >
                    {weekdayName(day, locale, "short")}
                  </button>
                );
              })}
            </div>
            {problems.days && <p role="alert" className="text-xs text-danger">{t(problems.days.key, problems.days.params)}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("routines.field.time")}>
              {(ids) => <Input {...ids} type="time" value={value.time} onChange={(event) => set({ time: event.target.value })} required />}
            </Field>
            {zoneField}
          </div>
        </>
      )}

      {value.kind === "interval" && (
        <Field
          label={t("routines.field.every")}
          hint={t("routines.field.everyHint")}
          error={problems.everyMinutes ? t(problems.everyMinutes.key, problems.everyMinutes.params) : undefined}
        >
          {(ids) => (
            <Input
              {...ids}
              type="number"
              inputMode="numeric"
              min={5}
              max={10080}
              value={value.everyMinutes}
              onChange={(event) => set({ everyMinutes: event.target.value })}
              className="sm:max-w-40"
            />
          )}
        </Field>
      )}

      {value.kind === "once" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("routines.field.at")}>
            {(ids) => <Input {...ids} type="datetime-local" value={value.at} onChange={(event) => set({ at: event.target.value })} required />}
          </Field>
          {zoneField}
        </div>
      )}

      {value.kind === "cron" && (
        <>
          <Field label={t("routines.field.cron")} hint={t("routines.field.cronHint")}>
            {(ids) => (
              <Input
                {...ids}
                value={value.expression}
                onChange={(event) => set({ expression: event.target.value })}
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
              />
            )}
          </Field>
          {zoneField}
        </>
      )}

      {value.kind === "manual" ? (
        <p className="text-small text-muted">{t("routines.field.manualHint")}</p>
      ) : (
        <SchedulePreview current={ready ? current : null} incomplete={!ready} zone={shownZone} locale={locale} />
      )}
      {value.kind === "manual" && current?.problem && <p role="alert" className="text-xs text-danger">{current.problem}</p>}
    </div>
  );
}

function SchedulePreview({ current, incomplete, zone, locale }: { current: Preview | null; incomplete: boolean; zone: string; locale: string }) {
  const t = useT();
  if (incomplete) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-field bg-inset px-3 py-2.5 text-label text-muted">
        <CalendarDays size={15} aria-hidden="true" className="mt-px shrink-0" />
        <span className="min-w-0">{t("routines.preview.incomplete")}</span>
      </p>
    );
  }
  if (current?.problem) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-field bg-danger-bg px-3 py-2.5 text-label font-medium text-danger-on">
        <CalendarDays size={15} aria-hidden="true" className="mt-px shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{current.problem}</span>
      </p>
    );
  }
  const dates = current?.dates ?? null;
  const [first, ...rest] = (dates ?? []).map((iso) => formatInZone(iso, locale, zone)).filter(Boolean);
  return (
    <div role="status" className="flex items-start gap-2 rounded-field bg-inset px-3 py-2.5 text-label">
      <CalendarDays size={15} aria-hidden="true" className="mt-px shrink-0 text-muted" />
      <div className="min-w-0">
        {dates === null ? (
          <p className="text-muted">{t("routines.preview.checking")}</p>
        ) : first ? (
          <>
            <p className="font-medium text-ink">{t("routines.preview.next", { when: first })}</p>
            {rest.length > 0 && <p className="text-small text-muted">{t("routines.preview.then", { dates: rest.join(" · ") })}</p>}
          </>
        ) : (
          <p className="font-medium text-ink">{t("routines.preview.none")}</p>
        )}
      </div>
    </div>
  );
}
