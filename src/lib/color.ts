import { typeColorOptions } from "./constants";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const NAMED_COLOR_VALUES = new Set(typeColorOptions.map((option) => option.value));

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim());
}

function isNamedTypeColor(value: string): boolean {
  return NAMED_COLOR_VALUES.has(value.trim());
}

export function typeColorClass(value: string): string {
  const color = value.trim().toLowerCase();
  return isNamedTypeColor(color) ? `type-${color}` : isHexColor(color) ? "type-custom" : "type-blue";
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(index => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function readableTextColor(hex: string) {
  const background = relativeLuminance(hex);
  const dark = relativeLuminance("#26313b");
  const darkContrast = (Math.max(background, dark) + 0.05) / (Math.min(background, dark) + 0.05);
  if (darkContrast >= 4.5) return "#26313b";
  if (1.05 / (background + 0.05) >= 4.5) return "#ffffff";
  // Midtone backgrounds can fail both existing foregrounds; black then meets AA.
  return "#000000";
}

export function typeColorStyle(value: string): string {
  const color = value.trim().toLowerCase();
  if (!isHexColor(color)) return "";
  return `--custom-type-color: ${color}; --custom-type-text: ${readableTextColor(color)};`;
}

export function iconColorStyle(iconClass: string): string {
  const match = iconClass.match(/(?:^|\s)icon-custom-([0-9a-f]{6})(?:\s|$)/i);
  return match ? typeColorStyle(`#${match[1]}`) : "";
}

export function colorInputValue(value: string): string {
  const color = value.trim().toLowerCase();
  return isHexColor(color) ? color : "#cde5ff";
}
