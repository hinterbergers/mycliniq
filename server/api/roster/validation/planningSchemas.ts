import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

import planningInputSchema from "../schemas/planning-input.v1.schema.json";
import planningOutputSchema from "../schemas/planning-output.v1.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

export const validatePlanningInputV1 = ajv.compile(planningInputSchema);
export const validatePlanningOutputV1 = ajv.compile(planningOutputSchema);

const formatAjvErrors = (errors?: ErrorObject[] | null) => {
  if (!errors?.length) return "no additional details";
  return errors
    .map(
      (error, index) =>
        `${index + 1}. ${error.instancePath || "/"} ${error.message ?? "validation failed"}`
    )
    .join("\n");
};

const throwValidationError = (label: string, validateFn: ValidateFunction) => {
  const msg = formatAjvErrors(validateFn.errors);
  throw new Error(`${label} invalid:\n${msg}`);
};

export function assertValidPlanningInput(payload: unknown) {
  const ok = validatePlanningInputV1(payload);
  if (!ok) {
    throwValidationError("PlanningInputV1", validatePlanningInputV1);
  }
}

export function assertValidPlanningOutput(payload: unknown) {
  const ok = validatePlanningOutputV1(payload);
  if (!ok) {
    throwValidationError("PlanningOutputV1", validatePlanningOutputV1);
  }
}
