'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TileLayerKey,
  getSavedTileLayer,
  saveTileLayer,
} from '@/lib/mapTileLayers';

export function useMapTileLayer() {
  const [layer, setLayerState] = useState<TileLayerKey>('osm');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setLayerState(getSavedTileLayer());
    setIsReady(true);
  }, []);

  const setLayer = useCallback((key: TileLayerKey) => {
    setLayerState(key);
    saveTileLayer(key);
  }, []);

  return { layer, setLayer, isReady };
}
