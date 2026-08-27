import { typeColorOptions } from "./constants";
import { isHexColor } from "./color";

export const INPUT_LIMITS = {
  deviceTypeName: 40,
  deviceName: 120,
  username: 120,
  accountTag: 40,
  assetCode: 80,
  location: 120,
  connectionAddress: 2048,
  notes: 2000,
  passwordReason: 200,
  password: 1024,
  generatorCharacters: 128,
  deviceTypeIcon: 2,
} as const;

export const PASSWORD_CHARACTER_ERROR = `密码不能包含换行、控制字符或不可见字符，且不能超过 ${INPUT_LIMITS.password} 个字符`;
export const CONNECTION_ADDRESS_ERROR = "连接地址格式不正确，请输入有效的 IPv4、IPv6、主机名或网络 URL";

const validDeviceTypeColors = new Set(typeColorOptions.map((option) => option.value));
const blockedConnectionProtocols = new Set([
  "about:",
  "blob:",
  "chrome:",
  "chrome-extension:",
  "data:",
  "file:",
  "javascript:",
  "mailto:",
  "tel:",
  "urn:",
  "view-source:",
]);

function isVisibleAsciiCharacter(character: string) {
  const code = character.charCodeAt(0);
  return code >= 0x21 && code <= 0x7e;
}

function isAsciiSymbol(character: string) {
  const code = character.charCodeAt(0);
  return isVisibleAsciiCharacter(character)
    && !((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a));
}

function isInvisibleControlCharacter(character: string, allowLineBreaks = false) {
  const code = character.charCodeAt(0);
  if (code >= 0x00 && code <= 0x1f) {
    return !(allowLineBreaks && (character === "\n" || character === "\r"));
  }
  if (code >= 0x7f && code <= 0x9f) return true;
  // Zero-width and bidi controls can make otherwise identical values display differently.
  return (code >= 0x200b && code <= 0x200f)
    || (code >= 0x202a && code <= 0x202e)
    || (code >= 0x2060 && code <= 0x206f)
    || code === 0x2028
    || code === 0x2029
    || code === 0xfeff;
}

export function sanitizeTextInput(value: string, allowLineBreaks = false) {
  return Array.from(value)
    .filter((character) => !isInvisibleControlCharacter(character, allowLineBreaks))
    .join("");
}

export function sanitizeSingleLineTextInput(value: string) {
  return sanitizeTextInput(value);
}

export function sanitizeMultilineTextInput(value: string) {
  return sanitizeTextInput(value, true);
}

export function getTextInputValidationError(
  value: string,
  maxLength: number,
  allowLineBreaks = false,
) {
  if (sanitizeTextInput(value, allowLineBreaks) !== value) {
    return allowLineBreaks
      ? "不能包含不可见控制字符"
      : "不能包含换行或不可见控制字符";
  }
  if (Array.from(value).length > maxLength) return `不能超过 ${maxLength} 个字符`;
  return null;
}

export function hasValidTextInput(value: string, maxLength: number, allowLineBreaks = false) {
  return getTextInputValidationError(value, maxLength, allowLineBreaks) === null;
}

export function sanitizePasswordInput(value: string) {
  return sanitizeTextInput(value);
}

export function sanitizeGeneratorSymbols(value: string) {
  return Array.from(value)
    .filter((character) => {
      if (isInvisibleControlCharacter(character)) return false;
      if (isAsciiSymbol(character)) return true;
      // The field is for symbols, so letters and numbers remain covered by
      // their dedicated generator groups while Unicode punctuation/symbols
      // can still be used as custom characters.
      return !/[\p{L}\p{N}]/u.test(character);
    })
    .join("");
}

export function sanitizeConnectionAddressInput(value: string) {
  return sanitizeSingleLineTextInput(value);
}

export function hasValidPasswordCharacters(value: string) {
  return hasValidTextInput(value, INPUT_LIMITS.password);
}

// Keep this named alias at the persistence boundary so the storage and import
// code make their compatibility intent explicit while sharing the same rule as
// new password entry fields.
export function hasValidPersistedPassword(value: string) {
  return hasValidPasswordCharacters(value);
}

function isValidIpv4(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
    return Number(part) <= 255;
  });
}

function isValidIpv6(value: string) {
  const normalized = value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
  if (!normalized.includes(":")) return false;
  try {
    const parsed = new URL(`http://[${normalized}]/`);
    return parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]");
  } catch {
    return false;
  }
}

function isValidHostname(value: string) {
  let canonicalHostname = "";
  try {
    canonicalHostname = new URL(`http://${value}/`).hostname;
  } catch {
    return false;
  }
  const hostname = canonicalHostname.startsWith("[") && canonicalHostname.endsWith("]")
    ? canonicalHostname.slice(1, -1)
    : canonicalHostname;
  if (isValidIpv4(hostname) || isValidIpv6(hostname)) return true;

  const normalized = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (!normalized || normalized.length > 253) return false;
  return normalized.split(".").every((label) =>
    label.length > 0
    && label.length <= 63
    && /^[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?$/.test(label)
  );
}

function isValidParsedConnectionUrl(value: string, hasExplicitScheme: boolean) {
  const candidate = hasExplicitScheme ? value : `http://${value}`;
  try {
    const parsed = new URL(candidate);
    if (hasExplicitScheme && blockedConnectionProtocols.has(parsed.protocol.toLowerCase())) return false;
    const authority = candidate.slice(candidate.indexOf("://") + 3).split(/[/?#]/, 1)[0] ?? "";
    if (!parsed.hostname || authority.includes("@") || parsed.username || parsed.password || !isValidHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isValidConnectionAddress(value: string) {
  const normalized = value.trim();
  if (normalized === "") return true;
  if (Array.from(normalized).length > INPUT_LIMITS.connectionAddress) return false;
  if (sanitizeSingleLineTextInput(normalized) !== normalized) return false;
  if (/[^\S\r\n]|[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) return false;
  if (isValidIpv4(normalized) || isValidIpv6(normalized)) return true;

  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(normalized);
  return isValidParsedConnectionUrl(normalized, hasExplicitScheme);
}

export function isValidDeviceTypeIconText(value: string) {
  return hasValidTextInput(value.trim(), INPUT_LIMITS.deviceTypeIcon);
}

export function isValidDeviceTypeColor(value: string) {
  return validDeviceTypeColors.has(value) || isHexColor(value);
}
