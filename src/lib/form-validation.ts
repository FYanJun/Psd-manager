export type FormValidationScope = "account" | "device" | "type";

export type FormValidationFeedback = {
  form: FormValidationScope;
  field: string;
  message: string;
  revision: number;
};

export type ReportFormValidationError = (
  form: FormValidationScope,
  field: string,
  message: string,
) => void;
