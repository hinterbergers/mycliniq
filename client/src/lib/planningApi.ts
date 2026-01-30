import {
  planningRestApi,
  type PlanningInputV1,
  type PlanningLock,
  type PlanningOutputV1,
  type PlanningStateResponse,
} from "@/lib/api";

export type {
  PlanningInputV1,
  PlanningLock,
  PlanningOutputV1,
  PlanningStateResponse,
} from "@/lib/api";

export const planningApi = {
  fetchInput: planningRestApi.getInput,
  fetchState: planningRestApi.getState,
  fetchLocks: planningRestApi.getLocks,
  preview: planningRestApi.preview,
  run: planningRestApi.run,
};
