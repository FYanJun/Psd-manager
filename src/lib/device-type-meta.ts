import type { DeviceTypeMeta, VaultItem } from "./types";
import { normalizeVaultIdentityData } from "./config/normalization";

export function ensureDeviceTypeMetadata(items: VaultItem[], customDeviceTypes: DeviceTypeMeta[]) {
  return normalizeVaultIdentityData(items, customDeviceTypes);
}
