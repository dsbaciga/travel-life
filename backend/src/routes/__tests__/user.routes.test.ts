/**
 * Guards against settings endpoints whose controller handlers exist but were
 * never wired to a route (the LLM settings page returned "Cannot PUT
 * /api/users/llm-settings" for exactly this reason).
 */
jest.mock('../../middleware/auth', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import type { Router } from 'express';
import userRoutes from '../user.routes';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function registeredMethods(router: Router, path: string): string[] {
  return (router.stack as RouteLayer[])
    .filter((layer) => layer.route?.path === path)
    .flatMap((layer) => Object.keys(layer.route?.methods ?? {}));
}

describe('user routes', () => {
  it.each([
    '/llm-settings',
    '/immich-settings',
    '/weather-settings',
    '/aviationstack-settings',
    '/openrouteservice-settings',
    '/maps-settings',
    '/smtp-settings',
  ])('registers GET and PUT for %s', (path) => {
    const methods = registeredMethods(userRoutes, path);
    expect(methods).toEqual(expect.arrayContaining(['get', 'put']));
  });
});
