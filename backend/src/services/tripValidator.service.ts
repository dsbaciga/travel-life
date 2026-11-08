import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import travelTimeService from './travelTime.service';
import travelDocumentService from './travelDocument.service';
import visaRequirementService from './visaRequirement.service';
import openingHoursService from './openingHours.service';
import { formatInTimeZone } from 'date-fns-tz';
import { TripWithRelations } from '../types/prisma-helpers';
import { AppError } from '../errors/errors';

// =============================================================================
// TYPES
// =============================================================================

export type ValidationIssueCategory = 'SCHEDULE' | 'ACCOMMODATIONS' | 'TRANSPORTATION' | 'COMPLETENESS' | 'DOCUMENTS';
export type ValidationStatus = 'okay' | 'potential_issues';

export interface ValidationIssue {
  id: string; // Unique identifier for this specific issue instance (issueType:issueKey)
  category: ValidationIssueCategory;
  type: string;
  message: string;
  affectedItems?: (string | number)[];
  suggestion?: string;
  isDismissed: boolean;
  quickAction?: {
    type: 'add_lodging' | 'add_transportation' | 'view_conflict' | 'edit_activity';
    label: string;
    data?: Record<string, unknown>;
  };
}

export interface ValidationResult {
  tripId: number;
  status: ValidationStatus;
  issuesByCategory: Record<ValidationIssueCategory, ValidationIssue[]>;
  totalIssues: number;
  activeIssues: number; // Issues not dismissed
  dismissedIssues: number;
}

interface ActivityWithLocation {
  id: number;
  name: string;
  startTime: Date | null;
  endTime: Date | null;
  location: {
    id: number;
    latitude: unknown;
    longitude: unknown;
  } | null;
}

// =============================================================================
// VALIDATION CONTEXT
// =============================================================================

type TripStatus = 'Dream' | 'Planning' | 'Planned' | 'In Progress' | 'Completed' | 'Cancelled';

interface ValidationContext {
  checkSchedule: boolean;
  checkAccommodations: boolean;
  checkTransportation: boolean;
  checkCompleteness: boolean;
  checkDocuments: boolean;
}

function getValidationContext(tripStatus: string): ValidationContext {
  const status = tripStatus as TripStatus;

  switch (status) {
    case 'Dream':
      // Minimal validation - just check for invalid dates if dates exist
      return {
        checkSchedule: true, // Only invalid dates
        checkAccommodations: false,
        checkTransportation: false,
        checkCompleteness: false,
        checkDocuments: false,
      };
    case 'Planning':
      // Basic structure validation - include document checks for early warning
      return {
        checkSchedule: true,
        checkAccommodations: false, // Don't require lodging yet
        checkTransportation: false,
        checkCompleteness: false,
        checkDocuments: true, // Check documents early for planning
      };
    case 'Planned':
    case 'In Progress':
    case 'Completed':
      // Full validation
      return {
        checkSchedule: true,
        checkAccommodations: true,
        checkTransportation: true,
        checkCompleteness: true,
        checkDocuments: true,
      };
    case 'Cancelled':
      // No validation needed for cancelled trips
      return {
        checkSchedule: false,
        checkAccommodations: false,
        checkTransportation: false,
        checkCompleteness: false,
        checkDocuments: false,
      };
    default:
      // Default to full validation
      return {
        checkSchedule: true,
        checkAccommodations: true,
        checkTransportation: true,
        checkCompleteness: true,
        checkDocuments: true,
      };
  }
}

// =============================================================================
// SERVICE
// =============================================================================

class TripValidatorService {
  /**
   * Generate a unique issue ID from type and key
   */
  private generateIssueId(type: string, key: string): string {
    return `${type}:${key}`;
  }

  /**
   * Validate a trip and return categorized issues with dismissal status
   */
  async validateTrip(tripId: number, userId: number): Promise<ValidationResult> {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
      include: {
        activities: true,
        lodging: true,
        transportation: true,
        locations: true,
        journalEntries: true,
        customItems: true,
        dismissedValidationIssues: true,
      },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    const context = getValidationContext(trip.status);
    const dismissedSet = new Set<string>(
      (trip.dismissedValidationIssues as Array<{ issueType: string; issueKey: string }>).map(
        (d) => `${d.issueType}:${d.issueKey}`
      )
    );

    const issues: ValidationIssue[] = [];

    // Run validation checks based on context
    if (context.checkSchedule) {
      issues.push(...this.checkTimelineConflicts(trip, dismissedSet));
      issues.push(...this.checkInvalidDates(trip, dismissedSet));
      issues.push(...this.checkLocationClosures(trip, dismissedSet));
      issues.push(...await this.checkBookingDeadlines(trip, dismissedSet));
      issues.push(...await this.checkTravelTimeAlerts(trip, dismissedSet));
    }

    if (context.checkAccommodations) {
      issues.push(...this.checkMissingLodging(trip, dismissedSet));
    }

    if (context.checkTransportation) {
      issues.push(...this.checkMissingTransportation(trip, dismissedSet));
    }

    if (context.checkCompleteness) {
      issues.push(...await this.checkMissingInformation(trip, dismissedSet));
      issues.push(...this.checkEmptyDays(trip, dismissedSet));
    }

    if (context.checkDocuments) {
      issues.push(...await this.checkPassportValidity(trip, dismissedSet));
      issues.push(...await this.checkVisaRequirements(trip, dismissedSet));
    }

    // Group issues by category
    const issuesByCategory: Record<ValidationIssueCategory, ValidationIssue[]> = {
      SCHEDULE: [],
      ACCOMMODATIONS: [],
      TRANSPORTATION: [],
      COMPLETENESS: [],
      DOCUMENTS: [],
    };

    issues.forEach(issue => {
      issuesByCategory[issue.category].push(issue);
    });

    const activeIssues = issues.filter(i => !i.isDismissed).length;
    const dismissedIssues = issues.filter(i => i.isDismissed).length;

    return {
      tripId,
      status: activeIssues === 0 ? 'okay' : 'potential_issues',
      issuesByCategory,
      totalIssues: issues.length,
      activeIssues,
      dismissedIssues,
    };
  }

  /**
   * Dismiss a validation issue
   */
  async dismissIssue(
    tripId: number,
    userId: number,
    issueType: string,
    issueKey: string,
    category: ValidationIssueCategory
  ): Promise<void> {
    // Verify trip ownership
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    await prisma.dismissedValidationIssue.upsert({
      where: {
        tripId_issueType_issueKey: {
          tripId,
          issueType,
          issueKey,
        },
      },
      create: {
        tripId,
        issueType,
        issueKey,
        category,
      },
      update: {
        dismissedAt: new Date(),
      },
    });
  }

  /**
   * Restore (undismiss) a validation issue
   */
  async restoreIssue(
    tripId: number,
    userId: number,
    issueType: string,
    issueKey: string
  ): Promise<void> {
    // Verify trip ownership
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    await prisma.dismissedValidationIssue.deleteMany({
      where: {
        tripId,
        issueType,
        issueKey,
      },
    });
  }

  /**
   * Get quick validation status (for passive indicator)
   */
  async getQuickStatus(tripId: number, userId: number): Promise<{ status: ValidationStatus; activeIssues: number }> {
    const result = await this.validateTrip(tripId, userId);
    return {
      status: result.status,
      activeIssues: result.activeIssues,
    };
  }

  // ===========================================================================
  // SCHEDULE CHECKS
  // ===========================================================================

  private checkTimelineConflicts(trip: TripWithRelations, dismissedSet: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    type ActivityRecord = { id: number; name: string; startTime: Date | null; endTime: Date | null; allDay: boolean };
    // Check for overlapping activities
    const timedActivities = (trip.activities as ActivityRecord[])
      .filter((a: ActivityRecord) => a.startTime && a.endTime && !a.allDay)
      .sort((a: ActivityRecord, b: ActivityRecord) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());

    for (let i = 0; i < timedActivities.length - 1; i++) {
      const current = timedActivities[i];
      const next = timedActivities[i + 1];

      if (new Date(current.endTime!) > new Date(next.startTime!)) {
        // Use sorted IDs for consistent key
        const sortedIds = [current.id, next.id].sort((a, b) => a - b);
        const issueKey = `${sortedIds[0]}:${sortedIds[1]}`;
        const issueId = this.generateIssueId('timeline_conflict', issueKey);

        issues.push({
          id: issueId,
          category: 'SCHEDULE',
          type: 'timeline_conflict',
          message: `"${current.name}" and "${next.name}" overlap`,
          affectedItems: [current.id, next.id],
          suggestion: 'Adjust activity times to prevent overlap',
          isDismissed: dismissedSet.has(issueId),
          quickAction: {
            type: 'view_conflict',
            label: 'View Activities',
            data: { activityIds: [current.id, next.id] },
          },
        });
      }
    }

    return issues;
  }

  private checkInvalidDates(trip: TripWithRelations, dismissedSet: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!trip.startDate || !trip.endDate) {
      return issues;
    }

    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);

    // Check activities outside trip dates
    type ActivityRecord = { id: number; name: string; startTime: Date | null };
    (trip.activities as ActivityRecord[]).forEach((activity: ActivityRecord) => {
      if (activity.startTime) {
        const activityDate = new Date(activity.startTime);
        if (activityDate < start || activityDate > end) {
          const issueKey = `activity:${activity.id}`;
          const issueId = this.generateIssueId('invalid_date', issueKey);

          issues.push({
            id: issueId,
            category: 'SCHEDULE',
            type: 'invalid_date',
            message: `"${activity.name}" is outside trip dates`,
            affectedItems: [activity.id],
            suggestion: 'Move activity within trip dates or adjust trip dates',
            isDismissed: dismissedSet.has(issueId),
            quickAction: {
              type: 'edit_activity',
              label: 'Edit Activity',
              data: { activityId: activity.id },
            },
          });
        }
      }
    });

    return issues;
  }

  /**
   * Warn when a planned visit falls outside a location's opening hours.
   *
   * This catches the single most common itinerary failure: a 9am Monday museum visit when
   * the museum is shut on Mondays. It only fires on a *definite* CLOSED verdict from
   * openingHours.service — a specification the parser cannot fully understand, or a location
   * with no timezone to read the hours against, produces no issue at all. A warning nobody
   * can trust is worse than no warning, so uncertainty stays silent.
   */
  private checkLocationClosures(trip: TripWithRelations, dismissedSet: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    type LocationRecord = {
      id: number;
      name: string;
      visitDatetime: Date | null;
      openingHours: string | null;
      timezone: string | null;
    };

    for (const location of trip.locations as LocationRecord[]) {
      if (!location.visitDatetime || !location.openingHours || !location.timezone) {
        continue;
      }

      const visitAt = new Date(location.visitDatetime);
      const evaluation = openingHoursService.evaluate(location.openingHours, visitAt, location.timezone);

      if (evaluation.status !== 'CLOSED') {
        continue;
      }

      const issueKey = `location:${location.id}`;
      const issueId = this.generateIssueId('location_closed', issueKey);

      issues.push({
        id: issueId,
        category: 'SCHEDULE',
        type: 'location_closed',
        message: `"${location.name}" appears to be closed at your planned visit time${this.formatLocalVisitTime(visitAt, location.timezone)}`,
        affectedItems: [location.id],
        suggestion: `Opening hours: ${location.openingHours}. Reschedule the visit or double-check the hours before you go.`,
        isDismissed: dismissedSet.has(issueId),
      });
    }

    return issues;
  }

  /**
   * Flag booking deadlines (cancellation cutoffs, check-in windows, payment due dates)
   * that have already passed or fall within the next 3 days. Deadlines the user has
   * dismissed on the deadline itself are skipped entirely; the health-check dismissal
   * (dismissedSet) is separate and only hides the warning.
   */
  private async checkBookingDeadlines(trip: TripWithRelations, dismissedSet: Set<string>): Promise<ValidationIssue[]> {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const deadlines = await prisma.bookingDeadline.findMany({
      where: { tripId: trip.id, dismissedAt: null, dueAt: { lte: soon } },
      include: {
        lodging: { select: { name: true } },
        transportation: { select: { type: true, company: true } },
        activity: { select: { name: true } },
      },
      orderBy: { dueAt: 'asc' },
    });

    const kindLabel: Record<string, string> = {
      cancellation: 'Free cancellation ends',
      check_in: 'Online check-in opens',
      payment: 'Payment due',
      other: 'Deadline',
    };

    return deadlines.map((d) => {
      const bookingName =
        d.lodging?.name ??
        d.activity?.name ??
        (d.transportation ? [d.transportation.company, d.transportation.type].filter(Boolean).join(' ') : 'booking');
      const overdue = d.dueAt.getTime() < now.getTime();
      const issueId = this.generateIssueId('booking_deadline', `deadline:${d.id}`);
      const label = kindLabel[d.kind] ?? kindLabel.other;

      return {
        id: issueId,
        category: 'SCHEDULE' as const,
        type: 'booking_deadline',
        message: overdue
          ? `${label} for "${bookingName}" has passed (${d.dueAt.toISOString().slice(0, 10)})`
          : `${label} for "${bookingName}" is coming up (${d.dueAt.toISOString().slice(0, 10)})`,
        affectedItems: [d.id],
        suggestion: d.note ?? (overdue
          ? 'Confirm this was handled, then dismiss the deadline.'
          : 'Handle this before the deadline, then dismiss it.'),
        isDismissed: dismissedSet.has(issueId),
      };
    });
  }

  /**
   * Render a visit time in the location's own timezone for the warning message.
   *
   * Showing the trip's or the server's clock here would contradict the hours the message
   * quotes. Returns an empty string if the zone cannot be formatted, so the message
   * degrades to a still-correct sentence rather than a wrong time.
   */
  private formatLocalVisitTime(visitAt: Date, timezone: string): string {
    try {
      return ` (${formatInTimeZone(visitAt, timezone, 'EEEE d MMM, HH:mm')} local time)`;
    } catch {
      return '';
    }
  }

  // ===========================================================================
  // ACCOMMODATIONS CHECKS
  // ===========================================================================

  private checkMissingLodging(trip: TripWithRelations, dismissedSet: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!trip.startDate || !trip.endDate) {
      return issues;
    }

    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const tripDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Get all days covered by lodging
    type LodgingRecord = { checkInDate: Date | null; checkOutDate: Date | null };
    const lodgingDays = new Set<string>();
    (trip.lodging as LodgingRecord[]).forEach((lodging: LodgingRecord) => {
      if (lodging.checkInDate && lodging.checkOutDate) {
        const checkIn = new Date(lodging.checkInDate);
        const checkOut = new Date(lodging.checkOutDate);
        const current = new Date(checkIn);
        while (current < checkOut) {
          lodgingDays.add(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
      }
    });

    // Check for missing lodging days
    const missingDays: string[] = [];
    const current = new Date(start);
    for (let i = 0; i < tripDays; i++) {
      const dateKey = current.toISOString().split('T')[0];
      if (!lodgingDays.has(dateKey)) {
        missingDays.push(dateKey);
      }
      current.setDate(current.getDate() + 1);
    }

    // Create individual issues for each missing day (allows selective dismissal)
    missingDays.forEach(date => {
      const issueKey = date;
      const issueId = this.generateIssueId('missing_lodging', issueKey);
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      issues.push({
        id: issueId,
        category: 'ACCOMMODATIONS',
        type: 'missing_lodging',
        message: `No lodging for ${formattedDate}`,
        affectedItems: [date],
        suggestion: 'Add accommodation for this night',
        isDismissed: dismissedSet.has(issueId),
        quickAction: {
          type: 'add_lodging',
          label: 'Add Lodging',
          data: { date },
        },
      });
    });

    return issues;
  }

  // ===========================================================================
  // TRANSPORTATION CHECKS
  // ===========================================================================

  private checkMissingTransportation(trip: TripWithRelations, dismissedSet: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // If trip has multiple locations but no transportation
    if (trip.locations.length > 1 && trip.transportation.length === 0) {
      const issueKey = 'no_transportation';
      const issueId = this.generateIssueId('missing_transportation', issueKey);

      issues.push({
        id: issueId,
        category: 'TRANSPORTATION',
        type: 'missing_transportation',
        message: 'Multiple locations but no transportation recorded',
        suggestion: 'Add transportation details between locations',
        isDismissed: dismissedSet.has(issueId),
        quickAction: {
          type: 'add_transportation',
          label: 'Add Transportation',
        },
      });
    }

    return issues;
  }

  // ===========================================================================
  // COMPLETENESS CHECKS
  // ===========================================================================

  private async checkMissingInformation(trip: TripWithRelations, dismissedSet: Set<string>): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    type ActivityRecord = { id: number; startTime: Date | null; allDay: boolean };
    const activities = trip.activities as ActivityRecord[];

    // Activities without locations (now checked via EntityLink system)
    const activityIds = activities.map((a: ActivityRecord) => a.id);
    if (activityIds.length > 0) {
      const activityLocationLinks = await prisma.entityLink.findMany({
        where: {
          tripId: trip.id,
          sourceType: 'ACTIVITY',
          sourceId: { in: activityIds },
          targetType: 'LOCATION',
        },
        select: { sourceId: true },
      });
      const activitiesWithLocation = new Set(activityLocationLinks.map((l: { sourceId: number }) => l.sourceId));
      const activitiesWithoutLocation = activities.filter((a: ActivityRecord) => !activitiesWithLocation.has(a.id));

      if (activitiesWithoutLocation.length > 0) {
        const issueKey = 'activities_without_location';
        const issueId = this.generateIssueId('missing_location', issueKey);

        issues.push({
          id: issueId,
          category: 'COMPLETENESS',
          type: 'missing_location',
          message: `${activitiesWithoutLocation.length} activit${activitiesWithoutLocation.length === 1 ? 'y' : 'ies'} without location`,
          affectedItems: activitiesWithoutLocation.map((a: ActivityRecord) => a.id),
          suggestion: 'Add location information to activities for better organization',
          isDismissed: dismissedSet.has(issueId),
        });
      }
    }

    // Activities without times
    const activitiesWithoutTime = activities.filter((a: ActivityRecord) => !a.startTime && !a.allDay);
    if (activitiesWithoutTime.length > 0) {
      const issueKey = 'activities_without_time';
      const issueId = this.generateIssueId('missing_time', issueKey);

      issues.push({
        id: issueId,
        category: 'COMPLETENESS',
        type: 'missing_time',
        message: `${activitiesWithoutTime.length} activit${activitiesWithoutTime.length === 1 ? 'y' : 'ies'} without scheduled time`,
        affectedItems: activitiesWithoutTime.map((a: ActivityRecord) => a.id),
        suggestion: 'Add start time or mark as all-day for better timeline visibility',
        isDismissed: dismissedSet.has(issueId),
      });
    }

    // Custom items with a cost but no currency. Without a currency the amount
    // cannot be converted, so it is silently excluded from the budget total —
    // worth flagging rather than letting the trip quietly under-report spend.
    type CustomItemRecord = { id: number; cost: Prisma.Decimal | null; currency: string | null };
    const customItemsMissingCurrency = ((trip.customItems ?? []) as CustomItemRecord[]).filter(
      (item) => item.cost !== null && !item.currency
    );
    if (customItemsMissingCurrency.length > 0) {
      const issueKey = 'custom_items_without_currency';
      const issueId = this.generateIssueId('missing_currency', issueKey);

      issues.push({
        id: issueId,
        category: 'COMPLETENESS',
        type: 'missing_currency',
        message: `${customItemsMissingCurrency.length} custom item${customItemsMissingCurrency.length === 1 ? '' : 's'} with a cost but no currency`,
        affectedItems: customItemsMissingCurrency.map((item) => item.id),
        suggestion: 'Set a currency so the cost is included in the trip budget',
        isDismissed: dismissedSet.has(issueId),
      });
    }

    return issues;
  }

  private checkEmptyDays(trip: TripWithRelations, dismissedSet: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!trip.startDate || !trip.endDate) {
      return issues;
    }

    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);

    // Get all days with activities
    type ActivityRecord = { startTime: Date | null };
    const daysWithActivities = new Set<string>();
    (trip.activities as ActivityRecord[]).forEach((activity: ActivityRecord) => {
      if (activity.startTime) {
        const activityDate = new Date(activity.startTime);
        daysWithActivities.add(activityDate.toISOString().split('T')[0]);
      }
    });

    // Count empty days
    const emptyDays: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      const dateKey = current.toISOString().split('T')[0];
      if (!daysWithActivities.has(dateKey)) {
        emptyDays.push(dateKey);
      }
      current.setDate(current.getDate() + 1);
    }

    if (emptyDays.length > 0) {
      const issueKey = 'empty_days';
      const issueId = this.generateIssueId('empty_days', issueKey);

      issues.push({
        id: issueId,
        category: 'COMPLETENESS',
        type: 'empty_days',
        message: `${emptyDays.length} day${emptyDays.length === 1 ? '' : 's'} without planned activities`,
        affectedItems: emptyDays,
        suggestion: 'Consider adding activities or marking as rest days',
        isDismissed: dismissedSet.has(issueId),
      });
    }

    return issues;
  }

  // ===========================================================================
  // TRAVEL TIME CHECKS
  // ===========================================================================

  private async checkTravelTimeAlerts(trip: TripWithRelations, dismissedSet: Set<string>): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    type TravelActivityRecord = { id: number; name: string; startTime: Date | null; endTime: Date | null };
    const activities = trip.activities as TravelActivityRecord[];

    // Get activities with times, sorted by time
    const activitiesWithTimes = activities
      .filter((a: TravelActivityRecord) => a.startTime && a.endTime)
      .sort((a: TravelActivityRecord, b: TravelActivityRecord) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());

    if (activitiesWithTimes.length < 2) {
      return issues;
    }

    // Get location links for these activities (via EntityLink system)
    const activityIds = activitiesWithTimes.map((a: TravelActivityRecord) => a.id);
    const locationLinks = await prisma.entityLink.findMany({
      where: {
        tripId: trip.id,
        sourceType: 'ACTIVITY',
        sourceId: { in: activityIds },
        targetType: 'LOCATION',
      },
    });

    // Build a map of activity ID -> location ID
    type LinkRecord = { sourceId: number; targetId: number };
    const activityLocationMap = new Map<number, number>();
    (locationLinks as LinkRecord[]).forEach((link: LinkRecord) => {
      activityLocationMap.set(link.sourceId, link.targetId);
    });

    // Filter to only activities that have linked locations
    const activitiesWithLocationIds = activitiesWithTimes.filter((a: TravelActivityRecord) => activityLocationMap.has(a.id));

    if (activitiesWithLocationIds.length < 2) {
      return issues;
    }

    // Fetch the location details
    const locationIds = [...new Set(activitiesWithLocationIds.map((a: TravelActivityRecord) => activityLocationMap.get(a.id)))];
    const locations = await prisma.location.findMany({
      where: { id: { in: locationIds as number[] } },
    });

    // Create a lookup map for locations
    type LocationData = { id: number; latitude: unknown; longitude: unknown };
    type LocationRecord = { id: number; latitude: unknown; longitude: unknown };
    const locationMap = new Map<number, LocationData>();
    for (const loc of locations as LocationRecord[]) {
      locationMap.set(loc.id, { id: loc.id, latitude: loc.latitude, longitude: loc.longitude });
    }

    // Construct activities with location data attached
    const activitiesWithFullLocation = activitiesWithLocationIds
      .map((a: TravelActivityRecord) => {
        const loc = locationMap.get(activityLocationMap.get(a.id)!);
        return {
          id: a.id,
          name: a.name,
          startTime: a.startTime,
          endTime: a.endTime,
          location: loc || null,
        };
      })
      .filter((a): a is ActivityWithLocation => a.location !== null);

    if (activitiesWithFullLocation.length < 2) {
      return issues;
    }

    // Store activity IDs in order for looking up after analysis
    // This handles the case where multiple activities might have the same name
    const orderedActivityIds = activitiesWithFullLocation.map(a => a.id);

    // Analyze travel time between consecutive activities
    // The service expects activities with name, startTime, endTime, and location
    const activitiesForAnalysis = activitiesWithFullLocation.map(a => ({
      name: a.name,
      startTime: a.startTime,
      endTime: a.endTime,
      location: a.location ? {
        latitude: a.location.latitude as number | string | null,
        longitude: a.location.longitude as number | string | null,
      } : null,
    }));
    const alerts = travelTimeService.analyzeActivityTransitions(activitiesForAnalysis);

    // Convert alerts to validation issues
    // Alerts come back in order - alert[j] is for transition from activity[j] to activity[j+1]
    alerts.forEach((alert, alertIndex) => {
      // Use index-based lookup for reliability (handles duplicate activity names)
      const fromId = orderedActivityIds[alertIndex] || 0;
      const toId = orderedActivityIds[alertIndex + 1] || 0;
      const sortedIds = [fromId, toId].sort((a, b) => a - b);
      const issueKey = `${sortedIds[0]}:${sortedIds[1]}`;
      const issueId = this.generateIssueId('travel_time', issueKey);

      issues.push({
        id: issueId,
        category: 'SCHEDULE',
        type: 'travel_time',
        message: alert.message,
        affectedItems: [fromId, toId],
        suggestion:
          alert.type === 'impossible'
            ? `Allow ${alert.requiredMinutes} minutes for travel or adjust activity times`
            : `Consider adding ${30 - alert.bufferMinutes} more minutes buffer`,
        isDismissed: dismissedSet.has(issueId),
        quickAction: {
          type: 'view_conflict',
          label: 'View Activities',
          data: { activityIds: [fromId, toId] },
        },
      });
    });

    return issues;
  }

  // ===========================================================================
  // DOCUMENT CHECKS
  // ===========================================================================

  /**
   * Check if user's primary passport is valid for the trip
   * - Check if passport expires before trip end
   * - Check if passport has less than 6 months validity after trip end
   */
  private async checkPassportValidity(trip: TripWithRelations, dismissedSet: Set<string>): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Need trip end date for meaningful validation
    if (!trip.endDate) {
      return issues;
    }

    try {
      const passport = await travelDocumentService.getPrimaryPassport(trip.userId);

      if (!passport) {
        const issueKey = 'no_passport';
        const issueId = this.generateIssueId('passport_missing', issueKey);

        issues.push({
          id: issueId,
          category: 'DOCUMENTS',
          type: 'passport_missing',
          message: 'No passport on file',
          suggestion: 'Add your passport in Settings > Travel Documents for document validation',
          isDismissed: dismissedSet.has(issueId),
        });
        return issues;
      }

      if (!passport.expiryDate) {
        const issueKey = `passport_no_expiry:${passport.id}`;
        const issueId = this.generateIssueId('passport_no_expiry', issueKey);

        issues.push({
          id: issueId,
          category: 'DOCUMENTS',
          type: 'passport_no_expiry',
          message: `${passport.name || 'Passport'} has no expiry date set`,
          suggestion: 'Update your passport expiry date for proper validation',
          isDismissed: dismissedSet.has(issueId),
        });
        return issues;
      }

      const tripEnd = new Date(trip.endDate);
      const expiryDate = new Date(passport.expiryDate);

      // Check if passport expires before trip ends
      if (expiryDate <= tripEnd) {
        const issueKey = `passport_expires:${passport.id}`;
        const issueId = this.generateIssueId('passport_expires_during_trip', issueKey);

        issues.push({
          id: issueId,
          category: 'DOCUMENTS',
          type: 'passport_expires_during_trip',
          message: `${passport.name || 'Passport'} expires before or during the trip (${passport.expiryDate})`,
          affectedItems: [passport.id],
          suggestion: 'Renew your passport before traveling',
          isDismissed: dismissedSet.has(issueId),
          quickAction: {
            type: 'view_conflict',
            label: 'View Document',
            data: { documentId: passport.id },
          },
        });
        return issues; // Don't check 6-month rule if it expires during trip
      }

      // Check 6-month validity rule (many countries require this)
      const sixMonthsAfterTrip = new Date(tripEnd);
      sixMonthsAfterTrip.setMonth(sixMonthsAfterTrip.getMonth() + 6);

      if (expiryDate < sixMonthsAfterTrip) {
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - tripEnd.getTime()) / (1000 * 60 * 60 * 24));
        const issueKey = `passport_6month:${passport.id}`;
        const issueId = this.generateIssueId('passport_6month_rule', issueKey);

        issues.push({
          id: issueId,
          category: 'DOCUMENTS',
          type: 'passport_6month_rule',
          message: `${passport.name || 'Passport'} may not have 6 months validity after trip end (expires ${passport.expiryDate})`,
          affectedItems: [passport.id],
          suggestion: `Passport valid for only ${daysUntilExpiry} days after trip. Many countries require 6 months validity. Check destination requirements.`,
          isDismissed: dismissedSet.has(issueId),
          quickAction: {
            type: 'view_conflict',
            label: 'View Document',
            data: { documentId: passport.id },
          },
        });
      }
    } catch (error) {
      console.error('[TripValidator] Error checking passport validity:', error);
    }

    return issues;
  }

  /**
   * Check visa requirements for trip destinations
   * - Extract countries from location addresses
   * - Check visa requirements against user's passport country
   */
  private async checkVisaRequirements(trip: TripWithRelations, dismissedSet: Set<string>): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Skip if visa service isn't ready
    if (!visaRequirementService.isReady()) {
      return issues;
    }

    try {
      // Get user's passport country
      const passport = await travelDocumentService.getPrimaryPassport(trip.userId);
      if (!passport || !passport.issuingCountry) {
        // Can't check visa requirements without knowing passport country
        return issues;
      }

      const passportCountry = passport.issuingCountry;

      // Extract destination countries from trip locations
      type LocationRecord = { id: number; name: string; address: string | null };
      const destinationCountries = new Map<string, LocationRecord[]>(); // country -> locations

      for (const location of trip.locations as LocationRecord[]) {
        if (location.address) {
          const country = visaRequirementService.extractCountryFromAddress(location.address);
          if (country) {
            const existing = destinationCountries.get(country) || [];
            existing.push(location);
            destinationCountries.set(country, existing);
          }
        }
      }

      if (destinationCountries.size === 0) {
        return issues;
      }

      // Check visa requirements for each destination country
      const destinations = Array.from(destinationCountries.keys());
      const bulkResult = visaRequirementService.getVisaRequirementsForDestinations(
        passportCountry,
        destinations
      );

      // Create issues for destinations requiring visa action
      for (const result of bulkResult.requiresVisa) {
        const locations = destinationCountries.get(result.destinationCountry) || [];
        const locationNames = locations.map(l => l.name).slice(0, 3).join(', ');
        const moreCount = locations.length > 3 ? ` and ${locations.length - 3} more` : '';

        const issueKey = `visa:${result.destinationCountry}`;
        const issueId = this.generateIssueId('visa_required', issueKey);

        const visaTypeLabel = result.visaTypeInfo?.label || result.requirement?.visaType || 'Visa';
        const maxStay = result.requirement?.maxStayDays
          ? ` (max ${result.requirement.maxStayDays} days)`
          : '';

        issues.push({
          id: issueId,
          category: 'DOCUMENTS',
          type: 'visa_required',
          message: `${visaTypeLabel} required for ${result.destinationCountry}${maxStay}`,
          affectedItems: locations.map(l => l.id),
          suggestion: result.actionRequired
            ? `${result.actionRequired}. Locations: ${locationNames}${moreCount}`
            : `Check visa requirements for ${result.destinationCountry}. Locations: ${locationNames}${moreCount}`,
          isDismissed: dismissedSet.has(issueId),
        });
      }

      // Create informational issues for unknown destinations
      for (const result of bulkResult.unknown) {
        const locations = destinationCountries.get(result.destinationCountry) || [];
        const locationNames = locations.map(l => l.name).slice(0, 3).join(', ');

        const issueKey = `visa_unknown:${result.destinationCountry}`;
        const issueId = this.generateIssueId('visa_unknown', issueKey);

        issues.push({
          id: issueId,
          category: 'DOCUMENTS',
          type: 'visa_unknown',
          message: `Visa requirements unknown for ${result.destinationCountry}`,
          affectedItems: locations.map(l => l.id),
          suggestion: `Check visa requirements for ${result.destinationCountry} manually. Locations: ${locationNames}`,
          isDismissed: dismissedSet.has(issueId),
        });
      }
    } catch (error) {
      console.error('[TripValidator] Error checking visa requirements:', error);
    }

    return issues;
  }
}

export default new TripValidatorService();
