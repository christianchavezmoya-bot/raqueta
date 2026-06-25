import { BadRequestException } from '@nestjs/common';

export const DEFAULT_CLUB_ACCENT_COLOR = '#16A34A';

const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function normalizeAccentColor(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!HEX_COLOR_PATTERN.test(value)) {
    throw new BadRequestException('accentColor must be a valid hex color like #1F3D2B');
  }
  return value.toUpperCase();
}

export function resolveAccentColor(value: string | null | undefined) {
  return value ?? DEFAULT_CLUB_ACCENT_COLOR;
}
