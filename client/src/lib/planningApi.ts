import {
  planningRestApi,
  type PlanningInputV1,
  type PlanningInputSummary,
  type PlanningLock,
  type PlanningOutputV1,
  type PlanningStateResponse,
} from "@/lib/api";

export type {
  PlanningInputV1,
  PlanningInputSummary,
  PlanningLock,
  PlanningOutputV1,
  PlanningStateResponse,
} from "@/lib/api";

export const planningApi = {
  fetchInput: planningRestApi.getInput,
  fetchInputSummary: planningRestApi.getInputSummary,
  fetchState: planningRestApi.getState,
  fetchLocks: planningRestApi.getLocks,
  preview: planningRestApi.preview,
  run: planningRestApi.run,
  runPreview: planningRestApi.runPlanningPreview,
};
