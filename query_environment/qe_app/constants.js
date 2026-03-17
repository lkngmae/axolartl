export const PREFERENCE_OPTIONS = ['STRUCTURE', 'URBAN', 'GREENERY', 'WATER', 'HISTORY', 'BEACH', 'VIEW', 'ART'];
export const DISTANCE_OPTIONS = ['1 MI', '5 MI', '10 MI', '25 MI', '50 MI'];
export const TIME_OPTIONS = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'];
export const TIME_MAP = {
  MORNING: '08:00',
  AFTERNOON: '14:00',
  EVENING: '18:00',
  NIGHT: '21:00',
};

export function miToMeters(miStr) {
  return Math.round(parseFloat(miStr) * 1609.34).toString();
}
