export type LeafletContainerElement = HTMLDivElement & {
  _leaflet_id?: number | null;
};

const LEAFLET_CLASSES = [
  'leaflet-container',
  'leaflet-touch',
  'leaflet-retina',
  'leaflet-fade-anim',
  'leaflet-grab',
  'leaflet-touch-drag',
  'leaflet-touch-zoom',
  'leaflet-safari',
];

export function prepareLeafletContainer(container: HTMLDivElement) {
  releaseLeafletContainer(container);
  container.innerHTML = '';
}

export function releaseLeafletContainer(container: HTMLDivElement | null) {
  if (!container) return;

  const leafletContainer = container as LeafletContainerElement;
  delete leafletContainer._leaflet_id;
  container.classList.remove(...LEAFLET_CLASSES);
}
