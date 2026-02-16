export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  cause?: unknown;

  constructor(message: string, statusCode: number, options?: { cause?: unknown }) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    // ES2022 Error cause support - set manually for ES2020 compatibility
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}
