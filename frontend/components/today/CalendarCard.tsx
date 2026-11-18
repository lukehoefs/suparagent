"use client";

import { useId } from "react";
import { rowAction } from "@/lib/needs-you";
import { calendarNote, firstDayOfWeek, monthCells, weekdayOrder, zonedParts, type BriefRow } from "@/lib/today";
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
              {events.map((event) => {
                const href = rowAction(event).href;
                return (
                  <li key={event.key} className="min-w-0 text-label">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-ink underline-offset-2 hover:underline max-sm:py-[13px]">
                        {event.title}
                      </a>
                    ) : (
                      <span className="block truncate text-ink">{event.title}</span>
                    )}
                    {event.detail && <span className="block text-small text-muted">{event.detail}</span>}
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
