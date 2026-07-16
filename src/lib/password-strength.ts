import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";

export type PasswordStrengthLabel = "较弱" | "一般" | "较强";

const passwordEstimator = new ZxcvbnFactory({
  dictionary: common.dictionary,
  graphs: common.adjacencyGraphs,
});

export function getPasswordStrengthLabel(password: string, userInputs: string[] = []): PasswordStrengthLabel {
  const score = passwordEstimator.check(password, userInputs.filter(Boolean)).score;
  if (score <= 1) return "较弱";
  if (score === 2) return "一般";
  return "较强";
}
