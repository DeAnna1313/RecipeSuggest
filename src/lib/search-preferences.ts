/** Saved search / constraint panel state for signed-in users (synced to Blobs). */

export interface SearchPreferencesState {
  cVegetarian: boolean;
  cVegan: boolean;
  cGlutenFree: boolean;
  cDairyFree: boolean;
  cNutFree: boolean;
  cApplianceMicrowave: boolean;
  cApplianceStove: boolean;
  cApplianceOven: boolean;
  cApplianceAirFryer: boolean;
  cApplianceNone: boolean;
  cApplianceOther: boolean;
  cApplianceOtherText: string;
  cMaxMins: string;
  cServings: string;
  cUnitSystem: string;
  cNotes: string;
}

export const SEARCH_PREFERENCES_KEYS = [
  "cVegetarian",
  "cVegan",
  "cGlutenFree",
  "cDairyFree",
  "cNutFree",
  "cApplianceMicrowave",
  "cApplianceStove",
  "cApplianceOven",
  "cApplianceAirFryer",
  "cApplianceNone",
  "cApplianceOther",
  "cApplianceOtherText",
  "cMaxMins",
  "cServings",
  "cUnitSystem",
  "cNotes",
] as (keyof SearchPreferencesState)[];

const MAX_NOTES = 2000;
const MAX_OTHER = 200;
const MAX_MINS_STR = 10;
const MAX_SERVINGS_STR = 10;

function asBool(v: unknown): boolean {
  return v === true;
}

function asStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/** Normalize API / JSON input into a safe partial for the client. */
export function normalizeSearchPreferences(input: unknown): Partial<SearchPreferencesState> {
  if (!input || typeof input !== "object") return {};
  const o = input as Record<string, unknown>;
  return {
    cVegetarian: asBool(o.cVegetarian),
    cVegan: asBool(o.cVegan),
    cGlutenFree: asBool(o.cGlutenFree),
    cDairyFree: asBool(o.cDairyFree),
    cNutFree: asBool(o.cNutFree),
    cApplianceMicrowave: asBool(o.cApplianceMicrowave),
    cApplianceStove: asBool(o.cApplianceStove),
    cApplianceOven: asBool(o.cApplianceOven),
    cApplianceAirFryer: asBool(o.cApplianceAirFryer),
    cApplianceNone: asBool(o.cApplianceNone),
    cApplianceOther: asBool(o.cApplianceOther),
    cApplianceOtherText: asStr(o.cApplianceOtherText, MAX_OTHER),
    cMaxMins: asStr(o.cMaxMins, MAX_MINS_STR),
    cServings: asStr(o.cServings, MAX_SERVINGS_STR),
    cUnitSystem: asStr(o.cUnitSystem, 20),
    cNotes: asStr(o.cNotes, MAX_NOTES),
  };
}

