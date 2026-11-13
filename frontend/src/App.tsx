import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'react-hot-toast';
import React, { useEffect, Suspense } from 'react';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy-loaded page components for route-level code splitting
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const AcceptInvitePage = React.lazy(() => import('./pages/AcceptInvitePage'));
const PublicTripPage = React.lazy(() => import('./pages/PublicTripPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const TripsPage = React.lazy(() => import('./pages/TripsPage'));
const TripFormPage = React.lazy(() => import('./pages/TripFormPage'));
const TripDetailPage = React.lazy(() => import('./pages/TripDetailPage'));
const AlbumDetailPage = React.lazy(() => import('./pages/AlbumDetailPage'));
const GlobalAlbumsPage = React.lazy(() => import('./pages/GlobalAlbumsPage'));
const CompanionsPage = React.lazy(() => import('./pages/CompanionsPage'));
const PlacesVisitedPage = React.lazy(() => import('./pages/PlacesVisitedPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const LibraryPage = React.lazy(() => import('./pages/LibraryPage'));
const ChecklistsPage = React.lazy(() => import('./pages/ChecklistsPage'));
const SavedLinksInboxPage = React.lazy(() => import('./pages/SavedLinksInboxPage'));
const FoodLogPage = React.lazy(() => import('./pages/FoodLogPage'));
const YearInReviewPage = React.lazy(() => import('./pages/YearInReviewPage'));
const ChecklistDetailPage = React.lazy(() => import('./pages/ChecklistDetailPage'));
const TripSeriesListPage = React.lazy(() =>
  import('./pages/TripSeriesListPage').catch((err) => {
    if (err?.name === 'ChunkLoadError' || err?.message?.includes('Loading chunk')) {
      window.location.reload();
    }
    return import('./pages/TripSeriesListPage');
  })
);
const TripSeriesPage = React.lazy(() =>
  import('./pages/TripSeriesPage').catch((err) => {
    if (err?.name === 'ChunkLoadError' || err?.message?.includes('Loading chunk')) {
      window.location.reload();
    }
    return import('./pages/TripSeriesPage');
  })
);
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import HomeTimezonePrompt from './components/HomeTimezonePrompt';
import MobileBottomNav from './components/MobileBottomNav';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import PwaStatusLayer from './components/pwa/PwaStatusLayer';
import { debugLogger } from './utils/debugLogger';
import { migrateFromLocalStorage } from './utils/authMigration';
import { cleanupExpiredDrafts } from './utils/draftStorage';
import { useAuthStore } from './store/authStore';
import {
  getQueryClient,
  getQueryPersister,
  getMaxCacheAge,
  PersistQueryClientProvider,
  dehydrateQueryFilter,
} from './lib/queryClientSetup';

// Get the configured query client and persister for PWA offline support
const queryClient = getQueryClient();
const persister = getQueryPersister();
const maxAge = getMaxCacheAge();

function App() {
  const { initializeAuth, isInitialized, isAuthenticated } = useAuthStore();

  // Initialize auth on app mount (handles page refresh)
  useEffect(() => {
    // Migrate from localStorage to secure storage (one-time cleanup)
    migrateFromLocalStorage();
    // Clean up expired draft form data
    cleanupExpiredDrafts();
    // Initialize auth via silent refresh using httpOnly cookie
    initializeAuth();
  }, [initializeAuth]);

  // Global error handler for unhandled errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      debugLogger.error('🚨 Global unhandled error', event.error, {
        component: 'App',
        operation: 'window.onerror',
        data: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      debugLogger.error('🚨 Global unhandled promise rejection', event.reason, {
        component: 'App',
        operation: 'window.onunhandledrejection',
        data: {
          reason: event.reason,
          promise: event.promise,
        },
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    debugLogger.log('Global error handlers installed', { component: 'App', operation: 'setup' });
    debugLogger.log('Access window.__debugLogger.getRecentContext() to see recent debug logs', { component: 'App', operation: 'setup' });

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Show loading state while checking auth
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-navy-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-slate dark:text-warm-gray">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge,
        dehydrateOptions: {
          shouldDehydrateQuery: dehydrateQueryFilter,
        },
      }}
      onSuccess={() => {
        // Called when the cache has been restored
        debugLogger.log('Cache restored from IndexedDB', { component: 'App', operation: 'QueryPersist' });
      }}
    >
      <BrowserRouter>
        <ErrorBoundary
          onError={(error, errorInfo) => {
            debugLogger.error('ErrorBoundary caught error', error, {
              component: 'App',
              operation: 'ErrorBoundary',
              data: { componentStack: errorInfo.componentStack },
            });
          }}
        >
          <ScrollToTop />
          <Toaster position="top-right" containerClassName="z-[100]" />
          {/* Skip to content link for accessibility */}
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <Navbar />
          <HomeTimezonePrompt />
          {/* Bottom padding clears MobileBottomNav, which is h-16 plus a 2px top
              border plus its own safe-area-inset-bottom. A flat pb-16 was 2px
              short on every phone and ~36px short on one with a home indicator,
              hiding the end of every page behind the nav. */}
          <main
            id="main-content"
            className="pt-16 sm:pt-20 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0"
            tabIndex={-1}
          >
            <Suspense fallback={<LoadingSpinner.FullPage message="Loading page…" />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
              <Route path="/register" element={<ErrorBoundary><RegisterPage /></ErrorBoundary>} />
              <Route path="/accept-invite" element={<ErrorBoundary><AcceptInvitePage /></ErrorBoundary>} />
              <Route path="/share/:token" element={<ErrorBoundary><PublicTripPage /></ErrorBoundary>} />
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
              <Route
                path="/trips"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TripsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trips/new"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TripFormPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trips/:id"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TripDetailPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trips/:id/edit"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TripFormPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trips/:tripId/albums/:albumId"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <AlbumDetailPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/albums"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <GlobalAlbumsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/companions"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <CompanionsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/places-visited"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <PlacesVisitedPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/library"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <LibraryPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/year-in-review"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <YearInReviewPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/checklists"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <ChecklistsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/food-log"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <FoodLogPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/saved-links"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <SavedLinksInboxPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/checklists/:id"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <ChecklistDetailPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trip-series"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TripSeriesListPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trip-series/:id"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TripSeriesPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <SettingsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
            </Routes>
            </Suspense>
          </main>
          <MobileBottomNav />
          {/* Global offline banner + the only route to sync-conflict
              resolution. Signed-in only: both read the current user's
              offline queue. */}
          {isAuthenticated && (
            <ErrorBoundary>
              <PwaStatusLayer />
            </ErrorBoundary>
          )}
        </ErrorBoundary>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}

export default App;
