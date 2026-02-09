import { jest, describe, it, expect } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../asyncHandler';

describe('asyncHandler', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis() as unknown as Response['status'],
      json: jest.fn() as unknown as Response['json'],
    };
    nextFunction = jest.fn() as jest.Mock;
  });

  it('should call the wrapped async function with req, res, next', async () => {
    const handler = jest.fn<(req: Request, res: Response, next: NextFunction) => Promise<void>>()
      .mockResolvedValue(undefined);

    const wrapped = asyncHandler(handler);
    await wrapped(mockRequest as Request, mockResponse as Response, nextFunction as unknown as NextFunction);

    expect(handler).toHaveBeenCalledWith(mockRequest, mockResponse, nextFunction);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not call next(error) when the async function succeeds', async () => {
    const handler = jest.fn<(req: Request, res: Response, next: NextFunction) => Promise<void>>()
      .mockResolvedValue(undefined);

    const wrapped = asyncHandler(handler);
    await wrapped(mockRequest as Request, mockResponse as Response, nextFunction as unknown as NextFunction);

    // next should not be called with an error
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next(error) when the async function throws', async () => {
    const error = new Error('Something went wrong');
    const handler = jest.fn<(req: Request, res: Response, next: NextFunction) => Promise<void>>()
      .mockRejectedValue(error);

    const wrapped = asyncHandler(handler);
    await wrapped(mockRequest as Request, mockResponse as Response, nextFunction as unknown as NextFunction);

    // Need to wait for the promise rejection to propagate
    // asyncHandler uses Promise.resolve().catch(next), so we wait a tick
    await new Promise(resolve => setImmediate(resolve));

    expect(nextFunction).toHaveBeenCalledWith(error);
    expect(nextFunction).toHaveBeenCalledTimes(1);
  });

  it('should forward the specific error object to next', async () => {
    const specificError = new TypeError('Type mismatch');
    const handler = jest.fn<(req: Request, res: Response, next: NextFunction) => Promise<void>>()
      .mockRejectedValue(specificError);

    const wrapped = asyncHandler(handler);
    await wrapped(mockRequest as Request, mockResponse as Response, nextFunction as unknown as NextFunction);

    await new Promise(resolve => setImmediate(resolve));

    expect(nextFunction).toHaveBeenCalledWith(specificError);
  });

  it('should return a function (middleware)', () => {
    const handler = jest.fn<(req: Request, res: Response, next: NextFunction) => Promise<void>>()
      .mockResolvedValue(undefined);

    const wrapped = asyncHandler(handler);

    expect(typeof wrapped).toBe('function');
  });

  it('should handle async functions that return a Response', async () => {
    const handler = jest.fn<(req: Request, res: Response, next: NextFunction) => Promise<Response>>()
      .mockResolvedValue(mockResponse as Response);

    const wrapped = asyncHandler(handler as unknown as (req: Request, res: Response, next: NextFunction) => Promise<void | Response>);
    await wrapped(mockRequest as Request, mockResponse as Response, nextFunction as unknown as NextFunction);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});
