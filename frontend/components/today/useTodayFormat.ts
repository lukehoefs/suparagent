"use client";

import { useMemo } from "react";
import { LANGUAGE_TAGS, resolveLocale } from "@/lib/i18n";
import { browserTimezone } from "@/lib/routines";
import { dayKey } from "@/lib/today";
import { useLanguageChoice } from "@/lib/use-i18n";

function formatter(tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(tag, options);
  } catch {
    // A time zone this browser does not know: the same words, in UTC.
    return new Intl.DateTimeFormat(tag, { ...options, timeZone: "UTC" });
  }
}

export type TodayFormat = {
  tag: string;
  timeZone: string;
  // 09:12, or 9:12 AM, as the language writes it.
  time: (iso: string) => string;
  // Monday, November 16.
  longDate: (at: Date) => string;
  // Nov 14, for a calendar day written YYYY-MM-DD.
  shortDay: (day: string) => string;
  // A time today, else the day and time (the activity list).
  when: (iso: string, now: Date) => string;
  // November 2026.
  monthTitle: (at: Date) => string;
  // S M T W T F S (narrow) and Sunday … Saturday (long), indexed 0 Sunday … 6 Saturday.
  weekdays: { narrow: string[]; long: string[] };
};

// Dates and times in the app's language and this browser's time zone (where the person is now; the
// server's Today brief uses the zone this page reports, so both agree on what "today" is).
export function useTodayFormat(): TodayFormat {
  const tag = LANGUAGE_TAGS[resolveLocale(useLanguageChoice())];
  const timeZone = useMemo(() => browserTimezone(), []);
  return useMemo(() => {
    const time = formatter(tag, { timeZone, hour: "numeric", minute: "2-digit" });
    const longDate = formatter(tag, { timeZone, weekday: "long", month: "long", day: "numeric" });
    const shortDay = formatter(tag, { timeZone: "UTC", month: "short", day: "numeric" });
    const dayAndTime = formatter(tag, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const monthTitle = formatter(tag, { timeZone, month: "long", year: "numeric" });
    const narrow = formatter(tag, { timeZone: "UTC", weekday: "narrow" });
    const long = formatter(tag, { timeZone: "UTC", weekday: "long" });
    // 1 January 2023 was a Sunday.
    const sunday = (offset: number) => new Date(Date.UTC(2023, 0, 1 + offset));
    const valid = (iso: string) => !Number.isNaN(new Date(iso).getTime());
    return {
      tag,
      timeZone,
      time: (iso) => (valid(iso) ? time.format(new Date(iso)) : ""),
      longDate: (at) => longDate.format(at),
      shortDay: (day) => {
        const [y, m, d] = day.split("-").map(Number);
        return y && m && d ? shortDay.format(new Date(Date.UTC(y, m - 1, d))) : day;
      },
      when: (iso, now) => {
        if (!valid(iso)) return "";
        return dayKey(iso, timeZone) === dayKey(now, timeZone) ? time.format(new Date(iso)) : dayAndTime.format(new Date(iso));
      },
      monthTitle: (at) => monthTitle.format(at),
      weekdays: {
        narrow: Array.from({ length: 7 }, (_, i) => narrow.format(sunday(i))),
        long: Array.from({ length: 7 }, (_, i) => long.format(sunday(i))),
      },
    };
  }, [tag, timeZone]);
}
