# Code Conventions Reference

The rules an AI assistant (or a new contributor) needs in order to write code that looks
like it already belonged here. Every pattern below is taken from code currently in the
repo — the referenced files are the authority if this document ever drifts.

**How to use this:** point at this file in a prompt — *"follow docs/architecture/CODE_CONVENTIONS.md"* — or
paste the relevant section. For UI styling (colors, spacing, component classes) use
[STYLE_GUIDE.md](STYLE_GUIDE.md) instead; this document deliberately does not repeat it.

## Table of Contents

- [1. Stack and Layering](#1-stack-and-layering)
- [2. File and Naming Conventions](#2-file-and-naming-conventions)
- [3. Backend: Adding an Endpoint](#3-backend-adding-an-endpoint)
- [4. Backend: Validation Schemas](#4-backend-validation-schemas)
- [5. Backend: Access Control](#5-backend-access-control-non-negotiable)
- [6. Backend: Prisma Conventions](#6-backend-prisma-conventions)
- [7. Backend: Errors](#7-backend-errors)
- [8. Frontend: Service Layer](#8-frontend-service-layer)
- [9. Frontend: Data Fetching and State](#9-frontend-data-fetching-and-state)
- [10. Frontend: Components](#10-frontend-components)
- [11. Timezones and Dates](#11-timezones-and-dates)
- [12. TypeScript Rules](#12-typescript-rules)
- [13. Comments and Documentation](#13-comments-and-documentation)
- [14. Testing](#14-testing)
- [15. Formatting](#15-formatting)
- [16. Anti-Patterns](#16-anti-patterns)
- [17. Copy-Paste Checklists](#17-copy-paste-checklists)

---

## 1. Stack and Layering

| Side | Stack | Flow |
| ---- | ----- | ---- |
| Backend | Express 4, TypeScript, Prisma, PostgreSQL, Zod, Jest | Routes → Controllers → Services → Prisma → DB |
| Frontend | React 19, TypeScript, Vite, Tailwind, TanStack Query, Zustand, Vitest | Pages → Components → Services → axios → Backend |

Rules that fall out of the layering:

- **Controllers hold no business logic.** They parse IDs, validate the body, call one
  service method, and return. Most are a single `createCrudController(...)` call.
- **Services own all business logic and every permission check.** A service method never
  touches `req`/`res`.
- **Components never call `axios` directly.** They call a service in `frontend/src/services/`.
- **Cross-cutting backend code lives in a topical directory** (`auth/`, `http/`, `prisma/`,
  `errors/`, `validation/`, `services/_shared/`). **There is no `src/utils/` on the backend** —
  do not create one.

## 2. File and Naming Conventions

### Backend (`backend/src/`)

| Kind | Path | Example |
| ---- | ---- | ------- |
| Route | `routes/<entity>.routes.ts` | `expense.routes.ts` |
| Controller | `controllers/<entity>.controller.ts` | `expense.controller.ts` |
| Service | `services/<entity>.service.ts` | `expense.service.ts` |
| Types + Zod schemas | `types/<entity>.types.ts` | `expense.types.ts` |
| Shared service helper | `services/_shared/<topic>.ts` | `tripAccess.ts` |
| Test | `<dir>/__tests__/<name>.test.ts` | `services/__tests__/expense.service.test.ts` |

- Services are **classes exported as a singleton**: `class ExpenseService { … }` then
  `export default new ExpenseService();`.
- Controllers export a **named** const: `export const expenseController = …`.
- Routers export **default**; secondary routers are named exports (see
  `budgetSummaryRouter` in [expense.routes.ts:229](../../backend/src/routes/expense.routes.ts#L229)).

### Frontend (`frontend/src/`)

| Kind | Path | Example |
| ---- | ---- | ------- |
| Component | `components/<Name>.tsx` (PascalCase) | `BudgetManager.tsx` |
| Page | `pages/<Name>.tsx` | `TripDetail.tsx` |
| Hook | `hooks/use<Name>.ts` (`.tsx` if it renders) | `useManagerCRUD.ts` |
| Service | `services/<entity>.service.ts` | `expense.service.ts` |
| Types | `types/<entity>.ts` — **no `.types` suffix** | `expense.ts` |
| Pure helper | `utils/<name>.ts` | `formatCurrency.ts` |
| Infrastructure / singletons | `lib/<name>.ts` | `axios.ts`, `entityConfig.ts` |
| Zustand store | `store/<name>Store.ts` | `authStore.ts` |
| Test | `<dir>/__tests__/<Name>.test.tsx` | `components/__tests__/ActivityManager.test.tsx` |

- Components use **default export** (132/132 do). Add a named export only if something
  already imports it that way.
- Frontend services export **both**: `export const expenseService = { … }` and
  `export default expenseService;`.
- `utils/` is for pure functions; `lib/` is for configured instances, singletons, and
  cross-cutting config.

## 3. Backend: Adding an Endpoint

The controller is declarative. Do **not** hand-write `req`/`res` handlers for CRUD —
use `createCrudController` from [crudHelpers.ts](../../backend/src/prisma/crudHelpers.ts),
which extracts the user, validates the body, calls the service, and emits
`{ status: 'success', data }` wrapped in `asyncHandler`.

```typescript
// controllers/expense.controller.ts
import expenseService from '../services/expense.service';
import { createExpenseSchema, updateExpenseSchema } from '../types/expense.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

export const expenseController = createCrudController({
  service: expenseService,
  handlers: {
    createExpense: {
      method: 'createExpense',
      statusCode: 201,                       // omit for 200
      bodySchema: createExpenseSchema,       // omit when there is no body
      buildArgs: (userId, req, body) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        body,
      ],
    },
    getExpensesByTrip: {
      method: 'getExpensesByTrip',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
  },
});
```

- **Always `parseId(value, name)`** for path params — never `Number(...)` or `parseInt`.
  It throws a 400 `AppError` on a bad value.
- The `userId` argument is supplied by `requireUserId(req)` inside the factory; services
  take `userId` as their **first parameter**, always.
- Hand-written controllers are reserved for non-CRUD work (file uploads, streaming,
  OIDC). Those still use `asyncHandler` + `requireUserId` and return the same envelope.

Routes are thin, authenticated, and OpenAPI-annotated:

```typescript
// routes/expense.routes.ts
const router = Router({ mergeParams: true }); // mergeParams when mounted under :tripId
router.use(authenticate);

/**
 * @openapi
 * /api/trips/{tripId}/expenses:
 *   post:
 *     summary: Create a new expense for a trip
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     ...
 */
router.post('/', expenseController.createExpense);
export default router;
```

Every new router must be imported and mounted in
[backend/src/index.ts](../../backend/src/index.ts) (~line 435 onward). Nested resources
mount at `/api/trips/:tripId/<thing>`.

The response envelope is fixed:

```typescript
{ status: 'success' | 'error', data?: unknown, message?: string }
```

## 4. Backend: Validation Schemas

Zod schemas live **next to the types** in `types/<entity>.types.ts`, not in `validation/`
(`validation/` holds the shared helpers). Export a `create…Schema`, an `update…Schema`,
and infer the input types.

```typescript
import { z } from 'zod';
import {
  optionalNullable, requiredStringWithMax, optionalCurrencyCode,
  optionalDatetime, optionalDatetimeCreate, optionalNotes,
} from '../validation/zodHelpers';

export const createExpenseSchema = z.object({
  description: requiredStringWithMax(500),
  amount: z.number().min(0),
  date: optionalDatetimeCreate(),   // optional, NOT nullable
});

export const updateExpenseSchema = z.object({
  description: optionalNullable(requiredStringWithMax(500)),
  amount: z.number().min(0).optional(),
  date: optionalDatetime(),         // optional AND nullable
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
```

**The create/update asymmetry is the single most important validation rule:**

- **Create schemas**: `.optional()` — a field may be absent, but `null` is not expected.
- **Update schemas**: `.optional().nullable()` — absent means "leave unchanged", `null`
  means "clear it".

Prefer a helper from [zodHelpers.ts](../../backend/src/validation/zodHelpers.ts) over an
inline chain: `requiredStringWithMax`, `optionalStringWithMax`, `numericId`,
`optionalNumericId`, `optionalPositiveNumber`, `latitude`/`longitude` (and their
`optional*` forms), `optionalUrl`, `optionalCurrencyCode`, `optionalTimezone`,
`optionalNotes`, `optionalBoolean`. Add a new helper there if you write the same chain a
third time.

Closed value sets get a `const` array + derived type, so the frontend and OpenAPI can
share one source of truth:

```typescript
export const EXPENSE_CATEGORIES = ['food', 'transportation', /* … */] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
```

## 5. Backend: Access Control (non-negotiable)

**Every service method that touches trip data starts with a permission check.** There is
no implicit ownership filter — a missing check is a data leak. Helpers live in
[services/_shared/tripAccess.ts](../../backend/src/services/_shared/tripAccess.ts).

| Situation | Call |
| --------- | ---- |
| Operating on a trip by ID | `await verifyTripAccessWithPermission(userId, tripId, 'view' \| 'edit' \| 'admin')` |
| Operating on an entity by ID | `await verifyEntityAccessWithPermission<{ tripId: number }>('activity', id, userId, 'edit')` |
| Confirming a referenced entity is in the same trip | `await verifyEntityInTrip('activity', parentId, tripId)` |

```typescript
async getActivitiesByTrip(userId: number, tripId: number) {
  await verifyTripAccessWithPermission(userId, tripId, 'view');
  // …
}

async updateActivity(userId: number, activityId: number, data: UpdateActivityInput) {
  const { entity: activity } = await verifyEntityAccessWithPermission<{ tripId: number }>(
    'activity', activityId, userId, 'edit'
  );
  // …
}
```

Reads use `'view'`; anything that writes uses `'edit'`; collaborator/settings changes use
`'admin'`. Permission levels are ordered by `PERMISSION_HIERARCHY` in
[tripPermissions.ts](../../backend/src/services/_shared/tripPermissions.ts).

Entities outside the generic `VerifiableEntityType` union (e.g. `TripExpense`) get a small
local verifier that checks the trip relation directly — see `verifyExpenseInTrip` in
[expense.service.ts:50](../../backend/src/services/expense.service.ts#L50).

## 6. Backend: Prisma Conventions

**Decimal columns.** Prisma returns `Decimal`, which does not serialize to JSON usefully.
Every service read/write that returns a costed record ends with `convertDecimals(...)`
from [`_shared/decimalConversion.ts`](../../backend/src/services/_shared/decimalConversion.ts):

```typescript
return convertDecimals(activity);
```

**Partial updates.** Never build update objects with ad-hoc `if (x !== undefined)` chains.
Use `buildConditionalUpdateData` from
[`_shared/prismaUpdateData.ts`](../../backend/src/services/_shared/prismaUpdateData.ts) —
it skips `undefined`, converts `''` to `null` by default, and applies per-field transformers:

```typescript
const updateData: Prisma.ActivityUncheckedUpdateInput = buildConditionalUpdateData(data, {
  transformers: {
    startTime: (val: string | null) => (val ? new Date(val) : null),
    // nullable Json columns need Prisma.DbNull to write a SQL NULL
    dietaryTags: (val: string[] | null) => val ?? Prisma.DbNull,
  },
});
```

For `@db.Date` (calendar-date) columns use the shared `tripDateTransformer`, which pins to
UTC midnight.

**Deletes and bulk operations** go through the generic helpers in
[crudHelpers.ts](../../backend/src/prisma/crudHelpers.ts) — they verify permission, clean
up polymorphic `EntityLink` rows (which have no FK and would otherwise be orphaned), and
run inside a transaction:

```typescript
async deleteActivity(userId: number, activityId: number) {
  return deleteEntity('activity', activityId, userId);
}

async bulkDeleteActivities(userId: number, tripId: number, data: BulkDeleteActivitiesInput) {
  return bulkDeleteEntities('activity', userId, tripId, data.ids);
}

async bulkUpdateActivities(userId: number, tripId: number, data: BulkUpdateActivitiesInput) {
  return bulkUpdateEntities('activity', userId, tripId, data.ids, data.updates, {
    allowedFields: ['category', 'currency'],   // whitelist; guards field injection
    fieldMapping: { carrier: 'company' },      // input name → column name
  });
}
```

**Reused `include`/`select` shapes** belong in
[prisma/prismaIncludes.ts](../../backend/src/prisma/prismaIncludes.ts)
(`activityFullInclude`, `locationSelect`, `tripAccessSelect`, …) rather than being copied
between services.

**Multi-step writes are transactional.** Anything that deletes links and rows together,
or writes two tables that must agree, runs in `prisma.$transaction(async (tx) => { … })`.

## 7. Backend: Errors

Throw `AppError` from [errors/errors.ts](../../backend/src/errors/errors.ts). Never
construct a response from a service.

```typescript
import { AppError } from '../errors/errors';

throw new AppError('Expense not found or does not belong to trip', 404);
throw new AppError('Failed to reach the routing provider', 502, { cause: err });
```

[errorHandler.ts](../../backend/src/middleware/errorHandler.ts) is already mounted and maps:

| Thrown | Response |
| ------ | -------- |
| `ZodError` | 400 `Validation failed` + offending field names only |
| Prisma `P2002` | 400 `A record with this value already exists` |
| Prisma `P2003` | 400 `Referenced record does not exist` |
| Prisma `P2025` | 404 `Record not found` |
| `AppError` | its own `statusCode` + message |
| anything else | 500 `Internal server error` (message never leaked) |

Because `asyncHandler` wraps every handler, **do not wrap service calls in try/catch just
to re-throw**. Catch only when you can add real information — and pass `{ cause }`.

Never log request bodies without redaction; the handler's `sanitizeForLogging` exists for
that reason.

## 8. Frontend: Service Layer

One object per entity, one method per endpoint, typed with the **unwrapped** payload.
`lib/axios.ts` strips the `{ status, data }` envelope in a response interceptor, so
`response.data` is already the payload.

```typescript
import axios from '../lib/axios';
import type { TripExpense, CreateExpenseInput } from '../types/expense';

export const expenseService = {
  async createExpense(tripId: number, data: CreateExpenseInput): Promise<TripExpense> {
    const response = await axios.post<TripExpense>(`/trips/${tripId}/expenses`, data);
    return response.data;
  },

  async deleteExpense(tripId: number, expenseId: number): Promise<void> {
    await axios.delete(`/trips/${tripId}/expenses/${expenseId}`);
  },
};

export default expenseService;
```

- Type the axios generic with the payload (`axios.get<Foo[]>`), **not** the envelope.
- URLs are relative to `VITE_API_URL` — no leading `/api`.
- Services throw; they do not catch, toast, or log. Callers handle failure.
- Auth token injection, CSRF headers, 401 refresh-and-retry, and 429 exponential backoff
  are all handled in [lib/axios.ts](../../frontend/src/lib/axios.ts). Do not re-implement
  any of it, and do not create a second axios instance.

## 9. Frontend: Data Fetching and State

Three patterns coexist. Pick by what the code around you already does:

**TanStack Query** — for shared/cached server state. Query keys are arrays of
`[resourceName, ...scoping ids]`, and mutations invalidate every key they affect:

```typescript
const { data: expenses = [], isLoading } = useQuery({
  queryKey: ['expenses', tripId],
  queryFn: () => expenseService.getExpensesByTrip(tripId),
});

await expenseService.createExpense(tripId, payload);
queryClient.invalidateQueries({ queryKey: ['expenses', tripId] });
queryClient.invalidateQueries({ queryKey: ['budget-summary', tripId] });
```

**`useManagerCRUD`** — for `*Manager` components. It supplies items, loading, form
visibility, editing id, create/update/delete with toasts, and delete-confirmation copy;
it removes ~150 lines of boilerplate per manager. See
[useManagerCRUD.ts](../../frontend/src/hooks/useManagerCRUD.ts).

```typescript
const manager = useManagerCRUD(activityService, tripId, {
  itemName: 'activity',
  onUpdate: refreshParentData,
});
```

**Zustand** — only for genuinely global client state: `authStore`, `themeStore`,
`navigationStore`, `scrollStore`. Server data does not go in a store.

Whichever you use: after any successful create/update/delete, call `onUpdate?.()` and/or
invalidate the query keys. Stale-looking UI is almost always a missed one of those.

## 10. Frontend: Components

```tsx
interface BudgetManagerProps {
  tripId: number;
  budget: number | null;
  onUpdate?: () => void;
}

export default function BudgetManager({ tripId, budget, onUpdate }: BudgetManagerProps) { … }
```

- Props are an `interface` named `<Component>Props`, declared directly above the component.
- Function components only. Hooks at the top, handlers next, JSX last.
- Local form state gets a typed shape plus an `EMPTY_*_FORM` constant to reset to
  (see [BudgetManager.tsx](../../frontend/src/components/BudgetManager.tsx)).
- Feedback: `toast.success/error` from `react-hot-toast`. Destructive actions go through
  `useConfirmDialog` — never `window.confirm`.
- Empty and loading states use the shared `EmptyState` and `SkeletonLoader` components,
  not bespoke markup.
- Constants and lookup tables (labels, emoji, colors, display order) belong in
  `lib/entityConfig.ts` or a `constants/` module, not inline in JSX.
- **Styling: follow [STYLE_GUIDE.md](STYLE_GUIDE.md).** Tailwind utility classes, dark
  mode variants on every surface, 44px minimum touch targets.

### Forms: the shared hooks and components

Use these instead of reinventing them; each exists because a plain implementation had a bug.

| Concern | Use | Why |
| ------- | --- | --- |
| Double click on Add/Save created duplicates | `useSubmitLock` (`run(fn)`, `isSubmitting`) | The lock is a ref, so it holds before React re-renders |
| "Save & Add Another" | `useSaveAndAddAnother` (`beginSubmit()` at the top of every submit, `keepOpen()` after awaits) | `setKeepOpen(true); form.requestSubmit()` runs the *previous* render's handler and sees stale state |
| Currency input | `CurrencySelect` (limited to `CONVERTIBLE_CURRENCIES`), never a free-text box | The backend can only convert currencies in that list; `allowEmpty` for optional fields |
| Place plus a same-named activity/lodging | `useLinkedCreate` + `forms/AlsoCreatePlaceOption` | Creates and links the pair in one flow |
| Closing a form warns about unsaved changes | `useUnsavedChangesWarning`; don't count pre-filled defaults as edits | Pre-filled "previous entry" values once triggered false warnings |
| Modal footers | `shared/FormModalFooter` inside `FormModal` | Consistent Cancel / Add / Add Another buttons |
| Manager list + form state | `useManagerCRUD` with `useManagerFormWrapper` | Removes ~150 lines of boilerplate per manager |

Rules of thumb: a dialog must not be rendered *inside* a menu that unmounts when it closes
(the dialog dies with it; this is how the PDF import button broke on phones, see
`PdfImportButton`); and never call `setState` then immediately `requestSubmit()` expecting the
new state.

## 11. Timezones and Dates

The rule: **never fall back to UTC for display.** Resolve most-specific-first —
`entity.timezone → trip.timezone → user.timezone → browser timezone → UTC`.

Frontend, inside React:

```typescript
const resolveTz = useTimezoneResolver();               // hooks/useTimezoneResolver.ts
const effectiveTz = resolveTz(activity.timezone, tripTimezone);
```

Outside React, call `resolveTimezone(...candidates)` from `utils/timezone.ts` and pass the
user's zone explicitly. **Never read `Intl.DateTimeFormat().resolvedOptions().timeZone`
directly** — it skips the user's configured setting — and never write `|| 'UTC'`.

Backend: `resolveTimezone(...)` and `getUserTimezone(userId)` live in
[services/_shared/timezoneResolution.ts](../../backend/src/services/_shared/timezoneResolution.ts).
Any read path that groups or formats dates for a user ends its chain with that user's zone:

```typescript
const tz = resolveTimezone(requestedTimezone, await getUserTimezone(userId));
```

**The one exception — date-only values.** `@db.Date` columns (trip start/end, expense
dates) hold a calendar date stored at UTC midnight. Format those with `formatDateOnly()`
from `utils/timezone.ts`, which pins to UTC deliberately; anything else renders the
previous day west of UTC. Conversely, to bucket a real timestamp onto a calendar day use
`dayKeyInTimezone()` — slicing the ISO string groups by the UTC day and misfiles evening
events.

The signed-in user's timezone rides along in the auth session payload
(`types/auth.ts` → `User.timezone`), so no extra fetch is needed.

## 12. TypeScript Rules

- **No `any`.** Use `unknown` plus narrowing, generics, or a union. The rare unavoidable
  case carries an `eslint-disable-next-line` with a written justification — match that bar.
- Type guards over casts: `isPrismaError(err)`, `isValidPermissionLevel(value)`,
  `isDefined(value)` are the house style.
- `import type { … }` for type-only imports on the frontend.
- Derive types rather than restating them: `z.infer<typeof schema>`,
  `(typeof ARRAY)[number]`, `Prisma.ActivityUncheckedUpdateInput`.
- Backend `npm run build` uses a relaxed config; **`npm run build:strict` is the real
  gate.** Frontend `npm run build` does not fail on type errors — use
  `npm run build:strict` to check your work.

## 13. Comments and Documentation

Comment density here is high and deliberate. Match it:

- **JSDoc on every exported helper, hook, and service class** — purpose, `@param`,
  `@returns`, and a fenced `@example` for anything generic.
- **Explain *why*, not *what*.** The valuable comments in this repo justify a decision:
  *"The trip OWNER's home currency wins, not the requesting user's: … Letting each
  collaborator impose their own would make every read invalidate and rewrite the
  snapshots."* Write those.
- Non-obvious constraints get a note at the point of impact — e.g. the `mergeParams`
  comment on nested routers, or why `dietaryTags` needs `Prisma.DbNull`.
- Section banners inside long shared modules:

  ```typescript
  // =============================================================================
  // CONTROLLER FACTORY
  // =============================================================================
  ```

- Public endpoints get `@openapi` JSDoc in the route file, including `tags`, `security`,
  parameters, and every response code.

## 14. Testing

| Side | Runner | Location |
| ---- | ------ | -------- |
| Backend | Jest (`npm test` in `backend/`) | `src/**/__tests__/*.test.ts` |
| Frontend | Vitest + Testing Library (`npm test` in `frontend/`) | `src/**/__tests__/*.test.tsx` |

Every test file opens with a header block listing stable test IDs, and each `it()` title
starts with its ID:

```typescript
/**
 * Expense Service Tests
 *
 * Test cases:
 * - EXP-001: Create expense freezes an FX snapshot at the transaction date
 * - EXP-012: Access control - view/edit permission is enforced
 */
```

Prefixes in use: `EXP-`, `MGR-ACT-`, etc. — entity- or component-scoped, three digits.

**Backend**: mock Prisma with a hand-built object and `jest.mock('../../config/database')`:

```typescript
const mockPrisma = { tripExpense: { create: jest.fn(), findMany: jest.fn() } };
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));
```

**Frontend**: mock the service module (exporting both the named and default shapes, since
services export both), wrap in `QueryClientProvider` + `BrowserRouter`, and pull fixtures
from `src/test/fixtures`:

```typescript
vi.mock('../../services/activity.service', () => {
  const mockService = { getActivitiesByTrip: vi.fn(), createActivity: vi.fn() };
  return { activityService: mockService, default: mockService };
});
```

Access control deserves its own test case per service. See
[TESTING_GUIDE.md](../guides/TESTING_GUIDE.md) for the fuller strategy.

## 15. Formatting

There is no Prettier config — formatting is by convention, so **match the file you are
editing**:

- 2-space indent, semicolons, trailing commas in multi-line literals, ~90 char soft wrap.
- Quotes: backend uses single quotes throughout. The frontend is mixed (older files single,
  newer double) — follow the surrounding file rather than reformatting it.
- ESLint (`frontend/eslint.config.js`) is the only automated check: `npm run lint`.
- Don't reformat untouched lines; keep diffs to the change.

## 16. Anti-Patterns

Things that will look wrong in review here:

| Don't | Do |
| ----- | -- |
| `parseInt(req.params.id)` | `parseId(req.params.id, 'id')` |
| Business logic in a controller | Put it in the service |
| A service method without a permission check | `verifyTripAccessWithPermission(...)` first |
| `res.status(404).json(...)` from a service | `throw new AppError('…', 404)` |
| `try/catch` around a service call to re-throw | Let `asyncHandler` handle it |
| `if (x !== undefined) data.x = x` chains | `buildConditionalUpdateData(data, …)` |
| Returning raw Prisma `Decimal` | `convertDecimals(result)` |
| `prisma.x.delete()` for a linked entity | `deleteEntity(type, id, userId)` |
| `axios` imported in a component | Call a service in `services/` |
| Typing axios with `{ status, data }` | Type it with the unwrapped payload |
| `|| 'UTC'` or `Intl…resolvedOptions().timeZone` | `useTimezoneResolver()` / `resolveTimezone(...)` |
| `window.confirm` | `useConfirmDialog` |
| `any` | `unknown` + narrowing, generics, or a union |
| A new `backend/src/utils/` directory | The existing topical directory |
| Silent data refresh gaps | `onUpdate?.()` + `invalidateQueries` |

## 17. Copy-Paste Checklists

### New backend endpoint

1. Schemas + inferred types in `types/<entity>.types.ts` (create: optional; update: optional+nullable).
2. Service method on the singleton class — `userId` first, permission check first line,
   `convertDecimals` on the way out.
3. Controller entry in `createCrudController`, with `parseId` in `buildArgs`.
4. Route with `authenticate` and an `@openapi` block.
5. Mount the router in `backend/src/index.ts`.
6. Test file with an ID header, including an access-control case.
7. `npm run build:strict` in `backend/`.

### New frontend feature

1. Types in `types/<entity>.ts` (mirror the backend payload, unwrapped).
2. Service methods in `services/<entity>.service.ts` — named + default export.
3. Data access: TanStack Query with `[resource, tripId]` keys, or `useManagerCRUD` for a manager.
4. Component with a `<Name>Props` interface, default export, `EmptyState` / `SkeletonLoader`,
   `toast` feedback, `useConfirmDialog` for destructive actions.
5. Styling per [STYLE_GUIDE.md](STYLE_GUIDE.md), including dark mode.
6. Invalidate every affected query key; call `onUpdate?.()`.
7. `npm run lint` and `npm run build:strict` in `frontend/`.

---

## Related Documentation

- [Backend Architecture](BACKEND_ARCHITECTURE.md) — services, middleware, auth flow in depth
- [Frontend Architecture](FRONTEND_ARCHITECTURE.md) — component inventory, hooks, routing
- [Style Guide](STYLE_GUIDE.md) — colors, typography, spacing, component classes
- [Database Schema](DATABASE_SCHEMA.md) — models, relationships, entity linking
- [Development Workflows](../guides/DEVELOPMENT_WORKFLOWS.md) — feature-by-feature how-tos
- [Testing Guide](../guides/TESTING_GUIDE.md) — testing strategy
