# Frontend Architecture - Travel Life

This document provides a comprehensive overview of the frontend architecture, patterns, and conventions used in Travel Life.

**Tech Stack**: React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query + Zustand + Leaflet

Last Updated: 2026-05-15 | Current Version: v5.4.0

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [State Management](#state-management)
4. [Data Flow Patterns](#data-flow-patterns)
5. [Component Architecture](#component-architecture)
6. [API Communication](#api-communication)
7. [Routing](#routing)
8. [Styling & UI](#styling--ui)
9. [Type System](#type-system)
10. [Common Patterns](#common-patterns)
11. [Best Practices](#best-practices)

---

## Architecture Overview

### Core Architecture Pattern

```
┌─────────────────────────────────────────────────────┐
│                       Pages                         │
│  (Route-level components, coordinate features)      │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│                    Components                       │
│     (Reusable UI components, business logic)        │
└─────────┬───────────────────────────────┬───────────┘
          │                               │
          ▼                               ▼
    ┌─────────┐                     ┌─────────┐
    │ Zustand │                     │TanStack │
    │  Store  │                     │  Query  │
    └─────────┘                     └─────────┘
   Global State                    Server State
   (auth, theme)                (trips, activities)
          │                               │
          └───────────┬───────────────────┘
                      ▼
              ┌──────────────┐
              │Service Classes│
              │ (API clients) │
              └───────┬───────┘
                      │
                      ▼
              ┌──────────────┐
              │ Axios Client │
              │(HTTP requests)│
              └───────┬───────┘
                      │
                      ▼
              ┌──────────────┐
              │ Backend API  │
              └──────────────┘
```

### Key Principles

1. **Separation of Concerns**: Pages orchestrate, components implement, services communicate
2. **Server State vs Client State**: TanStack Query for server data, Zustand for UI state
3. **Type Safety**: Comprehensive TypeScript types for all data structures
4. **Component Composition**: Small, focused components composed into larger features
5. **Declarative UI**: React's declarative approach with functional components

---

## Directory Structure

```text
frontend/src/
  components/          # Reusable UI components
    ActivityManager.tsx
    LodgingManager.tsx
    TransportationManager.tsx
    JournalManager.tsx
    LocationQuickAdd.tsx
    LocationSearchMap.tsx
    PhotoGallery.tsx
    Timeline.tsx
    ...
  pages/               # Route-level components
    DashboardPage.tsx    # "Today": agenda and map split view
    LibraryPage.tsx      # Hub for collection pages
    TripDetailPage.tsx
    TripsPage.tsx
    SettingsPage.tsx
    ...
  services/            # API client classes
    activity.service.ts
    trip.service.ts
    location.service.ts
    auth.service.ts
    ...
  hooks/               # Custom React hooks (~34 hooks)
    useManagerCRUD.ts
    useFormFields.ts
    usePagination.ts
    ...
  store/               # Zustand global state
    authStore.ts
    themeStore.ts
  types/               # TypeScript type definitions
    activity.ts
    trip.ts
    location.ts
    ...
  lib/                 # Shared utilities and config
    axios.ts                 # Configured axios instance
    config.ts                # Environment configuration
    queryClientSetup.ts      # TanStack Query client + persistence
    ...
  utils/               # Helper functions
    timezone.ts              # Timezone utilities
    ...
  constants/           # Shared constant values
  assets/              # Static assets (images, etc.)
  test/                # Test setup and utilities
  App.tsx              # Main app component with routing
  main.tsx             # Application entry point
  index.css            # Global styles (Tailwind)
```

### File Naming Conventions

- **Components**: PascalCase (e.g., `ActivityManager.tsx`)
- **Services**: camelCase with `.service.ts` suffix (e.g., `activity.service.ts`)
- **Types**: camelCase with `.ts` suffix (e.g., `activity.ts`)
- **Utilities**: camelCase (e.g., `timezone.ts`)
- **Stores**: camelCase with `Store.ts` suffix (e.g., `authStore.ts`)

---

## State Management

### Zustand - Global Client State

**Purpose**: Manage UI-related global state that doesn't come from the server.

**Location**: `src/store/`

**Current Stores**:

#### 1. Auth Store (`authStore.ts`)
```typescript
interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  // ... other auth methods
}
```

**Usage**:
```typescript
import { useAuthStore } from '../store/authStore';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuthStore();

  if (!isAuthenticated) {
    return <Login />;
  }

  return <div>Welcome {user.name}</div>;
}
```

#### 2. Theme Store (`themeStore.ts`)
```typescript
interface ThemeState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}
```

**Usage**:
```typescript
import { useThemeStore } from '../store/themeStore';

function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <button onClick={toggleTheme}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
```

### TanStack Query - Server State

**Purpose**: Fetch, cache, and synchronize server data.

TanStack Query (`@tanstack/react-query`) **is actively used** in this project.
The query client is configured in `src/lib/queryClientSetup.ts` and is paired
with `@tanstack/react-query-persist-client` to persist the cache to IndexedDB
for PWA offline support. The app is wrapped in `PersistQueryClientProvider` in
`src/App.tsx`. Around 19 files use `useQuery` for data fetching today.

**Two coexisting patterns**:

- **TanStack Query (`useQuery` / `useMutation`)** — used for cacheable,
  offline-aware reads (e.g. dashboards, lists, detail data). Provides automatic
  caching, background refetching, and persistence across sessions.
- **`useManagerCRUD` hook** — a manual CRUD pattern still used by the Manager
  components (see [Common Patterns](#common-patterns)). It manages
  component-level entity lists and refreshes via `loadData()` callbacks.

New data-fetching code should prefer TanStack Query. The `useManagerCRUD`
pattern remains for the existing Manager components.

---

## Data Flow Patterns

### 1. Parent-Child Communication

**Pattern**: Props down, callbacks up

```typescript
// Parent component
function TripDetailPage() {
  const loadTripData = async (tripId: number) => {
    // Fetch all data
    setActivities(data);
    setActivitiesCount(data.length);
  };

  return (
    <ActivityManager
      tripId={trip.id}
      locations={locations}
      onUpdate={() => loadTripData(trip.id)}  // Callback for refresh
    />
  );
}

// Child component
function ActivityManager({ tripId, locations, onUpdate }) {
  const handleSubmit = async () => {
    await activityService.createActivity(data);
    loadActivities();  // Refresh local state
    onUpdate?.();      // Notify parent to refresh counts
  };
}
```

### 2. Service � Component Flow

```typescript
// 1. User action in component
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // 2. Call service method
  try {
    const result = await activityService.createActivity(data);

    // 3. Update local state
    setActivities([...activities, result]);

    // 4. Notify parent (if callback provided)
    onUpdate?.();

    // 5. Show user feedback
    toast.success("Activity created");
  } catch (error) {
    toast.error("Failed to create activity");
  }
};
```

### 3. Authentication Flow

```text
┌───────────────┐
│  Login Page   │
└───────┬───────┘
        │ 1. User submits credentials
        ▼
┌───────────────┐
│   authStore   │
│   login()     │
└───────┬───────┘
        │ 2. Call auth service
        ▼
┌───────────────┐
│  auth.service │
└───────┬───────┘
        │ 3. POST /api/auth/login
        ▼
┌───────────────┐
│  Backend API  │
└───────┬───────┘
        │ 4. Returns tokens (access token + httpOnly refresh cookie)
        ▼
┌───────────────┐
│   authStore   │
│  setTokens()  │
└───────┬───────┘
        │ 5. Store access token via tokenManager
        │ 6. Update state (isAuthenticated = true)
        ▼
┌───────────────┐
│   Navigate    │
│ to /dashboard │
└───────────────┘
```

---

## Component Architecture

### Component Types

#### 1. Page Components (`src/pages/`)

**Purpose**: Route-level components that coordinate multiple features.

**Characteristics**:
- Handle data fetching for the entire page
- Manage tab state and navigation
- Compose multiple feature components
- Handle URL parameters

**Example**: `TripDetailPage.tsx`
```typescript
export default function TripDetailPage() {
  const { id } = useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  const loadTripData = async (tripId: number) => {
    // Fetch all data needed for the page
    const [tripData, activitiesData, locationsData] = await Promise.all([
      tripService.getTripById(tripId),
      activityService.getActivitiesByTrip(tripId),
      locationService.getLocationsByTrip(tripId),
    ]);

    setTrip(tripData);
    setActivities(activitiesData);
    setLocations(locationsData);
  };

  return (
    <div>
      <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === 'activities' && (
        <ActivityManager
          tripId={trip.id}
          locations={locations}
          onUpdate={() => loadTripData(trip.id)}
        />
      )}

      {activeTab === 'locations' && (
        <LocationManager locations={locations} />
      )}
    </div>
  );
}
```

#### 2. Manager Components

**Purpose**: Handle CRUD operations for a specific entity type.

**Characteristics**:
- Manage local entity list state
- Provide forms for create/edit
- Handle entity deletion
- Call service methods
- Notify parent of changes via callbacks

**Naming Convention**: `{Entity}Manager.tsx`

**Example**: `ActivityManager.tsx`
```typescript
interface ActivityManagerProps {
  tripId: number;
  locations: Location[];
  tripTimezone?: string | null;
  onUpdate?: () => void;  // Callback to refresh parent
}

export default function ActivityManager({
  tripId,
  locations,
  tripTimezone,
  onUpdate
}: ActivityManagerProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // ... more form fields

  const loadActivities = async () => {
    const data = await activityService.getActivitiesByTrip(tripId);
    setActivities(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      // Update existing
      await activityService.updateActivity(editingId, updateData);
    } else {
      // Create new
      await activityService.createActivity(createData);
    }

    resetForm();
    loadActivities();
    onUpdate?.();  // Notify parent
  };

  const handleDelete = async (id: number) => {
    await activityService.deleteActivity(id);
    loadActivities();
    onUpdate?.();  // Notify parent
  };

  return (
    <div>
      <button onClick={() => setShowForm(!showForm)}>
        + Add Activity
      </button>

      {showForm && (
        <form onSubmit={handleSubmit}>
          {/* Form fields */}
        </form>
      )}

      <div>
        {activities.map(activity => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            onEdit={() => handleEdit(activity)}
            onDelete={() => handleDelete(activity.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

#### 3. Display Components

**Purpose**: Pure presentation components with minimal logic.

**Characteristics**:
- Receive data via props
- No API calls
- Minimal state (mostly UI state like expanded/collapsed)
- Reusable across different contexts

**Examples**: `PhotoGallery`, `LocationCard`, `ActivityCard`

#### 4. Utility Components

**Purpose**: Provide specific functionality that can be embedded in other components.

**Examples**:
- `LocationQuickAdd` - Inline location creation
- `LocationSearchMap` - Map-based location picker
- `AssociatedAlbums` - Display albums linked to entities
- `JournalEntriesButton` - Quick access to journals

---

## API Communication

### Service Pattern

**Location**: `src/services/`

**Purpose**: Encapsulate all API communication in service classes.

**Structure**:
```typescript
// activity.service.ts
class ActivityService {
  async getActivitiesByTrip(tripId: number): Promise<Activity[]> {
    const response = await axios.get(`/activities/trip/${tripId}`);
    return response.data.data;
  }

  async createActivity(data: CreateActivityInput): Promise<Activity> {
    const response = await axios.post('/activities', data);
    return response.data.data;
  }

  async updateActivity(id: number, data: UpdateActivityInput): Promise<Activity> {
    const response = await axios.put(`/activities/${id}`, data);
    return response.data.data;
  }

  async deleteActivity(id: number): Promise<void> {
    await axios.delete(`/activities/${id}`);
  }
}

export default new ActivityService();
```

### Axios Configuration

**Location**: `src/lib/axios.ts`

**Key Features**:
- Base URL configuration from environment variables
- Automatic token injection via request interceptors
- Automatic token refresh on 401 responses
- Error handling and retry logic

```typescript
// src/lib/axios.ts
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add auth token
instance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: Handle token refresh
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      const refreshed = await useAuthStore.getState().refreshToken();
      if (refreshed) {
        // Retry original request
        return instance(error.config);
      }
      // If refresh fails, logout
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default instance;
```

### API Response Format

All API responses follow this structure:
```typescript
{
  status: 'success' | 'error',
  data?: any,
  message?: string,
  errors?: ValidationError[]
}
```

Services extract the `data` field:
```typescript
const response = await axios.get('/trips');
return response.data.data;  // Extract data field
```

---

## Routing

**Library**: React Router v7

**Location**: `src/App.tsx`

Route components are lazy-loaded via `React.lazy` for code splitting and
rendered inside a `<Suspense>` boundary. There is no `<Outlet/>` layout route
for protected pages — each protected route is individually wrapped in a
`<ProtectedRoute>` component, and every page is also wrapped in an
`<ErrorBoundary>`.

**Route Structure**:
```tsx
<Routes>
  {/* "/" redirects to the dashboard */}
  <Route path="/" element={<Navigate to="/dashboard" replace />} />

  {/* Public routes */}
  <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
  <Route path="/register" element={<ErrorBoundary><RegisterPage /></ErrorBoundary>} />
  <Route path="/accept-invite" element={<ErrorBoundary><AcceptInvitePage /></ErrorBoundary>} />

  {/* Protected routes — each wrapped individually */}
  <Route
    path="/dashboard"
    element={
      <ProtectedRoute>
        <ErrorBoundary>
          <DashboardPage />
        </ErrorBoundary>
      </ProtectedRoute>
    }
  />
  {/* ...same wrapper pattern for: */}
  {/*   /trips, /trips/new, /trips/:id, /trips/:id/edit          */}
  {/*   /trips/:tripId/albums/:albumId, /albums, /companions      */}
  {/*   /places-visited, /checklists, /checklists/:id             */}
  {/*   /trip-series, /trip-series/:id, /settings                 */}
  {/*   /library, /travel-stats, /trip-calendar, /year-in-review  */}
  {/*   /food-log, /saved-links                                   */}
</Routes>
```

### App Shell

`Navbar` (top bar) and `MobileBottomNav` (below `md`) are rendered once in
`App.tsx`, outside `<Routes>`. There are four destinations: Today
(`/dashboard`), Trips, Library and Inbox (`/saved-links`). Library is a
dropdown on desktop and the `/library` hub page on mobile; both list the same
collection pages. See "App Navigation" in the
[Style Guide](STYLE_GUIDE.md) for the table and for what to touch when adding
a page.

### Today (`pages/DashboardPage.tsx`)

The landing page pairs a work column with a map.

- `useActiveTrip` picks the trip (in progress, else the soonest upcoming).
- `hooks/useTripAgendaData.ts` loads that trip's activities, transportation,
  lodging, locations and location links. It uses the same query keys as
  `useTripDetailQueries`, so the trip page and Today share a cache.
- `utils/dayAgenda.ts` `buildDayAgenda()` turns those lists into one day's
  ordered, numbered items. Each timestamp is bucketed onto a calendar day with
  `dayKeyInTimezone()` in its resolved zone (entity, trip, user). An item gets
  a map point from its linked location (activities, lodging) or its endpoints
  (transportation); items without one keep their number and have no pin.
- `components/agenda/AgendaList.tsx` and `AgendaMap.tsx` render the list and
  the Leaflet map; the row number and the pin number are the same value.
- `components/today/TodayMap.tsx` adds the scope switch (Today, This trip,
  Photos, All trips) and lazy-loads the map components.

### Trip Detail Sections

`components/trip-detail/tripDetailTabs.tsx` defines the sections and their
views. `TabId` values are what `?tab=` carries; group ids exist only to group
sub-tabs.

| Section | Views (`TabId`) |
| ------- | --------------- |
| Overview | `dashboard` |
| Itinerary | `itinerary` (Day Plan), `timeline`, `daily`, `trip-map` |
| Photos | `photos`, `photo-map`, `photo-timeline` |
| Plans | `locations` (Places), `activities`, `unscheduled`, `transportation`, `lodging`, `links`, `custom` |
| Journal | `journal`, `food-log` |
| Essentials | `budget`, `deadlines`, `companions`, `emergency`, `local-norms` |

Day Plan (`components/agenda/ItineraryDayView.tsx`) reuses `buildDayAgenda`,
`AgendaList` and `AgendaMap` with a day picker. The Overview is
`components/trip-dashboard/TripDashboard.tsx`.

### Protected Routes

**Pattern**: A wrapper component that checks authentication and renders its
children (not an `<Outlet/>`).

```tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

### Navigation

```typescript
import { useNavigate, useParams } from 'react-router';

function MyComponent() {
  const navigate = useNavigate();
  const { id } = useParams();

  const handleClick = () => {
    navigate(`/trips/${id}`);
  };

  return <button onClick={handleClick}>View Trip</button>;
}
```

---

## Styling & UI

### Tailwind CSS

**Configuration**: `tailwind.config.js`

**Usage**: Utility-first CSS classes directly in JSX.

```typescript
<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
    Title
  </h2>
  <p className="text-sm text-gray-600 dark:text-gray-400">
    Description
  </p>
</div>
```

### Dark Mode

**Implementation**: CSS class-based dark mode.

**Pattern**:
```typescript
// Root element has 'dark' class when dark mode is active
<html className={theme === 'dark' ? 'dark' : ''}>
```

**Usage**:
```typescript
// Light mode: bg-white, Dark mode: bg-gray-800
className="bg-white dark:bg-gray-800"

// Light mode: text-gray-900, Dark mode: text-white
className="text-gray-900 dark:text-white"
```

### Common UI Patterns

#### Buttons
```typescript
// Primary button
className="btn btn-primary"
className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"

// Secondary button
className="btn btn-secondary"
className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"

// Danger button
className="btn btn-danger"
className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
```

#### Forms
```typescript
// Input field
className="input"
className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md"

// Label
className="label"
className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"

// Form container
className="space-y-4"
```

#### Cards
```typescript
className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4"
```

### Responsive Design

```typescript
// Stack on mobile, grid on desktop
className="flex flex-col md:flex-row"
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"

// Hide on mobile, show on desktop
className="hidden md:block"

// Full width on mobile, fixed width on desktop
className="w-full md:w-64"
```

---

## Type System

### Type Definitions

**Location**: `src/types/`

**Pattern**: One file per entity type.

**Structure**:
```typescript
// src/types/activity.ts
export interface Activity {
  id: number;
  tripId: number;
  name: string;
  description: string | null;
  category: string | null;
  locationId: number | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  cost: number | null;
  currency: string | null;
  // ... more fields

  // Related entities
  location?: {
    id: number;
    name: string;
    address: string | null;
  };

  children?: Activity[];  // Sub-activities
}

export interface CreateActivityInput {
  tripId: number;
  name: string;
  description?: string;
  // ... optional fields
}

export interface UpdateActivityInput {
  name?: string;
  description?: string | null;  // Nullable for clearing
  // ... optional and nullable fields
}
```

### Type Patterns

#### Nullable vs Optional

```typescript
// Optional: Field may be omitted (for create)
description?: string;

// Nullable: Field can be set to null (for update to clear)
description?: string | null;

// Both: For comprehensive update types
description?: string | null;
```

#### Nested Types

```typescript
// Inline for simple nested types
location?: {
  id: number;
  name: string;
};

// Separate interface for complex nested types
interface LocationWithDetails extends Location {
  activities: Activity[];
  photos: Photo[];
}
```

#### Union Types

```typescript
type TripStatus = 'Dream' | 'Planning' | 'Planned' | 'In Progress' | 'Completed' | 'Cancelled';

type TransportationType = 'Flight' | 'Train' | 'Bus' | 'Car' | 'Ferry' | 'Bicycle' | 'Walk' | 'Other';
```

---

## Common Patterns

### 1. Manager Component Pattern (with useManagerCRUD Hook)

**When to Use**: CRUD operations for an entity type.

**Modern Approach** (using `useManagerCRUD` hook):

All Manager components now use the `useManagerCRUD` hook to eliminate boilerplate code and provide consistent CRUD behavior.

**Hook Location**: `src/hooks/useManagerCRUD.ts`

**Benefits**:

- Eliminates 150-200 lines of boilerplate per Manager component
- Consistent CRUD operations across all managers
- Automatic data loading on mount
- Built-in error handling and user feedback
- Type-safe with full TypeScript support

**Template**:

```typescript
import { useManagerCRUD } from "../hooks/useManagerCRUD";
import { useFormFields } from "../hooks/useFormFields";
import { Entity } from "../types/entity";
import entityService from "../services/entity.service";

interface EntityManagerProps {
  tripId: number;
  onUpdate?: () => void;
}

export default function EntityManager({ tripId, onUpdate }: EntityManagerProps) {
  // Initialize CRUD hook
  const serviceAdapter = {
    getByTrip: entityService.getByTrip,
    create: entityService.create,
    update: entityService.update,
    delete: entityService.delete,
  };

  const manager = useManagerCRUD<Entity>(serviceAdapter, tripId, {
    itemName: "entity",  // Used in toast messages: "entity added", "entity deleted", etc.
    onUpdate,
  });

  // Form fields (component-specific logic)
  const { values, handleChange, reset } = useFormFields<FormFields>(initialState);

  // Handle edit - populate form with entity data
  const handleEdit = (entity: Entity) => {
    handleChange("name", entity.name);
    handleChange("description", entity.description || "");
    // ... populate other fields
    manager.openEditForm(entity.id);
  };

  // Handle submit - build data and delegate to hook
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build data object
    const data = {
      tripId,
      name: values.name,
      description: values.description || null,  // null to clear empty fields
      // ... other fields
    };

    // Delegate to hook
    if (manager.editingId) {
      const success = await manager.handleUpdate(manager.editingId, data);
      if (success) {
        reset();
        manager.closeForm();
      }
    } else {
      const success = await manager.handleCreate(data);
      if (success) {
        reset();
        manager.closeForm();
      }
    }
  };

  return (
    <div>
      {/* Header with Add button */}
      <button
        onClick={() => { reset(); manager.toggleForm(); }}
        className="btn btn-primary"
      >
        {manager.showForm ? "Cancel" : "+ Add Entity"}
      </button>

      {/* Form */}
      {manager.showForm && (
        <form onSubmit={handleSubmit}>
          {/* Form fields */}
          <button type="submit">
            {manager.editingId ? "Update" : "Create"}
          </button>
          <button type="button" onClick={() => { reset(); manager.closeForm(); }}>
            Cancel
          </button>
        </form>
      )}

      {/* List */}
      {manager.loading ? (
        <div>Loading...</div>
      ) : (
        <div>
          {manager.items.map((entity) => (
            <div key={entity.id}>
              <span>{entity.name}</span>
              <button onClick={() => handleEdit(entity)}>Edit</button>
              <button onClick={() => manager.handleDelete(entity.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Hook API**:

```typescript
const manager = useManagerCRUD<T>(service, tripId, options);

// Returns:
{
  // State
  items: T[];                    // Array of entities
  showForm: boolean;             // Form visibility
  editingId: number | null;      // ID of entity being edited (null for create)
  loading: boolean;              // Loading state
  isEditing: boolean;            // True if editingId !== null

  // CRUD Operations
  handleCreate: (data: any) => Promise<boolean>;
  handleUpdate: (id: number, data: any) => Promise<boolean>;
  handleDelete: (id: number) => Promise<boolean>;
  loadItems: () => Promise<void>;

  // Form Controls
  openCreateForm: () => void;
  openEditForm: (id: number) => void;
  closeForm: () => void;
  toggleForm: () => void;

  // Advanced (direct state setters)
  setItems: (items: T[]) => void;
  setShowForm: (show: boolean) => void;
  setEditingId: (id: number | null) => void;
}
```

**Components Using This Pattern**:

- ✅ `ActivityManager.tsx`
- ✅ `LodgingManager.tsx`
- ✅ `TransportationManager.tsx`
- ✅ `JournalManager.tsx`
- ✅ `TagManager.tsx`
- ✅ `CompanionManager.tsx`

**Old Pattern** (deprecated, for reference only):

<details>
<summary>Click to expand legacy Manager pattern (before useManagerCRUD)</summary>

```typescript
export default function EntityManager({ tripId, onUpdate }: EntityManagerProps) {
  // State (now handled by useManagerCRUD hook)
  const [entities, setEntities] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Load data (now handled by hook automatically)
  useEffect(() => {
    loadEntities();
  }, [tripId]);

  const loadEntities = async () => {
    const data = await entityService.getByTrip(tripId);
    setEntities(data);
  };

  // Delete handler (now manager.handleDelete())
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this entity?')) return;
    await entityService.delete(id);
    loadEntities();
    onUpdate?.();
  };

  // ... rest of old pattern
}
```

</details>

---

### 2. Custom Hooks

#### useManagerCRUD (`src/hooks/useManagerCRUD.ts`)

**Purpose**: Provide standard CRUD state and operations for Manager components

**Parameters**:

- `service`: Object with `getByTrip`, `create`, `update`, `delete` methods
- `tripId`: The trip ID to fetch entities for
- `options`: Configuration object
  - `itemName`: Display name for toast messages (default: "item")
  - `onUpdate`: Callback after successful create/update/delete

**Returns**: Object with state, CRUD operations, and form controls (see API above)

**Usage**: See Manager Component Pattern above

#### useFormFields (`src/hooks/useFormFields.ts`)

**Purpose**: Manage form field state with a single object

**Usage**:

```typescript
const { values, handleChange, reset } = useFormFields<FormFields>(initialState);

// In JSX:
<input
  value={values.name}
  onChange={(e) => handleChange("name", e.target.value)}
/>

// Programmatic updates:
handleChange("email", "new@example.com");

// Reset to initial state:
reset();
```

**Benefits**:

- Single state object for all form fields
- Type-safe field updates
- Easy reset functionality
- Reduces useState calls from ~10+ to 1

#### usePagination (`src/hooks/usePagination.ts`)

**Purpose**: Manage "load more" pagination patterns with progressive loading

**Parameters**:

- `loadFunction`: Async function `(skip, take) => Promise<{ items, total, hasMore }>`
- `options`: Configuration object
  - `pageSize`: Number of items per page (default: 40)
  - `enabled`: Auto-load on mount (default: true)
  - `onError`: Custom error handler

**Returns**: Object with state and pagination controls

```typescript
{
  // State
  items: T[];              // Current items
  total: number;           // Total count
  hasMore: boolean;        // Has more to load
  loading: boolean;        // Initial loading
  loadingMore: boolean;    // Loading more
  error: Error | null;     // Error state

  // Actions
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
  clear: () => void;
  setItems: (items: T[]) => void;

  // Computed
  isEmpty: boolean;           // No items and not loading
  isLoadingInitial: boolean;  // First page loading
}
```

**Usage**:

```typescript
const photosPagination = usePagination(
  async (skip, take) => {
    const result = await photoService.getPhotosByTrip(tripId, { skip, take });
    return {
      items: result.photos,
      total: result.total,
      hasMore: result.hasMore,
    };
  },
  { pageSize: 40 }
);

// Trigger initial load
useEffect(() => {
  if (tripId) {
    photosPagination.loadInitial();
  }
}, [tripId]);

// In JSX:
{photosPagination.items.map(photo => <Photo key={photo.id} photo={photo} />)}

{photosPagination.hasMore && (
  <button
    onClick={photosPagination.loadMore}
    disabled={photosPagination.loadingMore}
  >
    {photosPagination.loadingMore ? "Loading..." : "Load More"}
  </button>
)}
```

**Variants**:

- `useAutoPagination`: Same as usePagination but with `enabled: true` by default
- `useInfiniteScroll`: Adds `onScroll` handler for scroll-based loading
- `useInfiniteScrollSentinel`: Uses Intersection Observer for performance

**Pages Using This Pattern**:

- ✅ `TripDetailPage.tsx` (3 pagination instances: photos, unsorted photos, album photos)
- ✅ `AlbumDetailPage.tsx` (album photos)

**Benefits**:

- Eliminates 15-20 lines of boilerplate per pagination instance
- Consistent loading state management
- Built-in error handling
- Prevents duplicate loads
- Type-safe

---

### 3. Form Data Builder Utilities (`src/utils/formDataBuilder.ts`)

**Purpose**: Simplify building data objects for create vs update operations

The API has different semantics for create and update:

- **CREATE**: Use `undefined` to omit optional fields (server uses defaults)
- **UPDATE**: Use `null` to explicitly clear fields

**Available Functions**:

#### buildCreateData(values)

Builds data for create operations - omits empty values:

```typescript
const createData = buildCreateData({
  name: "Trip to Paris",
  description: "",  // Omitted
  notes: null,      // Omitted
  cost: 100,        // Included
});
// Result: { name: "Trip to Paris", cost: 100 }
```

#### buildUpdateData(values)

Builds data for update operations - converts empty strings to null:

```typescript
const updateData = buildUpdateData({
  name: "Trip to Paris",
  description: "",    // Becomes null (clears field)
  notes: "Updated",   // Included as-is
  cost: undefined,    // Omitted (not being updated)
});
// Result: { name: "Trip to Paris", description: null, notes: "Updated" }
```

#### buildFormData(values, mode)

Generic builder that chooses create or update semantics:

```typescript
const data = buildFormData(formValues, editingId ? 'update' : 'create');
```

#### Helper Functions

- `parseNumericField(value)` - Parses string to number, handles empty gracefully
- `formatDateForAPI(dateStr, timeStr?)` - Converts date/time to ISO format
- `pickFields(values, fields, mode)` - Builds data with only specified fields

**Usage in Manager Components**:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Build base data using form values
  const baseData = buildFormData(values, manager.editingId ? 'update' : 'create');

  // Add required/computed fields
  const data = {
    ...baseData,
    tripId,
    cost: parseNumericField(values.cost),
    startTime: formatDateForAPI(values.startDate, values.startTime),
  };

  // Submit
  if (manager.editingId) {
    await manager.handleUpdate(manager.editingId, data);
  } else {
    await manager.handleCreate(data);
  }
};
```

**Benefits**:

- Eliminates 30-50 lines of manual field mapping per component
- Consistent null/undefined handling
- Reduces errors from forgotten field conversions
- Type-safe with generics
- Reusable across all Manager components

---

### 4. Service Adapter Pattern

**When to Use**: When service method names don't match the standard CRUD pattern expected by hooks

**Example**:

```typescript
// Service has non-standard method names
const activityServiceAdapter = {
  getByTrip: activityService.getActivitiesByTrip,  // Maps to standard name
  create: activityService.createActivity,
  update: activityService.updateActivity,
  delete: activityService.deleteActivity,
};

const manager = useManagerCRUD(activityServiceAdapter, tripId, options);
```

---

### 5. Loading States Pattern

**Legacy Pattern** (don't use):

```typescript
const [loading, setLoading] = useState(false);

const loadData = async () => {
  try {
    setLoading(true);
    const data = await service.getData();
    setData(data);
  } catch (error) {
    toast.error("Failed to load");
  } finally {
    setLoading(false);
  }
};
```

**Modern Pattern** (with useManagerCRUD):

```typescript
const manager = useManagerCRUD(service, tripId, options);

// Hook handles loading state automatically
if (manager.loading) {
  return <LoadingSpinner />;
}

return (
    <div>
      <button onClick={() => setShowForm(!showForm)}>
        + Add {Entity}
      </button>

      {showForm && <form onSubmit={handleSubmit}>...</form>}

      <div>
        {entities.map(entity => (
          <EntityCard
            key={entity.id}
            entity={entity}
            onEdit={() => handleEdit(entity)}
            onDelete={() => handleDelete(entity.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

### 2. Form Handling Pattern

```typescript
// State for each form field
const [name, setName] = useState('');
const [description, setDescription] = useState('');

// Controlled inputs
<input
  type="text"
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="input"
  required
/>

// Submit handler
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Validation
  if (!name.trim()) {
    toast.error('Name is required');
    return;
  }

  // Prepare data
  const data = {
    name,
    description: description || null,  // null for empty to clear DB
  };

  // Submit
  try {
    await service.create(data);
    toast.success('Created successfully');
    resetForm();
  } catch (error) {
    toast.error('Failed to create');
  }
};
```

### 3. Loading and Error States

```typescript
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await service.getData();
      setData(data);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  loadData();
}, []);

if (loading) return <div>Loading...</div>;
if (error) return <div>Error: {error}</div>;
return <div>{/* Render data */}</div>;
```

### 4. Conditional Rendering

```typescript
// Show/hide based on state
{showForm && <Form />}

// Ternary for either/or
{isEditing ? <EditForm /> : <DisplayView />}

// Optional chaining for nested data
{trip?.location?.name}

// Fallback values
{trip.description || 'No description'}
```

### 5. useId for Accessibility

```typescript
import { useId } from 'react';

function FormField() {
  const fieldId = useId();

  return (
    <div>
      <label htmlFor={fieldId}>Name</label>
      <input id={fieldId} type="text" />
    </div>
  );
}
```

---

## Best Practices

### 1. Component Organization

**DO**:
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use composition over inheritance
- Keep component files under 500 lines

**DON'T**:
- Mix business logic with presentation
- Create "god components" that do everything
- Inline complex logic in JSX

### 2. State Management

**DO**:
- Use Zustand for global UI state
- Keep server data in component state
- Lift state up when shared between siblings
- Use callback props for child-to-parent communication

**DON'T**:
- Put server data in Zustand
- Pass unnecessary props through many levels
- Use global state for local UI concerns

### 3. Type Safety

**DO**:
- Define interfaces for all data structures
- Use strict TypeScript settings
- Type all function parameters and returns
- Use nullable types (`string | null`) for clearable fields

**DON'T**:
- Use `any` type (use `unknown` if needed)
- Rely on type inference for complex structures
- Mix optional (`?`) with nullable (`| null`) incorrectly

### 4. API Communication

**DO**:
- Use service classes for all API calls
- Handle errors with try-catch and user feedback
- Show loading states during async operations
- Use toast notifications for success/error

**DON'T**:
- Make axios calls directly in components
- Ignore error handling
- Leave users without feedback

### 5. Performance

**DO**:
- Use React.memo for expensive components
- Debounce search inputs
- Lazy load routes with React.lazy()
- Use callback refs for DOM manipulation

**DON'T**:
- Create new objects/functions in render
- Use index as key in dynamic lists
- Forget to cleanup effects (timeouts, listeners)

### 6. Forms

**DO**:
- Use controlled components
- Validate on submit (and optionally on blur)
- Separate create and update data preparation
- Send `null` for empty fields in updates
- Send `undefined` to omit fields in creates

**DON'T**:
- Use uncontrolled components for complex forms
- Validate on every keystroke (use debounce)
- Mix update and create logic without separation

### 7. Error Handling

**DO**:
```typescript
try {
  await service.createEntity(data);
  toast.success('Created successfully');
  onUpdate?.();
} catch (error) {
  console.error('Failed to create:', error);
  toast.error('Failed to create entity');
}
```

**DON'T**:
```typescript
// No error handling
await service.createEntity(data);

// Silent failures
service.createEntity(data).catch(() => {});
```

---

## Future Improvements

### Planned Enhancements

1. **Expand TanStack Query Adoption**
   - Migrate the remaining `useManagerCRUD` Manager components to query hooks
   - Add optimistic updates for mutations

2. **Add React Hook Form**
   - Simplify form state management
   - Built-in validation
   - Better performance for large forms

3. **Virtualization for Large Lists**
   - Use `@tanstack/react-virtual` more broadly for long lists
   - Improve performance with many items
   - Reduce DOM nodes

---

## Related Documentation

- [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) - Complete feature list
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Backend architecture details
- [CLAUDE.md](../CLAUDE.md) - Project instructions for AI assistants
- [BUILD_AND_PUSH.md](BUILD_AND_PUSH.md) - Build and release process
