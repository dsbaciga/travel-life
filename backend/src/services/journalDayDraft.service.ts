import prisma from '../config/database';
import { llmService, LlmError } from './llm.service';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { getUserTimezone } from './_shared/timezoneResolution';
import {
  gatherDayFacts,
  isEmptyDay,
  draftDateWindow,
  isDateInDraftWindow,
  describeDraftWindow,
  buildDayDraftPrompt,
  parseDayDraftReply,
  type DayDraftRawData,
} from './_shared/dayDraft';
import { AppError } from '../errors/errors';

export interface JournalDayDraft {
  title: string;
  /** Markdown. */
  body: string;
  /** The calendar day the draft is about (`YYYY-MM-DD`). */
  date: string;
  /** True when the day had more material than fit in the prompt. */
  truncated: boolean;
}

const toNumber = (value: { toString(): string } | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
};

class JournalDayDraftService {
  /**
   * Draft a journal entry for one calendar day of a trip.
   *
   * Read-only: returns text and never creates or changes a journal entry. The
   * caller must be able to edit the trip, because the draft is only useful to
   * someone who can save it.
   */
  async generateDayDraft(userId: number, tripId: number, date: string): Promise<JournalDayDraft> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { title: true, timezone: true, startDate: true, endDate: true },
    });
    if (!trip) throw new AppError('Trip not found', 404);

    // Before any day data is read or the LLM is considered: a date outside the
    // trip is rejected outright. Trips without dates are not restricted.
    if (!isDateInDraftWindow(date, draftDateWindow(trip.startDate, trip.endDate))) {
      throw new AppError(
        `${date} is outside this trip, so there is nothing to draft. ` +
          `${describeDraftWindow(trip.startDate, trip.endDate)} ` +
          '(drafts also cover the day before and the day after, for travel days).',
        422
      );
    }

    const userTimezone = await getUserTimezone(userId);

    // A day is at most a few dozen rows, but the queries are widened by a day
    // each side because the day boundary depends on each entity's own zone.
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const from = new Date(dayStart.getTime() - 36 * 3600 * 1000);
    const to = new Date(dayStart.getTime() + 60 * 3600 * 1000);

    const [activities, transportation, lodging, locations, photos, foodEntries, weather] =
      await Promise.all([
        prisma.activity.findMany({
          where: {
            tripId,
            startTime: { lt: to },
            OR: [{ endTime: { gte: from } }, { startTime: { gte: from } }],
          },
          select: {
            id: true, name: true, description: true, category: true, allDay: true,
            startTime: true, endTime: true, timezone: true, notes: true,
          },
          orderBy: { startTime: 'asc' },
        }),
        prisma.transportation.findMany({
          where: {
            tripId,
            OR: [
              { scheduledStart: { gte: from, lt: to } },
              { scheduledEnd: { gte: from, lt: to } },
              { actualStart: { gte: from, lt: to } },
              { actualEnd: { gte: from, lt: to } },
            ],
          },
          select: {
            type: true, company: true, startLocationText: true, endLocationText: true,
            scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true,
            startTimezone: true, endTimezone: true, status: true, notes: true,
            startLocation: { select: { name: true } },
            endLocation: { select: { name: true } },
          },
        }),
        prisma.lodging.findMany({
          where: { tripId, checkInDate: { lt: to }, checkOutDate: { gte: from } },
          select: {
            type: true, name: true, address: true, checkInDate: true, checkOutDate: true,
            timezone: true, notes: true,
          },
        }),
        // All trip locations: needed to name the place near a photo, and a trip's
        // location list is small.
        prisma.location.findMany({
          where: { tripId },
          select: {
            name: true, address: true, visitDatetime: true, timezone: true, notes: true,
            latitude: true, longitude: true,
          },
        }),
        prisma.photo.findMany({
          where: { tripId, mediaType: 'image', takenAt: { gte: from, lt: to } },
          select: { caption: true, takenAt: true, latitude: true, longitude: true },
          orderBy: { takenAt: 'asc' },
        }),
        prisma.foodLogEntry.findMany({
          where: { tripId },
          select: {
            activityId: true, restaurantName: true, dish: true, rating: true,
            orderAgain: true, notes: true,
            location: { select: { name: true } },
          },
        }),
        prisma.weatherData.findMany({
          where: { tripId, date: dayStart },
          select: {
            date: true, temperatureHigh: true, temperatureLow: true,
            conditions: true, precipitation: true,
          },
        }),
      ]);

    const raw: DayDraftRawData = {
      tripTitle: trip.title,
      tripTimezone: trip.timezone,
      userTimezone,
      activities,
      transportation: transportation.map(({ startLocation, endLocation, ...t }) => ({
        ...t,
        startLocationName: startLocation?.name ?? null,
        endLocationName: endLocation?.name ?? null,
      })),
      lodging,
      locations: locations.map((l) => ({
        ...l,
        latitude: toNumber(l.latitude),
        longitude: toNumber(l.longitude),
      })),
      photos: photos.map((p) => ({
        ...p,
        latitude: toNumber(p.latitude),
        longitude: toNumber(p.longitude),
      })),
      foodEntries: foodEntries.map(({ location, ...f }) => ({
        ...f,
        locationName: location?.name ?? null,
      })),
      weather: weather.map((w) => ({
        date: w.date,
        temperatureHigh: toNumber(w.temperatureHigh),
        temperatureLow: toNumber(w.temperatureLow),
        conditions: w.conditions,
        precipitation: toNumber(w.precipitation),
      })),
    };

    const facts = gatherDayFacts(raw, date);
    if (isEmptyDay(facts)) {
      throw new AppError(
        'There is nothing recorded for this day yet. Add activities, photos, or other details first.',
        422
      );
    }

    if (!(await llmService.isConfigured(userId))) {
      throw new AppError(
        'AI features are not configured. Add an API key in Settings, or ask your administrator to set LLM_API_KEY.',
        503
      );
    }

    const { systemPrompt, userPrompt } = buildDayDraftPrompt(facts);

    let reply: string;
    try {
      reply = await llmService.chat(systemPrompt, userPrompt, {
        maxTokens: 1024,
        temperature: 0.5,
        userId,
      });
    } catch (err) {
      if (err instanceof LlmError) {
        throw new AppError(`AI draft generation failed: ${err.message}`, 502);
      }
      throw err;
    }

    const parsed = parseDayDraftReply(reply, `Journal for ${date}`);
    if (!parsed.body) {
      throw new AppError('AI draft generation returned no content.', 502);
    }

    return { ...parsed, date, truncated: facts.truncated };
  }
}

export const journalDayDraftService = new JournalDayDraftService();
