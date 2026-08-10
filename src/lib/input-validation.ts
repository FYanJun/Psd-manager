import { typeColorOptions } from "./constants";

export const PASSWORD_CHARACTER_ERROR = "密码只能使用半角英文、数字和常用符号，不能包含中文、空格或全角字符";
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

export function sanitizePasswordInput(value: string) {
  return Array.from(value).filter(isVisibleAsciiCharacter).join("");
}

export function sanitizeAsciiSymbols(value: string) {
  return Array.from(value).filter(isAsciiSymbol).join("");
}

function isAddressControlCharacter(character: string) {
  const code = character.charCodeAt(0);
  return (code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}

export function sanitizeConnectionAddressInput(value: string) {
  return Array.from(value).filter((character) => !isAddressControlCharacter(character)).join("");
}

export function hasValidPasswordCharacters(value: string) {
  return sanitizePasswordInput(value) === value;
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
  if (/[^\S\r\n]|[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) return false;
  if (isValidIpv4(normalized) || isValidIpv6(normalized)) return true;

  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(normalized);
  return isValidParsedConnectionUrl(normalized, hasExplicitScheme);
}

export function isValidDeviceTypeIconText(value: string) {
  return Array.from(value.trim()).length <= 2;
}

export function isValidDeviceTypeColor(value: string) {
  return validDeviceTypeColors.has(value);
}
