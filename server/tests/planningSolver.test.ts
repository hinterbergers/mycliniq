import { parseISO, getISOWeek } from "date-fns";
import {
  createAssignments,
  evaluateEmployeeForSlot,
  scoreCandidateForSlot,
  type PlannerEmployeeState,
} from "../api/roster/planning/index";

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createState = (overrides: Partial<PlannerEmployeeState> = {}): PlannerEmployeeState => ({
  id: "1",
  canRoleIds: new Set(["gyn", "kreiszimmer"]),
  banDates: new Set(),
  banWeekdays: new Set(),
  maxSlots: 10,
  maxSlotsPerWeek: 5,
  maxWeekendSlots: 2,
  assignedCount: 0,
  assignedPerWeek: {},
  assignedDates: new Set(),
  assignedWeekends: 0,
  preferences: {
    preferDates: new Set(),
    avoidDates: new Set(),
    preferServiceTypes: new Set(),
    avoidServiceTypes: new Set(),
  },
  ...overrides,
});

const testScoreRespectsPreferences = () => {
  const slot = { date: "2026-03-01", roleId: "gyn" };
  const preferState = createState({
    preferences: {
      preferDates: new Set(["2026-03-01"]),
      avoidDates: new Set(),
      preferServiceTypes: new Set(["gyn"]),
      avoidServiceTypes: new Set(),
    },
  });
  const avoidState = createState({
    preferences: {
      preferDates: new Set(),
      avoidDates: new Set(["2026-03-01"]),
      preferServiceTypes: new Set(),
      avoidServiceTypes: new Set(["gyn"]),
    },
  });

  const preferScore = scoreCandidateForSlot(preferState, slot);
  const avoidScore = scoreCandidateForSlot(avoidState, slot);
  assert(
    preferScore > avoidScore,
    "preferred service types should score higher than avoided ones",
  );
};

const testBanWeekdayBlocksAssignment = () => {
  const slotDate = "2026-03-03";
  const slotDateObj = parseISO(slotDate);
  const isoWeek = getISOWeek(slotDateObj);
  const state = createState({
    banWeekdays: new Set([slotDateObj.getDay()]),
  });
  const evaluation = evaluateEmployeeForSlot(
    state,
    { date: slotDate, roleId: "gyn" },
    slotDateObj,
    isoWeek,
  );
  assert(!evaluation.ok, "employee should be blocked by banWeekday");
  assert(
    evaluation.reasons.includes("BAN_WEEKDAY"),
    "reason should mention ban weekday",
  );
};

const testFixedPreferredAssignment = () => {
  const input = {
    meta: {
      timezone: "Europe/Vienna",
      createdAt: new Date().toISOString(),
      planningKind: "MONTHLY_DUTY",
    },
    period: {
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      year: 2026,
      month: 3,
    },
    roles: [
      { id: "gyn", label: "Gynäkologie (OA)" },
      { id: "kreiszimmer", label: "Kreißzimmer (Ass.)" },
    ],
    slots: [
      {
        id: "2026-03-01-gyn",
        date: "2026-03-01",
        roleId: "gyn",
        required: 1,
        isWeekend: false,
      },
    ],
    employees: [
      {
        id: "1",
        name: "Dr. Fix",
        group: "OA",
        capabilities: { canRoleIds: ["gyn", "kreiszimmer"] },
        constraints: {
          limits: {
            maxSlotsInPeriod: 5,
            maxSlotsPerIsoWeek: 2,
          },
          hard: {
            banDates: [],
            banWeekdays: [],
          },
          soft: {
            preferDates: ["2026-03-01"],
            preferServiceTypes: ["gyn"],
          },
        },
      },
    ],
    rules: {
      hardRules: [],
    },
  };

  const result = createAssignments(input, [], [1]);
  const assignment = result.assignments.find(
    (a) => a.slotId === "2026-03-01-gyn",
  );
  assert(assignment, "fixed preferred assignment should create entry");
  assert(assignment?.employeeId === "1", "assignment should target employee 1");
  assert(assignment?.locked, "fixed assignment should be marked locked");
};

const runTests = () => {
  testScoreRespectsPreferences();
  testBanWeekdayBlocksAssignment();
  testFixedPreferredAssignment();
  console.log("Planning solver smoke tests passed");
};

runTests();
