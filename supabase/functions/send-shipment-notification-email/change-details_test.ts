import { buildUpdateDetails, formatShipmentChanges } from "./change-details.ts";

Deno.test("creation stays concise with populated snapshots in both languages", () => {
  for (const language of ["ja", "en"] as const) {
    const summary = language === "ja"
      ? "新規案件登録（現在のステータス：BOOKING）"
      : "New shipment registered (current status: BOOKING)";
    for (
      const changes of [undefined, [], [{
        field: "invoice_number",
        before: null,
        after: "INV-1",
      }]]
    ) {
      if (
        buildUpdateDetails("__created__", summary, changes, language) !==
          summary
      ) {
        throw new Error("Creation notice contains field changes");
      }
    }
  }
});

Deno.test("updates retain changes and status transitions retain their summary", () => {
  const changes = [{ field: "invoice_number", before: "OLD", after: "NEW" }];
  for (const language of ["ja", "en"] as const) {
    const expected = formatShipmentChanges(changes, language).join("\n");
    if (
      buildUpdateDetails("__updated__", "Generic update", changes, language) !==
        expected
    ) {
      throw new Error("Update details changed");
    }
    for (const status of ["__status_set__", "BOOKING"]) {
      if (
        buildUpdateDetails(status, "Status summary", changes, language) !==
          "Status summary\n" + expected
      ) {
        throw new Error("Status summary missing");
      }
    }
    if (
      buildUpdateDetails("__updated__", "Fallback", undefined, language) !==
        "Fallback"
    ) {
      throw new Error("Fallback missing");
    }
  }
});

function assertContains(actual: string, expected: string) {
  if (!actual.includes(expected)) {
    throw new Error(`Missing: ${expected} in ${actual}`);
  }
}

Deno.test("booking addition includes booking numbers and container quantities", () => {
  const lines = formatShipmentChanges([{
    field: "booking_details",
    before: [],
    after: [
      { booking_number: "B-1", containers: [{ size: "40HC", quantity: 2 }] },
      { booking_number: "B-2", containers: [{ size: "20GP", quantity: 1 }] },
    ],
  }], "ja").join("\n");
  assertContains(lines, "未登録 →");
  assertContains(lines, "BOOKING # B-1 (40HC × 2)");
  assertContains(lines, "BOOKING # B-2 (20GP × 1)");
});

Deno.test("booking edit and removal preserve before and after values", () => {
  const booking = [{
    booking_number: "B-1",
    containers: [{ size: "40HC", quantity: 2 }],
  }];
  const removed = formatShipmentChanges([{
    field: "booking_details",
    before: booking,
    after: [],
  }], "en").join("\n");
  assertContains(removed, "B-1 (40HC × 2) → Not set");
  const edited = formatShipmentChanges([{
    field: "booking_details",
    before: booking,
    after: [{
      booking_number: "B-1",
      containers: [{ size: "40HC", quantity: 3 }],
    }],
  }], "ja").join("\n");
  assertContains(edited, "× 2)");
  assertContains(edited, "× 3)");
});

Deno.test("zero progress is a value, and internal fields are never included", () => {
  const lines = formatShipmentChanges([
    { field: "progress_percent", before: null, after: 0 },
    { field: "notes", before: null, after: "Internal only" },
    { field: "internal_documents", before: [], after: ["Private.pdf"] },
  ], "en");
  if (lines.length !== 1) throw new Error("Private fields leaked");
  assertContains(lines[0], "Not set → 0%");
});

Deno.test("old notifications without snapshots retain the existing fallback", () => {
  if (formatShipmentChanges(undefined, "ja").length !== 0) {
    throw new Error("Unexpected change details");
  }
});
