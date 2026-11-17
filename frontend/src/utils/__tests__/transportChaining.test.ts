import { describe, it, expect } from "vitest";
import { chainedLegTimes } from "../transportChaining";

describe("chainedLegTimes", () => {
  it("departs after the layover and arrives after departing", () => {
    expect(chainedLegTimes("2026-12-05T16:45")).toEqual({
      departureTime: "2026-12-05T18:45",
      arrivalTime: "2026-12-05T19:45",
    });
  });

  it("rolls over midnight for both times", () => {
    expect(chainedLegTimes("2026-12-05T22:30")).toEqual({
      departureTime: "2026-12-06T00:30",
      arrivalTime: "2026-12-06T01:30",
    });
  });

  it("returns null for an incomplete previous arrival", () => {
    expect(chainedLegTimes("")).toBeNull();
    expect(chainedLegTimes("2026-12-05")).toBeNull();
  });
});
