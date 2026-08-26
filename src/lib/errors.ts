import { t } from "./i18n";

export function getErrorDetails(error: unknown) {
  if (typeof error === "string") {
    return error.trim();
  }

  if (!error || typeof error !== "object") {
    return "";
  }

  const errorRecord = error as Record<string, unknown>;
  const details = [
    errorRecord.message,
    errorRecord.details,
    errorRecord.hint,
    typeof errorRecord.code === "string"
      ? `code: ${errorRecord.code}`
      : undefined,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index);

  return details.join(" / ");
}

export function appendErrorDetails(
  summary: string,
  error: unknown,
  options: { includeTechnicalDetails?: boolean } = {},
) {
  if (!options.includeTechnicalDetails) {
    return summary;
  }

  const details = getErrorDetails(error);
  return details
    ? `${summary}\n${t("common.errorDetails", { details })}`
    : summary;
}
