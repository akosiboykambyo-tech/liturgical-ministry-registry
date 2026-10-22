import { PARISHES } from "@/lib/constants";

/**
 * Resolve known CSV spelling/format variations to an official parish name.
 * Deliberately avoid fuzzy matching: unrelated parishes must not be conflated.
 */
function parishKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\bst\.?\b/g, "saint")
    .replace(/\s+/g, " ")
    .replace(/\s*\.\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXPLICIT_ALIASES: Record<string, string> = {
  [parishKey("St. Clare of Assissi Parish")]: "St. Clare of Assisi Parish",
  [parishKey("Saint Clare of Assissi Parish")]: "St. Clare of Assisi Parish",
};

export function canonicalParish(value: string): string | null {
  const key = parishKey(value);
  if (!key) return null;
  return PARISHES.find((parish) => parishKey(parish) === key) ?? EXPLICIT_ALIASES[key] ?? null;
}
