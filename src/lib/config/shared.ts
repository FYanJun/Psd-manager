import type { ConfigFormat } from "../types";

export const CSV_HEADERS = [
  "设备类型UUID",
  "设备类型",
  "类型图标",
  "类型颜色",
  "设备UUID",
  "设备名称",
  "资产编号",
  "设备位置",
  "设备信息",
  "设备备注",
  "设备图标",
  "设备更新时间",
  "账号UUID",
  "用户名",
  "账号标签",
  "密码",
  "账号备注",
  "账号更新时间",
  "密码更新时间",
  "密码历史",
];

export const CONFIG_FORMATS: ConfigFormat[] = ["json", "csv", "yaml"];

export class ConfigImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigImportError";
  }
}

export function stripUtf8Bom(content: string) {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export function readRecordValue(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key] ?? "";
  }
  return "";
}

export function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

export function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (inQuotes) throw new ConfigImportError("CSV 格式错误：存在未闭合的引号");

  row.push(cell);
  rows.push(row);
  return rows;
}
