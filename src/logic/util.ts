export const generateId = (prefix: string, length: number = 6): string => {
  return `${prefix}_${Math.random()
    .toString(36)
    .substring(2, length + 2)}`;
};

export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const stringifyValues = (
  data: Record<string, unknown>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const key in data) {
    result[key] = JSON.stringify(data[key]);
  }
  return result;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseTables = (entries: IterableIterator<any>): Table[] => {
  const results: Table[] = [];
  for (const [, v] of entries) {
    const data: Record<string, unknown> = {};
    let hasError = false;
    for (const [k, s] of v.entries()) {
      try {
        data[k] = JSON.parse(s);
      } catch {
        hasError = true;
        break;
      }
    }
    if (!hasError) {
      results.push(data as Table);
    }
  }
  return results;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseTable = (entries: IterableIterator<any>): Table | null => {
  let hasError = false;
  const data: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    try {
      data[k] = JSON.parse(v);
    } catch {
      hasError = true;
      break;
    }
  }
  if (hasError) return null;
  return data as Table;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;

  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;

    const valA = (a as Record<string, unknown>)[key];
    const valB = (b as Record<string, unknown>)[key];

    const areObjects =
      typeof valA === "object" &&
      valA !== null &&
      typeof valB === "object" &&
      valB !== null;
    if (
      (areObjects && !deepEqual(valA, valB)) ||
      (!areObjects && valA !== valB)
    ) {
      return false;
    }
  }

  return true;
};

// make sure apiKey is a valid Ably API Key
export const decodeApiKey = (apiKey: string): string => {
  if (apiKey.includes(":")) {
    return apiKey;
  }
  return atob(apiKey);
};

// Ably API Key has special characters which may not be well supported in some browsers
// So it should be stored and shared in base64-encoded form
export const encodeApiKey = (apiKey: string): string => {
  if (!apiKey.includes(":")) {
    return apiKey;
  }
  return btoa(apiKey);
};

export const calDurationSec = (ts: number) => {
  return Math.ceil((ts - Date.now()) / 1000);
};
