// Reads for the Results page that lib/api.ts and lib/collaboration.ts do not wrap with a limit.
// Both are existing routes: GET /routines/runs (every routine's runs, newest first, 1-500) and
// GET /team/jobs (delegated team work, newest first, 1-500; `result` is left out of the list and
// read per job with GET /team/jobs/{id}).
import { request, type RoutineRun } from "./api";
import type { TeamJob } from "./collaboration";

export const RESULT_RUN_LIMIT = 300;
export const RESULT_JOB_LIMIT = 200;

export const resultsApi = {
  routineRuns: (limit = RESULT_RUN_LIMIT) => request<RoutineRun[]>(`/routines/runs?limit=${limit}`),
  teamJobs: (limit = RESULT_JOB_LIMIT) => request<TeamJob[]>(`/team/jobs?limit=${limit}`),
};
