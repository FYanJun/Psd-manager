import { typeColorOptions } from "./constants";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const NAMED_COLOR_VALUES = new Set(typeColorOptions.map((option) => option.value));

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function isNamedTypeColor(value: string): boolean {
  return NAMED_COLOR_VALUES.has(value.trim());
}

export function typeColorClass(value: string): string {
  const color = value.trim().toLowerCase();
  return isNamedTypeColor(color) ? `type-${color}` : isHexColor(color) ? "type-custom" : "type-blue";
}

function readableTextColor(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 160 ? "#26313b" : "#ffffff";
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
