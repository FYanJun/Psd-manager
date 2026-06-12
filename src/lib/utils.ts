export function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function parseDateTimeValue(value: string) {
  if (!value.trim()) return 0;
  const normalizedValue = value
    .replace(/星期[一二三四五六日天]/g, "")
    .replace(/[年月]/g, "/")
    .replace(/日/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const timestamp = Date.parse(normalizedValue);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

export function compactSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/[\s._:/\\-]+/g, "");
}

export function fuzzyContains(source: string, query: string) {
  if (!query) return true;
  if (source.includes(query)) return true;

  const compactSource = compactSearchValue(source);
  const compactQuery = compactSearchValue(query);
  if (!compactQuery) return true;
  if (compactSource.includes(compactQuery)) return true;

  let queryIndex = 0;
  for (const char of compactSource) {
    if (char === compactQuery[queryIndex]) queryIndex += 1;
    if (queryIndex === compactQuery.length) return true;
  }
  return false;
}

export function filterDeviceTypeChoices<T extends { label: string }>(types: T[], query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return types;
  return types.filter((type) => normalizeSearchValue(type.label).includes(normalizedQuery));
}

export function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
