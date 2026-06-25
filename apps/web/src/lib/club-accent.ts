export const DEFAULT_CLUB_ACCENT_COLOR = '#16A34A';

export function resolveClubAccent(color?: string | null) {
  return color ?? DEFAULT_CLUB_ACCENT_COLOR;
}

export function withAlpha(hexColor: string, alpha: string) {
  const normalized = hexColor.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  return `#${expanded}${alpha}`;
}

export function getContrastText(hexColor: string) {
  const normalized = hexColor.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72 ? '#111827' : '#FFFFFF';
}
