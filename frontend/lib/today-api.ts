// Calls for the Today page. Owner and admin only on the backend, like /needs-you.
import { request, type RoutineRun } from "./api";
import type { RunningTurn, TodayBrief } from "./today";

// The most recent routine runs read at once (the backend's own maximum).
export const RUN_LIMIT = 500;

export const todayApi = {
  // Every conversation with an answer running now, newest first, with the calls waiting in each.
  running: () => request<RunningTurn[]>("/today/running"),
  // The whole Today brief (the chat's card lists six rows; this lists them all), each row with its
  // agent. `refresh` re-reads connected apps instead of using the five-minute snapshot.
  brief: (refresh = false) => request<TodayBrief>(`/today/brief${refresh ? "?refresh=true" : ""}`),
  // The latest runs of every routine, newest first.
  routineRuns: (limit = RUN_LIMIT) => request<RoutineRun[]>(`/routines/runs?limit=${limit}`),
};
