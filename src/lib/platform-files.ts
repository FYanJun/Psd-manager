import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile as readBinary, readTextFile as read, writeFile as writeBinary, writeTextFile as write } from "@tauri-apps/plugin-fs";
import { platformOperation } from "./platform-operation";

export function openFileDialog(options: Parameters<typeof open>[0]) {
  return platformOperation("system", () => open(options));
}
export function saveFileDialog(options: Parameters<typeof save>[0]) {
  return platformOperation("system", () => save(options));
}
export function readTextFile(path: string) {
  return platformOperation("storage", () => read(path));
}
export function writeTextFile(path: string, content: string) {
  return platformOperation("storage", () => write(path, content));
}
export function readBinaryFile(path: string) {
  return platformOperation("storage", () => readBinary(path));
}
export function writeBinaryFile(path: string, content: Uint8Array) {
  return platformOperation("storage", () => writeBinary(path, content));
}
