import { t } from "../lib/i18n";

export interface ShipperUserDetailData {
  id: string;
  email: string;
  shipper_name: string;
  zipcode: string | null;
  shipper_address: string | null;
  telephone: string | null;
  budget: number | null;
  contact_person: string | null;
  notes: string | null;
  created_at: string;
}

export default function ShipperUserReadOnlyDetails({
  shipperUser,
}: {
  shipperUser: ShipperUserDetailData;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ShipperDetailItem label="ID" value={shipperUser.id} mono />
      <ShipperDetailItem
        label={t("admin.userRegistration.email")}
        value={shipperUser.email}
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.shipperName")}
        value={shipperUser.shipper_name}
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.budget")}
        value={
          shipperUser.budget === null || shipperUser.budget === undefined
            ? t("common.unset")
            : `${Number(shipperUser.budget).toLocaleString()} ${t("admin.userRegistration.budgetUnit")}`
        }
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.zipcode")}
        value={shipperUser.zipcode || t("common.unset")}
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.telephone")}
        value={shipperUser.telephone || t("common.unset")}
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.contactPerson")}
        value={shipperUser.contact_person || t("common.unset")}
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.createdAt")}
        value={new Date(shipperUser.created_at).toLocaleString("ja-JP")}
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.shipperAddress")}
        value={shipperUser.shipper_address || t("common.unset")}
        wide
      />
      <ShipperDetailItem
        label={t("admin.userRegistration.notes")}
        value={shipperUser.notes || t("common.unset")}
        wide
      />
    </div>
  );
}

function ShipperDetailItem({
  label,
  value,
  wide = false,
  mono = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-gray-50 p-4 dark:bg-gray-950 ${wide ? "md:col-span-2" : ""}`}
    >
      <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div
        className={`mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
