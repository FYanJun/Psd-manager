export type StatusTone = "success" | "info" | "warning" | "error";
export type StatusOperation = "copy" | "paste" | "save" | "create" | "delete" | "password" | "import" | "export" | "restore" | "settings" | "security" | "general";
export type StatusPresentation = {
  tone: StatusTone;
  operation: StatusOperation;
};
export type StatusReporter = (
  message: string,
  duration?: number,
  actionLabel?: string,
  action?: (() => void) | null,
  presentation?: StatusPresentation,
) => void;

const shortResults: Record<StatusOperation, string> = {
  copy: "内容已复制", paste: "内容已粘贴", save: "保存完成", create: "新增完成", delete: "删除完成",
  password: "账号密码已更新", import: "配置导入完成", export: "配置已导出", restore: "恢复完成",
  settings: "设置已更新", security: "安全设置已更新", general: "操作完成",
};

export function shortStatusResult(message: string, presentation: StatusPresentation): string {
  if (Array.from(message).length <= 20 && !/[\r\n]/.test(message)) return message;
  return presentation.tone === "success" ? shortResults[presentation.operation] : "操作状态已更新";
}
