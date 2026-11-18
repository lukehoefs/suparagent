"use client";

import { useId } from "react";
import { rowAction } from "@/lib/needs-you";
import { calendarEvents, calendarNote, firstDayOfWeek, monthCells, weekdayOrder, zonedParts, type BriefRow, type CalendarEvent } from "@/lib/today";
import { useT } from "@/lib/use-i18n";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Surface";
import type { TodayFormat } from "./useTodayFormat";

const NOTES = { none: "today.calendar.none", failed: "today.calendar.failed", partial: "today.calendar.partial" } as const;

// This month with today marked, and today's events from the lead's calendar when it may read it.
// On a phone the month is left out (MobileToday.html); the events stay.
export function CalendarCard({ now, format, events, source }: { now: Date; format: TodayFormat; events: BriefRow[]; source: string | undefined }) {
  const t = useT();
  const eventsId = useId();
  const { year, month, day } = zonedParts(now, format.timeZone);
  const firstDay = firstDayOfWeek(format.tag);
  const order = weekdayOrder(firstDay);
  const cells = monthCells(year, month, firstDay);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const last = weeks[weeks.length - 1];
  while (last.length < 7) last.push(null);
  const note = calendarNote(source, events.length);
  const hasEvents = events.length > 0 || note !== null;
  // When each event is, in the page's language, time format and zone (not the brief's English line).
  const when = (event: CalendarEvent): string | null => {
    const { when: at } = event;
    const line = at.kind === "allDay" ? t("today.calendar.allDay")
      : at.kind === "time" ? (at.end ? format.timeRange(at.start, at.end, now) : format.when(at.start, now))
      : at.kind === "none" ? t("today.calendar.noTime")
      : at.text;
    return line && event.conflict ? t("today.calendar.conflict", { when: line }) : line;
  };

  return (
    <Card className={cn("flex flex-col gap-3", !hasEvents && "max-sm:hidden")}>
      <table className="w-full table-fixed border-separate border-spacing-0.5 max-sm:hidden">
        <caption className="mb-2.5 text-left text-body font-semibold text-ink">{format.monthTitle(now)}</caption>
        <thead>
          <tr>
            {order.map((weekday) => (
              <th key={weekday} scope="col" className="text-center text-[11px] font-normal text-muted">
                <abbr title={format.weekdays.long[weekday]} className="no-underline">{format.weekdays.narrow[weekday]}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, row) => (
            <tr key={row}>
              {week.map((date, column) => (
                <td key={column} className="p-0 text-center">
                  {date !== null && (
                    <span
                      aria-current={date === day ? "date" : undefined}
                      className={cn(
                        "flex h-7 items-center justify-center rounded-field text-small text-ink",
                        date === day && "bg-accent font-semibold text-accent-fg",
                      )}
                    >
                      {date}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasEvents && (
        <section aria-labelledby={eventsId} className="flex flex-col gap-2 sm:border-t sm:border-line sm:pt-3">
          <h2 id={eventsId} className="text-body font-semibold text-ink">{t("today.calendar.events")}</h2>
          {events.length > 0 && (
            <ul className="flex flex-col gap-2">
              {calendarEvents(events).map((event) => {
                const href = rowAction(event.row).href;
                const title = event.cancelled ? t("today.calendar.cancelled", { title: event.title }) : event.title;
                const line = when(event);
                return (
                  <li key={event.key} className="min-w-0 text-label">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-ink underline-offset-2 hover:underline max-sm:py-[13px]">
                        {title}
                      </a>
                    ) : (
                      <span className="block truncate text-ink">{title}</span>
                    )}
                    {line && <span className="block text-small text-muted">{line}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {note && <p role={note === "failed" ? "alert" : undefined} className={cn("text-small", note === "failed" ? "text-danger" : "text-muted")}>{t(NOTES[note])}</p>}
        </section>
      )}
    </Card>
  );
}
