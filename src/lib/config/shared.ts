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
  "连接地址",
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
  let justClosedQuote = false;
  let fieldStarted = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
    justClosedQuote = false;
    fieldStarted = false;
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
        justClosedQuote = true;
      } else {
        cell += char;
      }
      continue;
    }

    if (justClosedQuote) {
      if (char === ",") {
        pushCell();
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && nextChar === "\n") index += 1;
        pushRow();
      } else {
        throw new ConfigImportError("CSV 格式错误：闭合引号后只能跟逗号或换行");
      }
      continue;
    }

    if (char === '"') {
      if (fieldStarted || cell.length > 0) {
        throw new ConfigImportError("CSV 格式错误：引号只能出现在字段开头");
      }
      inQuotes = true;
      fieldStarted = true;
    } else if (char === ",") {
      pushCell();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && nextChar === "\n") index += 1;
      pushRow();
    } else {
      cell += char;
      fieldStarted = true;
    }
  }

  if (inQuotes) throw new ConfigImportError("CSV 格式错误：存在未闭合的引号");

  pushRow();
  return rows;
}
