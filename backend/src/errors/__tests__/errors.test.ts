import { AppError } from '../errors';

describe('AppError', () => {
  it('should create an error with message and status code', () => {
    const error = new AppError('Test error', 404);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(404);
    expect(error.isOperational).toBe(true);
  });

  it('should capture stack trace', () => {
    const error = new AppError('Test error', 500);

    expect(error.stack).toBeDefined();
  });

  it('should create errors with different status codes', () => {
    const error400 = new AppError('Bad Request', 400);
    const error401 = new AppError('Sign in to continue.', 401);
    const error403 = new AppError('Forbidden', 403);
    const error404 = new AppError('Not Found', 404);
    const error500 = new AppError('Internal Server Error', 500);

    expect(error400.statusCode).toBe(400);
    expect(error401.statusCode).toBe(401);
    expect(error403.statusCode).toBe(403);
    expect(error404.statusCode).toBe(404);
    expect(error500.statusCode).toBe(500);
  });
});
