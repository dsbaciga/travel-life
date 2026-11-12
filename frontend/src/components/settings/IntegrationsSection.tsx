import { Suspense, lazy } from "react";
import ErrorBoundary from "../ErrorBoundary";
import LoadingSpinner from "../LoadingSpinner";

const ImmichSettings = lazy(() => import("../ImmichSettings"));
const WeatherSettings = lazy(() => import("../WeatherSettings"));
const AviationstackSettings = lazy(() => import("../AviationstackSettings"));
const OpenRouteServiceSettings = lazy(
  () => import("../OpenRouteServiceSettings")
);
const MapsAppSettings = lazy(() => import("../MapsAppSettings"));
const LlmSettings = lazy(() => import("../LlmSettings"));
const LinkIngestSettings = lazy(() => import("../LinkIngestSettings"));
const SmtpSettings = lazy(() => import("../SmtpSettings"));
const CalendarFeedSettings = lazy(() => import("../CalendarFeedSettings"));
const MobilePairingSettings = lazy(() => import("../MobilePairingSettings"));
const PushNotificationSettings = lazy(
  () => import("../PushNotificationSettings")
);

export default function IntegrationsSection() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <LoadingSpinner.FullPage message="Loading integrations..." />
        }
      >
        <div className="space-y-6">
          {/* Email (SMTP) Settings */}
          <SmtpSettings />

          {/* Immich Integration */}
          <ImmichSettings />

          {/* Weather Settings */}
          <WeatherSettings />

          {/* Aviationstack Settings */}
          <AviationstackSettings />

          {/* OpenRouteService Settings */}
          <OpenRouteServiceSettings />

          {/* Directions & Maps (preferred external maps app) */}
          <MapsAppSettings />

          {/* LLM (AI) Settings */}
          <LlmSettings />

          {/* Saved-link email ingest */}
          <LinkIngestSettings />

          {/* Calendar Feed (iCal subscription) */}
          <CalendarFeedSettings />

          {/* Mobile companion app pairing (QR code) */}
          <MobilePairingSettings />

          {/* Push Notification Settings */}
          <PushNotificationSettings />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
