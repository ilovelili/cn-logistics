import { supabase } from "./supabase";
import type { ShipperUserAdminAssignment } from "./shipperUsers";
import type { TranslationKey } from "./i18n";

export interface AdminOperator {
  id: string;
  email: string;
  user_name: string | null;
  staff_role: AdminOperatorStaffRole;
  assigned_shipper_users?: AssignedShipperUser[];
  created_at: string;
  updated_at: string;
}

export type AdminOperatorStaffRole =
  | "sales"
  | "customer_service"
  | "operations"
  | "other";

export const adminOperatorStaffRoleOptions: {
  value: AdminOperatorStaffRole;
  labelKey: TranslationKey;
}[] = [
  { value: "sales", labelKey: "superAdmin.operators.staffRole.sales" },
  {
    value: "operations",
    labelKey: "superAdmin.operators.staffRole.operations",
  },
];

export interface AssignedShipperUser {
  id: string;
  email: string;
  shipper_name: string;
  zipcode: string | null;
  shipper_address: string | null;
  telephone: string | null;
  budget: number | null;
  contact_person: string | null;
  notes: string | null;
  approval_status: string;
  admin_assignments?: ShipperUserAdminAssignment[];
  created_at: string;
  updated_at: string;
}

export interface AdminOperatorForm {
  email: string;
  user_name: string;
  staff_role: AdminOperatorStaffRole;
  password: string;
}

export const defaultAdminOperatorForm: AdminOperatorForm = {
  email: "",
  user_name: "",
  staff_role: "sales",
  password: "12345",
};

export async function fetchAdminOperators(superAdminEmail: string) {
  const { data, error } = await supabase.rpc("list_admin_operators", {
    super_admin_email: superAdminEmail,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as AdminOperator[];
}

export async function createAdminOperator(
  form: AdminOperatorForm,
  superAdminEmail: string,
) {
  const { error } = await supabase.rpc("create_admin_operator", {
    operator_email: form.email.trim(),
    operator_name: form.user_name.trim(),
    operator_staff_role: form.staff_role,
    operator_password: form.password,
    super_admin_email: superAdminEmail,
  });

  if (error) {
    throw error;
  }
}

export async function updateAdminOperator({
  superAdminEmail,
  operatorId,
  operatorName,
  staffRole,
}: {
  superAdminEmail: string;
  operatorId: string;
  operatorName: string;
  staffRole: AdminOperatorStaffRole;
}) {
  const { error } = await supabase.rpc("update_admin_operator", {
    super_admin_email: superAdminEmail,
    target_operator_id: operatorId,
    operator_name: operatorName.trim(),
    operator_staff_role: staffRole,
  });

  if (error) {
    throw error;
  }
}

export async function deleteAdminOperator({
  superAdminEmail,
  operatorId,
}: {
  superAdminEmail: string;
  operatorId: string;
}) {
  const { error } = await supabase.rpc("delete_admin_operator", {
    super_admin_email: superAdminEmail,
    target_operator_id: operatorId,
  });

  if (error) {
    throw error;
  }
}
