export type TileLayerKey = 'osm' | 'maptiler' | 'cartodb';

export interface TileLayerConfig {
  key: TileLayerKey;
  name: string;
  url: string;
  attribution: string;
  subdomains?: string;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';

export const TILE_LAYERS: Record<TileLayerKey, TileLayerConfig> = {
  osm: {
    key: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    subdomains: 'abc',
  },
  maptiler: {
    key: 'maptiler',
    name: 'MapTiler',
    url: MAPTILER_KEY
      ? `https://api.maptiler.com/maps/dataviz/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
      : '',
    attribution: '© MapTiler © OpenStreetMap',
  },
  cartodb: {
    key: 'cartodb',
    name: 'CartoDB',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© CartoDB © OpenStreetMap',
    subdomains: 'abcd',
  },
};

export const TILE_LAYER_OPTIONS: TileLayerConfig[] = [
  TILE_LAYERS.osm,
  TILE_LAYERS.maptiler,
  TILE_LAYERS.cartodb,
];

const STORAGE_KEY = 'run_blue_map_tile_layer';

export function getSavedTileLayer(): TileLayerKey {
  if (typeof window === 'undefined') return 'osm';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in TILE_LAYERS) return raw as TileLayerKey;
  } catch {
    // ignore
  }
  return 'osm';
}

export function saveTileLayer(key: TileLayerKey): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // ignore
  }
}
