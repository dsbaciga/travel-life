/**
 * @travel-life/shared — pure domain code with no DOM or native dependencies.
 */
export * from './constants/countryFacts';
export * from './entityLinks/rules';
export * from './utils/geo';
export * from './utils/mapsDeepLinks';
export {
  OpeningHoursService,
  default as openingHoursService,
  type OpeningStatus,
  type OpeningHoursEvaluation,
  type ParseResult as OpeningHoursParseResult,
} from './utils/openingHours';
export * from './time/timezone';
export * from './itinerary/timeShift';
export * from './receipt/receiptParser';
export * from './types/entities';
export * from './validation/schemas';
