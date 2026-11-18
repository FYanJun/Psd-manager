import { getContext } from "svelte";
import type { Writable } from "svelte/store";
import type { StatusViewState } from "./controllers/status-controller";

export const feedbackAlertKey = Symbol("feedback-alert");
export type FeedbackAlert = StatusViewState & {
  owner: string;
  dismiss(): void;
  runAction(): void;
};

export function getFeedbackAlert() {
  return getContext<Writable<FeedbackAlert | null> | undefined>(feedbackAlertKey);
}
