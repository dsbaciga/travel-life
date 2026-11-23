import { jest, describe, it, expect, afterEach } from '@jest/globals';
import express, { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

// Every controller handler answers 200 so the test sees which route matched.
jest.mock('../../controllers/collaboration.controller', () => ({
  __esModule: true,
  collaborationController: new Proxy(
    {},
    { get: () => (_req: Request, res: Response) => res.json({ handler: 'collaboration' }) }
  ),
}));

// Stand-in for the real middleware: no bearer token, no entry.
jest.mock('../../middleware/auth', () => ({
  __esModule: true,
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization) return next();
    res.status(401).json({ status: 'error', message: 'Sign in to continue.' });
  },
}));

import collaborationRoutes from '../collaboration.routes';

/**
 * The collaboration router is mounted at the bare /api prefix. It once used a
 * path-less `router.use(authenticate)`, which ran for every /api request that
 * reached it and so turned the public routers mounted after it (share links,
 * calendar feed, invitation acceptance) into 401s.
 */
describe('collaboration routes mounted at /api', () => {
  // Real HTTP round trips: give them room when the whole suite runs in parallel.
  jest.setTimeout(30000);

  let server: Server | undefined;

  afterEach(async () => {
    // fetch keeps its connections alive, and close() waits for them to end;
    // drop them first so teardown cannot run into the test timeout.
    server?.closeAllConnections();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  const start = async (): Promise<string> => {
    const app = express();
    app.use('/api', collaborationRoutes);
    // What index.ts mounts afterwards: routes with no authentication of their own.
    app.get('/api/public/trips/:token', (_req, res) => res.json({ handler: 'public' }));
    app.get('/api/calendar/:token', (_req, res) => res.json({ handler: 'calendar' }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server?.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  };

  it('has no router-level middleware', () => {
    const layers: Array<{ route?: unknown }> = collaborationRoutes.stack;
    expect(layers.length).toBeGreaterThan(0);
    expect(layers.every((layer) => layer.route !== undefined)).toBe(true);
  });

  it('lets unauthenticated requests through to routers mounted after it', async () => {
    const base = await start();

    const share = await fetch(`${base}/api/public/trips/abc`);
    expect(share.status).toBe(200);
    expect(await share.json()).toEqual({ handler: 'public' });

    const calendar = await fetch(`${base}/api/calendar/abc`);
    expect(calendar.status).toBe(200);
    expect(await calendar.json()).toEqual({ handler: 'calendar' });
  });

  it('still requires authentication on its own routes', async () => {
    const base = await start();

    for (const path of ['/api/invitations', '/api/trips/shared', '/api/trips/5/collaborators']) {
      const anonymous = await fetch(`${base}${path}`);
      expect(anonymous.status).toBe(401);

      const signedIn = await fetch(`${base}${path}`, { headers: { Authorization: 'Bearer x' } });
      expect(signedIn.status).toBe(200);
    }

    const anonymousWrite = await fetch(`${base}/api/trips/5/invitations`, { method: 'POST' });
    expect(anonymousWrite.status).toBe(401);
  });

  it('keeps the invitation lookup by token public', async () => {
    const base = await start();
    const response = await fetch(`${base}/api/invitations/token/abc`);
    expect(response.status).toBe(200);
  });
});
