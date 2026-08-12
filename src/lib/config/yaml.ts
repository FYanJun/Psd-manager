import type { ConfigData } from "../types";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  createJsonConfigPayload,
  isStructuredConfigPayload,
  parseStructuredConfigPayload,
} from "./structured";
import { ConfigImportError, stripUtf8Bom } from "./shared";

export function createYamlConfigPayload(config: ConfigData) {
  const payload = stringifyYaml(createJsonConfigPayload(config), {
    aliasDuplicateObjects: false,
    indent: 2,
    lineWidth: 0,
    simpleKeys: true,
  });
  return `# 密码管理器 YAML 配置文件\n# 包含明文账号、密码和密码历史，请只保存到可信位置。\n${payload}`;
}

export function parseYamlConfigContent(content: string): ConfigData {
  let parsed: unknown;
  try {
    parsed = parseYaml(stripUtf8Bom(content), {
      customTags: [],
      maxAliasCount: 0,
      merge: false,
      resolveKnownTags: false,
      schema: "core",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error ?? "无法解析");
    throw new ConfigImportError(`YAML 配置语法错误：${reason}`);
  }
  if (isStructuredConfigPayload(parsed)) return parseStructuredConfigPayload(parsed);
  throw new ConfigImportError("YAML 配置结构错误：只支持以“设备类型”为顶层且不包含“元信息”的当前格式");
}
