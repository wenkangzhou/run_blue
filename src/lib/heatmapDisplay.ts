export type HeatmapMapMode = 'overview' | 'patterns' | 'details';

export interface HeatmapDisplayPolicy {
  mode: HeatmapMapMode;
  routeLimit: number;
  repeatedOnly: boolean;
}

export const HEATMAP_PATTERN_ZOOM = 14;
export const HEATMAP_DETAIL_ZOOM = 16;
export const HEATMAP_PATTERN_ROUTE_LIMIT = 72;
export const HEATMAP_DETAIL_ROUTE_LIMIT = 180;

export function getHeatmapDisplayPolicy(zoom: number): HeatmapDisplayPolicy {
  if (zoom < HEATMAP_PATTERN_ZOOM) {
    return {
      mode: 'overview',
      routeLimit: 0,
      repeatedOnly: false,
    };
  }
  if (zoom < HEATMAP_DETAIL_ZOOM) {
    return {
      mode: 'patterns',
      routeLimit: HEATMAP_PATTERN_ROUTE_LIMIT,
      repeatedOnly: true,
    };
  }
  return {
    mode: 'details',
    routeLimit: HEATMAP_DETAIL_ROUTE_LIMIT,
    repeatedOnly: false,
  };
}

export function getHeatmapClusterCellSizePx(zoom: number): number {
  if (zoom <= 9) return 132;
  if (zoom <= 11) return 112;
  if (zoom <= 12) return 96;
  return 108;
}
