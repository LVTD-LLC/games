// Appearance only: vehicle choices never change simulation parameters.
export const PAINTS = [
  { name: 'Coral', color: '#e87351' },
  { name: 'Blue', color: '#6c91b6' },
  { name: 'Green', color: '#80a080' },
  { name: 'Yellow', color: '#d9b14d', ink: '#334944' },
  { name: 'Purple', color: '#a68ac4' },
  { name: 'Red', color: '#c74747' },
  { name: 'Orange', color: '#ed9749', ink: '#334944' },
  { name: 'Teal', color: '#3f9891' },
  { name: 'Pink', color: '#d98eaf', ink: '#334944' },
  { name: 'White', color: '#eee9df', ink: '#334944' },
  { name: 'Graphite', color: '#424c52' },
  { name: 'Sky', color: '#7ec4d3', ink: '#334944' },
];
export const COLORS = PAINTS.map((paint) => paint.color);
export const CAR_TYPES = [
  {
    id: 'racer',
    name: 'Racer',
    silhouette: 'M8 28V22H23L31 11H51L65 22H78V30H8Z M12 17H26V21H12Z',
  },
  {
    id: 'rally',
    name: 'Rally',
    silhouette: 'M8 29V17L15 9H52L64 21H78V30H8Z M19 5H48V8H19Z',
  },
  {
    id: 'pickup',
    name: 'Pickup',
    silhouette: 'M8 29V18H39V10H57L65 21H78V30H8Z',
  },
];
export const carTypeFrom = (value) =>
  CAR_TYPES.some((type) => type.id === value) ? value : 'racer';
