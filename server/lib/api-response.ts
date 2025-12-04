import type { Response } from "express";

/**
 * API Response Helpers for consistent JSON responses
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Send a success response with data
 */
export function ok<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({
    success: true,
    data
  } as ApiResponse<T>);
}

/**
 * Send a success response for created resources
 */
export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

/**
 * Send a success response with a message
 */
export function okMessage(res: Response, message: string): Response {
  return res.status(200).json({
    success: true,
    message
  } as ApiResponse);
}

/**
 * Send an error response
 */
export function error(
  res: Response, 
  message: string, 
  statusCode = 400
): Response {
  return res.status(statusCode).json({
    success: false,
    error: message
  } as ApiResponse);
}

/**
 * Send a not found error
 */
export function notFound(res: Response, entity = "Ressource"): Response {
  return error(res, `${entity} nicht gefunden`, 404);
}

/**
 * Send an unauthorized error
 */
export function unauthorized(res: Response, message = "Nicht authentifiziert"): Response {
  return error(res, message, 401);
}

/**
 * Send a forbidden error
 */
export function forbidden(res: Response, message = "Keine Berechtigung"): Response {
  return error(res, message, 403);
}

/**
 * Send a validation error
 */
export function validationError(res: Response, message: string): Response {
  return error(res, message, 422);
}

/**
 * Send a server error
 */
export function serverError(res: Response, message = "Interner Serverfehler"): Response {
  return error(res, message, 500);
}

/**
 * Wrap async route handlers to catch errors
 */
export function asyncHandler(
  fn: (req: any, res: Response) => Promise<any>
) {
  return (req: any, res: Response) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error("API Error:", err);
      serverError(res, err.message || "Interner Serverfehler");
    });
  };
}
