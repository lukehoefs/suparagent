// Calls for the Today page. Owner and admin only on the backend, like /needs-you.
import { request, type RoutineRun } from "./api";
import { runsCoverToday, type RunningTurn, type TodayBrief } from "./today";

// The most recent routine runs read at once (the backend's own maximum).
export const RUN_LIMIT = 500;
// What is read first, every minute: each run carries its whole result, so the full page is read
// only when this one may stop short of today's start.
export const RUN_FIRST = 100;

export type TodayRuns = { runs: RoutineRun[]; limit: number };

export const todayApi = {
  // Every conversation with an answer running now, newest first, with the calls waiting in each.
  running: () => request<RunningTurn[]>("/today/running"),
  // The Today brief as the page shows it (the chat's card lists six rows; this lists them all),
  // each row with its agent. `refresh` re-reads connected apps instead of the five-minute snapshot.
  brief: (refresh = false) => request<TodayBrief>(`/today/brief${refresh ? "?refresh=true" : ""}`),
  // The latest runs of every routine, newest first.
  routineRuns: (limit = RUN_LIMIT) => request<RoutineRun[]>(`/routines/runs?limit=${limit}`),
  // Enough of the latest runs to cover today (`today` in `timeZone`), with the limit they were
  // read with: RUN_FIRST, else RUN_LIMIT when RUN_FIRST may not reach back to today's start.
  todayRuns: async (today: string, timeZone: string): Promise<TodayRuns> => {
    const first = await todayApi.routineRuns(RUN_FIRST);
    if (runsCoverToday(first, RUN_FIRST, today, timeZone)) return { runs: first, limit: RUN_FIRST };
    return { runs: await todayApi.routineRuns(RUN_LIMIT), limit: RUN_LIMIT };
  },
};
