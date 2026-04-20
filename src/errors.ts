/** Base error class for Supervisor API errors. */
export class SupervisorError extends Error {
  public readonly statusCode: number;
  public readonly details?: string;

  constructor(statusCode: number, message: string, details?: string) {
    super(`[${statusCode}] ${message}${details ? `: ${details}` : ""}`);
    this.name = "SupervisorError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Raised when authentication fails (401). */
export class AuthenticationError extends SupervisorError {
  constructor(message: string, details?: string) {
    super(401, message, details);
    this.name = "AuthenticationError";
  }
}

/** Raised when rate limited (429). */
export class RateLimitError extends SupervisorError {
  constructor(message: string, details?: string) {
    super(429, message, details);
    this.name = "RateLimitError";
  }
}

/** Raised when request validation fails (400/422). */
export class ValidationError extends SupervisorError {
  constructor(statusCode: number, message: string, details?: string) {
    super(statusCode, message, details);
    this.name = "ValidationError";
  }
}
