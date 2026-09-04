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

const createState = (
  overrides: Partial<PlannerEmployeeState> = {},
): PlannerEmployeeState => ({
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
  assignedWeekendDays: { Fri: 0, Sat: 0, Sun: 0 },
  longTermRules: [],
  preferences: {
    preferDates: new Set(),
    avoidDates: new Set(),
    preferServiceTypes: new Set(),
    avoidServiceTypes: new Set(),
    preferFridayBeforeSunday: false,
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
      preferFridayBeforeSunday: false,
    },
  });
  const avoidState = createState({
    preferences: {
      preferDates: new Set(),
      avoidDates: new Set(["2026-03-01"]),
      preferServiceTypes: new Set(),
      avoidServiceTypes: new Set(["gyn"]),
      preferFridayBeforeSunday: false,
    },
  });

  const preferScore = scoreCandidateForSlot(preferState, slot);
  const avoidScore = scoreCandidateForSlot(avoidState, slot);
  assert(
    preferScore > avoidScore,
    "preferred service types should score higher than avoided ones",
  );
};

const testSundayPrefersExistingFridayAssignment = () => {
  const slot = { date: "2026-03-08", roleId: "gyn" };
  const comboState = createState({
    assignedDates: new Set(["2026-03-06"]),
    preferences: {
      preferDates: new Set(),
      avoidDates: new Set(),
      preferServiceTypes: new Set(),
      avoidServiceTypes: new Set(),
      preferFridayBeforeSunday: true,
    },
  });
  const neutralState = createState({
    assignedDates: new Set(["2026-03-06"]),
    preferences: {
      preferDates: new Set(),
      avoidDates: new Set(),
      preferServiceTypes: new Set(),
      avoidServiceTypes: new Set(),
      preferFridayBeforeSunday: false,
    },
  });

  const comboScore = scoreCandidateForSlot(comboState, slot);
  const neutralScore = scoreCandidateForSlot(neutralState, slot);
  assert(
    comboScore > neutralScore,
    "sunday assignment should prefer employees already assigned on the prior friday",
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

const testBoundaryAssignmentBlocksFirstDayOfMonth = () => {
  const input = {
    meta: {
      timezone: "Europe/Vienna",
      createdAt: new Date().toISOString(),
      planningKind: "MONTHLY_DUTY",
    },
    period: {
      startDate: "2026-04-01",
      endDate: "2026-04-01",
      year: 2026,
      month: 4,
    },
    roles: [{ id: "gyn", label: "Gynäkologie (OA)" }],
    slots: [
      {
        id: "2026-04-01-gyn",
        date: "2026-04-01",
        roleId: "gyn",
        required: 1,
        isWeekend: false,
      },
    ],
    employees: ["1", "2"].map((id) => ({
      id,
      name: `Dr. ${id}`,
      group: "OA",
      capabilities: { canRoleIds: ["gyn"] },
      constraints: { limits: { maxSlotsInPeriod: 5 }, hard: {} },
    })),
    history: {
      recentAssignments: [{ employeeId: "1", date: "2026-03-31" }],
    },
    rules: { hardRules: [] },
  };

  const result = createAssignments(input, [], [], []);
  const assignment = result.assignments.find(
    (entry) => entry.slotId === "2026-04-01-gyn",
  );
  assert(
    assignment?.employeeId === "2",
    "a service on the final day of the prior month must block the first day",
  );
};

const runTests = () => {
  testScoreRespectsPreferences();
  testSundayPrefersExistingFridayAssignment();
  testBanWeekdayBlocksAssignment();
  testFixedPreferredAssignment();
  testBoundaryAssignmentBlocksFirstDayOfMonth();
  console.log("Planning solver smoke tests passed");
};

runTests();
