import { t } from "../lib/i18n";

export interface CompanyUserDetailData {
  id: string;
  email: string;
  company_name: string;
  zipcode: string | null;
  company_address: string | null;
  telephone: string | null;
  budget: number | null;
  contact_person: string | null;
  notes: string | null;
  created_at: string;
}

export default function CompanyUserReadOnlyDetails({
  companyUser,
}: {
  companyUser: CompanyUserDetailData;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CompanyDetailItem label="ID" value={companyUser.id} mono />
      <CompanyDetailItem
        label={t("admin.userRegistration.email")}
        value={companyUser.email}
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.companyName")}
        value={companyUser.company_name}
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.budget")}
        value={
          companyUser.budget === null || companyUser.budget === undefined
            ? t("common.unset")
            : `${Number(companyUser.budget).toLocaleString()} ${t("admin.userRegistration.budgetUnit")}`
        }
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.zipcode")}
        value={companyUser.zipcode || t("common.unset")}
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.telephone")}
        value={companyUser.telephone || t("common.unset")}
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.contactPerson")}
        value={companyUser.contact_person || t("common.unset")}
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.createdAt")}
        value={new Date(companyUser.created_at).toLocaleString("ja-JP")}
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.companyAddress")}
        value={companyUser.company_address || t("common.unset")}
        wide
      />
      <CompanyDetailItem
        label={t("admin.userRegistration.notes")}
        value={companyUser.notes || t("common.unset")}
        wide
      />
    </div>
  );
}

function CompanyDetailItem({
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
