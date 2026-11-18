"use client";

// The schedule part of the routine editor (design: Routines.html, Days, Time and Time zone):
// when it runs, and the server's own check of the draft, which says the next dates the scheduler
// would use (POST /routines/preview). Save waits for that check: it uses the answer when there is
// one and otherwise asks the server itself (useSchedulePreview's check), then saves or says why not.
import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api, ApiError, type ScheduleKind } from "@/lib/api";
import { browserTimezone, schedulePreviewKey, type ScheduleDraft } from "@/lib/routines";
import {
  formatInZone,
  previewFailure,
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
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useLocale } from "./shared";

/** The server's answer for one schedule draft (its preview key). */
export type SchedulePreview =
  | { key: string; status: "valid"; dates: string[] }
  | { key: string; status: "invalid"; problem: string }
  | { key: string; status: "failed" };

export type SchedulePreviewState = {
  // The draft's preview key.
  key: string;
  // Complete enough to be checked (a day and a time, an interval in range, a date…).
  ready: boolean;
  // The answer for this draft; null while it is being checked (or before it is complete).
  current: SchedulePreview | null;
  // Ask the server about a draft now, sharing a request already on its way for the same draft.
  check: (key: string) => Promise<SchedulePreview>;
  // Ask again after the check got no answer.
  retry: () => void;
};

/**
 * The server's check of a schedule draft: asked 300 ms after the draft last changed, again on
 * Retry, and at once when Save needs an answer it does not have yet. A refusal (400, 422) means
 * the schedule is wrong; no answer (offline, a server error) only means it could not be checked,
 * and Retry or Save asks again. An answer for a draft that has changed since is not shown.
 */
export function useSchedulePreview(schedule: ScheduleDraft): SchedulePreviewState {
  const t = useT();
  const key = schedulePreviewKey(schedule);
  const ready = schedulePreviewable(schedule);
  const [result, setResult] = useState<SchedulePreview | null>(null);
  const latest = useRef(key);
  const inflight = useRef<{ key: string; promise: Promise<SchedulePreview> } | null>(null);
  useEffect(() => { latest.current = key; }, [key]);

  const check = useCallback((target: string): Promise<SchedulePreview> => {
    if (inflight.current?.key === target) return inflight.current.promise;
    const { kind, spec, timezone } = JSON.parse(target) as { kind: ScheduleKind; spec: Record<string, unknown>; timezone: string };
    const promise = api.previewSchedule(kind, spec, timezone).then(
      (answer): SchedulePreview => ({ key: target, status: "valid", dates: answer.next_dates }),
      (err: unknown): SchedulePreview => {
        if (previewFailure(err instanceof ApiError ? err.status : null) === "failed") return { key: target, status: "failed" };
        return { key: target, status: "invalid", problem: err instanceof ApiError && err.message ? err.message : t("routines.preview.invalid") };
      },
    );
    const entry = { key: target, promise };
    inflight.current = entry;
    void promise.then((answer) => {
      if (inflight.current === entry) inflight.current = null;
      if (answer.key === latest.current) setResult(answer);
    });
    return promise;
  }, [t]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { void check(key); }, 300);
    return () => clearTimeout(timer);
  }, [key, ready, check]);

  const retry = useCallback(() => {
    setResult(null);
    void check(latest.current);
  }, [check]);

  return { key, ready, current: ready && result?.key === key ? result : null, check, retry };
}

export function ScheduleFields({
  value,
  onChange,
  preview,
  problems,
}: {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  // The server's check of this draft (useSchedulePreview, held by the editor so Save can wait for it).
  preview: SchedulePreviewState;
  // Shown only once Save has been pressed.
  problems: Partial<Record<DraftField, Words>>;
}) {
  const t = useT();
  const locale = useLocale();
  const daysId = useId();
  const zonesId = useId();
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });
  // Every zone the browser knows, read once: the field also takes any name typed into it.
  const [zones] = useState(() => timeZoneChoices(value.timezone));
  const zoned = usesTimezone(value.kind);
  const shownZone = zoned ? value.timezone.trim() || "UTC" : browserTimezone();
  const { current, ready, retry } = preview;
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
        <>
          <p className="text-small text-muted">{t("routines.field.manualHint")}</p>
          {current?.status === "invalid" && <p role="alert" className="text-xs text-danger">{current.problem}</p>}
          {current?.status === "failed" && <CheckFailed onRetry={retry} />}
        </>
      ) : (
        <SchedulePreviewBox current={current} incomplete={!ready} zone={shownZone} locale={locale} onRetry={retry} />
      )}
    </div>
  );
}

// The check got no answer: not a verdict on the schedule, so no status colour, and a way to ask again.
function CheckFailed({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field bg-inset px-3 py-2.5 text-label text-muted">
      <span className="flex min-w-0 flex-[1_1_12rem] items-start gap-2">
        <CalendarDays size={15} aria-hidden="true" className="mt-px shrink-0" />
        <span className="min-w-0">{t("routines.preview.failed")}</span>
      </span>
      <Button onClick={onRetry}>{t("routines.preview.retry")}</Button>
    </div>
  );
}

function SchedulePreviewBox({
  current,
  incomplete,
  zone,
  locale,
  onRetry,
}: {
  current: SchedulePreview | null;
  incomplete: boolean;
  zone: string;
  locale: string;
  onRetry: () => void;
}) {
  const t = useT();
  if (incomplete) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-field bg-inset px-3 py-2.5 text-label text-muted">
        <CalendarDays size={15} aria-hidden="true" className="mt-px shrink-0" />
        <span className="min-w-0">{t("routines.preview.incomplete")}</span>
      </p>
    );
  }
  if (current?.status === "invalid") {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-field bg-danger-bg px-3 py-2.5 text-label font-medium text-danger-on">
        <CalendarDays size={15} aria-hidden="true" className="mt-px shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{current.problem}</span>
      </p>
    );
  }
  if (current?.status === "failed") return <CheckFailed onRetry={onRetry} />;
  const dates = current?.status === "valid" ? current.dates : null;
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
