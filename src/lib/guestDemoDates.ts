const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function getShanghaiDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(valueByType.get('year')),
    month: Number(valueByType.get('month')),
    day: Number(valueByType.get('day')),
  };
}

function getCalendarDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month, day) / DAY_MS);
}

export function getGuestDemoDateKey(now = new Date()): string {
  const { year, month, day } = getShanghaiDateParts(now);
  return [
    year,
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

export function getGuestDemoDateOffsetDays(referenceDate: string, now = new Date()): number {
  const reference = new Date(referenceDate);
  const latestCompletedDay = getShanghaiDateParts(now);

  return getCalendarDayNumber(
    latestCompletedDay.year,
    latestCompletedDay.month - 1,
    latestCompletedDay.day - 1
  ) - getCalendarDayNumber(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate()
  );
}

export function shiftGuestDemoDate(date: string, offsetDays: number): string {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().replace('.000Z', 'Z');
}

export function getGuestPlanCreatedAt(now = new Date(), daysAgo = 28): string {
  const { year, month, day } = getShanghaiDateParts(now);
  const shanghaiMidnightUtc = Date.UTC(year, month - 1, day - daysAgo) - SHANGHAI_UTC_OFFSET_MS;
  return new Date(shanghaiMidnightUtc).toISOString();
}
