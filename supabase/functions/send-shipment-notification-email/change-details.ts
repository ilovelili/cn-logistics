export interface ShipmentChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** Creation is a registration notice, not a diff against an empty shipment. */
export function buildUpdateDetails(
  previousStatus: string,
  statusSummary: string,
  changes: ShipmentChange[] | undefined,
  language: "ja" | "en",
): string {
  if (previousStatus === "__created__") return statusSummary;
  const lines = formatShipmentChanges(changes, language);
  return [
    ...(previousStatus === "__updated__" && lines.length
      ? []
      : [statusSummary]),
    ...lines,
  ].join("\n");
}

const labels: Record<string, { ja: string; en: string }> = {
  booking_details: {
    ja: "BOOKING・コンテナ情報",
    en: "Bookings and containers",
  },
  cargo_details: { ja: "物量", en: "Volume" },
  invoice_number: { ja: "インボイス番号", en: "Invoice number" },
  job_number: { ja: "Job No.", en: "Job No." },
  trade_mode: { ja: "取引形態", en: "Trade mode" },
  trade_term: { ja: "取引条件", en: "Trade terms" },
  transport_mode: { ja: "輸送形態", en: "Transport mode" },
  consignee_name: { ja: "荷受人", en: "Consignee" },
  consignor_name: { ja: "荷送人", en: "Consignor" },
  pol_aol: { ja: "積地", en: "Origin" },
  pod_aod: { ja: "向け地／揚地", en: "Destination" },
  vessel_flight_numbers: { ja: "船名／便名", en: "Vessel / flight" },
  mbl_mawb: { ja: "MBL/MAWB", en: "MBL/MAWB" },
  hbl_hawb: { ja: "HBL/HAWB", en: "HBL/HAWB" },
  bl_awb_date: { ja: "B/L・AWB日付", en: "B/L / AWB date" },
  progress_percent: { ja: "進捗率", en: "Progress" },
  progress_step: { ja: "進捗ステップ", en: "Progress step" },
  progress_total_steps: { ja: "総ステップ数", en: "Total steps" },
  tracking_history: { ja: "ステータス履歴", en: "Status history" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function display(value: unknown, field: string, language: "ja" | "en"): string {
  const empty = language === "ja" ? "未登録" : "Not set";
  if (value === null || value === undefined || value === "") return empty;
  if (Array.isArray(value)) {
    if (value.length === 0) return empty;
    if (field === "booking_details") {
      return value
        .filter(isRecord)
        .map((booking) => {
          const containers = Array.isArray(booking.containers)
            ? booking.containers
                .filter(isRecord)
                .map(
                  (container) =>
                    `${`${container.length ?? ""}' ${container.type ?? ""}`.trim()} × ${container.quantity ?? ""}`,
                )
                .join(", ")
            : "";
          return `BOOKING # ${booking.booking_number ?? ""}${
            containers ? ` (${containers})` : ""
          }`;
        })
        .join("; ");
    }
    if (field === "tracking_history") {
      return value
        .filter(isRecord)
        .map((event) =>
          [event.date, event.location, event.description]
            .filter((part) => typeof part === "string" && part.trim())
            .join(" / "),
        )
        .join("; ");
    }
    return value.filter((part) => typeof part === "string").join(", ") || empty;
  }
  if (field === "cargo_details" && isRecord(value)) {
    return (
      [
        value.package_count == null ? null : `${value.package_count} PKG`,
        value.gross_weight_kg == null ? null : `${value.gross_weight_kg} Kgs`,
        value.volume_m3 == null ? null : `${value.volume_m3} M³`,
      ]
        .filter(Boolean)
        .join(" / ") || empty
    );
  }
  if (typeof value !== "string" && typeof value !== "number") return empty;
  return field === "progress_percent" ? `${value}%` : String(value);
}

/** Only server-snapshotted, explicitly customer-facing fields are rendered. */
export function formatShipmentChanges(
  changes: ShipmentChange[] | undefined,
  language: "ja" | "en",
): string[] {
  return (changes ?? [])
    .filter((change) => labels[change.field])
    .map(
      (change) =>
        `${labels[change.field][language]}: ${display(
          change.before,
          change.field,
          language,
        )} → ${display(change.after, change.field, language)}`,
    );
}
