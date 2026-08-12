export function getCalendarHeatmapLevel(
  value: number,
  distribution: number[],
  reverse = false
): number {
  if (value <= 0) return 0;

  return getCalendarHeatmapLevelMap(distribution, reverse).get(value) ?? 0;
}

export function getCalendarHeatmapLevelMap(
  distribution: number[],
  reverse = false
): Map<number, number> {
  const levels = new Map<number, number>();

  const sortedValues = Array.from(new Set(distribution.filter((item) => item > 0)))
    .sort((a, b) => a - b);
  sortedValues.forEach((value, index) => {
    const percentile = reverse
      ? (sortedValues.length - index) / sortedValues.length
      : (index + 1) / sortedValues.length;
    levels.set(value, Math.max(1, Math.min(4, Math.ceil(percentile * 4))));
  });

  return levels;
}
