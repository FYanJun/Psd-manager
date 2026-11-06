import * as XLSX from "xlsx";
import { createConfigMeta, parseConfigContent } from "../config";
import { DEFAULT_ACCOUNT_TAG } from "../constants";
import type { ConfigData, DeviceAccount, DeviceTypeMeta, PasswordHistory, VaultItem } from "../types";
import { createBlankAccount, createBlankItem, getAccounts, iconClassForColor, syncItemWithAccounts } from "../vault";
import { createUuid } from "../uuid";
import { buildDeviceTypeGroups } from "./export-utils";
import { createJsonConfigPayload } from "./structured";
import { ConfigImportError } from "./shared";

const MAIN_SHEET = {
  name: "设备账号",
  headers: ["设备类型", "设备名称", "编号", "管理地址", "设备位置", "账号", "密码"],
} as const;
const HISTORY_SHEET = {
  name: "密码历史",
  headers: ["设备类型", "设备名称", "账号", "旧密码", "新密码", "修改时间", "修改原因"],
} as const;

type Row = Record<string, string>;
type DeviceRecord = {
  deviceType: string;
  deviceName: string;
  assetCode: string;
  ipAddress: string;
  location: string;
  accounts: DeviceAccount[];
  accountNames: Set<string>;
};

function relationKey(deviceType: string, deviceName: string, username = "") {
  return [deviceType.trim(), deviceName.trim(), username.trim()].join("\u0000");
}

function createTableSheet(headers: readonly string[], rows: readonly string[][]) {
  const values: XLSX.CellObject[][] = [headers, ...rows].map((row) =>
    row.map((value) => ({ t: "s", v: value })),
  );
  const sheet = XLSX.utils.aoa_to_sheet(values);
  sheet["!cols"] = headers.map((header) => ({ wch: Math.min(36, Math.max(14, header.length * 2 + 4)) }));
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(0, values.length - 1), c: headers.length - 1 },
    }),
  };
  return sheet;
}

export function createXlsxConfigPayload(items: VaultItem[], customDeviceTypes: DeviceTypeMeta[]): Uint8Array {
  const groups = buildDeviceTypeGroups({ items, customDeviceTypes, meta: createConfigMeta() });
  const devices = groups.flatMap(({ items: groupedItems }) => groupedItems);
  const accountRows = devices.flatMap((device) => {
    const accounts = getAccounts(device);
    if (accounts.length === 0) return [[device.deviceType, device.deviceName, device.assetCode, device.ipAddress, device.location, "", ""]];
    return accounts.map((account) => [
      device.deviceType,
      device.deviceName,
      device.assetCode,
      device.ipAddress,
      device.location,
      account.username,
      account.password,
    ]);
  });
  const historyRows = devices.flatMap((device) => getAccounts(device).flatMap((account) =>
    [...account.history]
      .sort((left, right) => left.id - right.id)
      .map((history) => [
        device.deviceType,
        device.deviceName,
        account.username,
        history.password,
        history.newPassword,
        history.changedAt,
        history.reason,
      ]),
  ));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, createTableSheet(MAIN_SHEET.headers, accountRows), MAIN_SHEET.name);
  XLSX.utils.book_append_sheet(workbook, createTableSheet(HISTORY_SHEET.headers, historyRows), HISTORY_SHEET.name);
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  return output instanceof Uint8Array ? output : new Uint8Array(output);
}

function readCellText(sheet: XLSX.WorkSheet, row: number, column: number, label: string) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  if (!cell) return "";
  if (cell.f != null) throw new ConfigImportError(`Excel 工作表“${label}”不能包含公式`);
  if (cell.t === "z") return "";
  if ((cell.t !== "s" && cell.t !== "str") || typeof cell.v !== "string") {
    throw new ConfigImportError(`Excel 工作表“${label}”只能使用文本单元格，请检查第 ${row + 1} 行`);
  }
  return cell.v;
}

function readTable(workbook: XLSX.WorkBook, name: string, headers: readonly string[]): Row[] {
  const sheet = workbook.Sheets[name];
  if (!sheet || !sheet["!ref"]) throw new ConfigImportError(`Excel 文件缺少“${name}”工作表或表头`);
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.s.r !== 0 || range.s.c !== 0 || range.e.c >= headers.length || range.e.r > 100_000) {
    throw new ConfigImportError(`Excel 工作表“${name}”范围无效或超出支持上限`);
  }

  const columns = new Map<string, number>();
  for (let column = 0; column <= range.e.c; column += 1) {
    const header = readCellText(sheet, 0, column, name).trim();
    if (!header || columns.has(header)) throw new ConfigImportError(`Excel 工作表“${name}”的表头为空或重复`);
    columns.set(header, column);
  }
  if (columns.size !== headers.length || headers.some((header) => !columns.has(header))) {
    throw new ConfigImportError(`Excel 工作表“${name}”的表头不匹配，请勿删除或改名列`);
  }

  const rows: Row[] = [];
  for (let row = 1; row <= range.e.r; row += 1) {
    const values = headers.map((header) => readCellText(sheet, row, columns.get(header)!, name));
    if (values.every((value) => value === "")) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]])));
  }
  return rows;
}

function deviceMeta(type: string, uuid = createUuid()): DeviceTypeMeta {
  return { uuid, label: type, iconText: Array.from(type)[0] || "设", color: "blue" };
}

function parseRows(mainRows: Row[], historyRows: Row[]): ConfigData {
  const devicesByKey = new Map<string, DeviceRecord>();
  const typesByName = new Map<string, DeviceTypeMeta>();

  for (const [index, row] of mainRows.entries()) {
    const deviceType = row["设备类型"].trim();
    const deviceName = row["设备名称"].trim();
    const username = row["账号"].trim();
    const password = row["密码"];
    if (!deviceType) throw new ConfigImportError(`设备账号工作表第 ${index + 2} 行缺少设备类型`);
    if (!deviceName) throw new ConfigImportError(`设备账号工作表第 ${index + 2} 行缺少设备名称`);
    if (!typesByName.has(deviceType)) typesByName.set(deviceType, deviceMeta(deviceType));

    const key = relationKey(deviceType, deviceName);
    let device = devicesByKey.get(key);
    if (!device) {
      device = {
        deviceType,
        deviceName,
        assetCode: row["编号"],
        ipAddress: row["管理地址"],
        location: row["设备位置"],
        accounts: [],
        accountNames: new Set(),
      };
      devicesByKey.set(key, device);
    } else if (
      device.assetCode !== row["编号"] ||
      device.ipAddress !== row["管理地址"] ||
      device.location !== row["设备位置"]
    ) {
      throw new ConfigImportError(`设备“${deviceName}”在重复行中的编号、管理地址或设备位置不一致`);
    }

    if (!username) {
      if (password) throw new ConfigImportError(`设备“${deviceName}”的账号不能为空`);
      continue;
    }
    if (device.accountNames.has(username)) throw new ConfigImportError(`设备“${deviceName}”下存在重复账号“${username}”`);
    device.accountNames.add(username);
    const account = createBlankAccount();
    device.accounts.push({
      ...account,
      uuid: createUuid(),
      id: device.accounts.length + 1,
      title: username,
      username,
      password,
      tag: DEFAULT_ACCOUNT_TAG,
      updatedAt: "",
      passwordChangedAt: "",
      history: [],
    });
  }

  const accountByRelation = new Map<string, DeviceAccount>();
  devicesByKey.forEach((device) => {
    device.accounts.forEach((account) => accountByRelation.set(
      relationKey(device.deviceType, device.deviceName, account.username), account,
    ));
  });
  const historyContents = new Set<string>();
  for (const [index, row] of historyRows.entries()) {
    const type = row["设备类型"].trim();
    const deviceName = row["设备名称"].trim();
    const username = row["账号"].trim();
    if (!type || !deviceName || !username) {
      throw new ConfigImportError(`密码历史工作表第 ${index + 2} 行缺少设备类型、设备名称或账号`);
    }
    const account = accountByRelation.get(relationKey(type, deviceName, username));
    if (!account) throw new ConfigImportError(`密码历史“${deviceName} / ${username}”找不到对应账号`);
    const history: PasswordHistory = {
      uuid: createUuid(),
      id: account.history.length + 1,
      password: row["旧密码"],
      newPassword: row["新密码"],
      changedAt: row["修改时间"],
      reason: row["修改原因"],
    };
    const fingerprint = JSON.stringify([type, deviceName, username, history.password, history.newPassword, history.changedAt, history.reason]);
    if (historyContents.has(fingerprint)) throw new ConfigImportError(`密码历史工作表存在重复记录：“${deviceName} / ${username}”`);
    historyContents.add(fingerprint);
    account.history.push(history);
  }

  devicesByKey.forEach((device) => {
    device.accounts.forEach((account) => {
      const latest = account.history.at(-1);
      account.passwordChangedAt = latest?.changedAt ?? "";
    });
  });

  const customDeviceTypes = Array.from(typesByName.values());
  const typesByLabel = new Map(customDeviceTypes.map((type) => [type.label, type]));
  const items: VaultItem[] = Array.from(devicesByKey.values()).map((device, index) => {
    const type = typesByLabel.get(device.deviceType)!;
    const blank = createBlankItem();
    const item = {
      ...blank,
      uuid: createUuid(),
      id: index + 1,
      title: device.accounts[0]?.username ?? device.deviceName,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      deviceTypeUuid: type.uuid,
      assetCode: device.assetCode,
      location: device.location,
      ipAddress: device.ipAddress,
      iconText: type.iconText,
      iconClass: iconClassForColor(type.color),
      updatedAt: "",
      notes: "",
    };
    return syncItemWithAccounts(item, device.accounts);
  });
  return { items, customDeviceTypes, meta: createConfigMeta() };
}

export function parseXlsxConfigContent(data: ArrayBuffer | Uint8Array): ConfigData {
  try {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.byteLength === 0) throw new ConfigImportError("Excel 文件为空");
    if (bytes.byteLength > 50 * 1024 * 1024) throw new ConfigImportError("Excel 文件超过 50 MB，无法导入");
    const workbook = XLSX.read(bytes, { type: "array", cellDates: false, cellFormula: true, sheetRows: 100_002 });
    const expectedSheets = [MAIN_SHEET.name, HISTORY_SHEET.name];
    if (workbook.SheetNames.length !== expectedSheets.length || expectedSheets.some((name) => !workbook.Sheets[name])) {
      throw new ConfigImportError("Excel 文件必须包含“设备账号”和“密码历史”两张工作表，且不能有额外工作表");
    }
    const config = parseRows(
      readTable(workbook, MAIN_SHEET.name, MAIN_SHEET.headers),
      readTable(workbook, HISTORY_SHEET.name, HISTORY_SHEET.headers),
    );
    return parseConfigContent(JSON.stringify(createJsonConfigPayload(config)), "json");
  } catch (error) {
    if (error instanceof ConfigImportError) throw error;
    const message = error instanceof Error ? error.message : "文件内容无法识别";
    throw new ConfigImportError(`Excel 文件无法读取：${message}`);
  }
}
