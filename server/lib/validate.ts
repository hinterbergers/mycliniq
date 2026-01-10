import type { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { fromZodError } from "zod-validation-error";
import { validationError } from "./api-response";

/**
 * Validation middleware and helpers
 */

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const formattedError = fromZodError(result.error);
      return validationError(res, formattedError.message);
    }

    req.body = result.data;
    next();
  };
}

/**
 * Validate request query parameters
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const formattedError = fromZodError(result.error);
      return validationError(res, formattedError.message);
    }

    req.query = result.data;
    next();
  };
}

/**
 * Validate request params
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const formattedError = fromZodError(result.error);
      return validationError(res, formattedError.message);
    }

    req.params = result.data;
    next();
  };
}

/**
 * Common validation schemas
 */
export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "ID muss eine Zahl sein").transform(Number),
});

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default("50"),
});

export const yearMonthSchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/, "Jahr muss 4-stellig sein")
    .transform(Number),
  month: z
    .string()
    .regex(/^(1[0-2]|[1-9])$/, "Monat muss 1-12 sein")
    .transform(Number),
});

export const dateRangeSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
});
