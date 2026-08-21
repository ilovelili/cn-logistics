import { supabase } from "./supabase";
import type { ShipperUserAdminAssignment } from "./shipperUsers";
import type { TranslationKey } from "./i18n";
import { deleteAuth0User, provisionAuth0Users } from "./auth0Provisioning";
import type { Auth0ProvisioningStatus } from "./auth0Provisioning";

export interface AdminOperator {
  id: string;
  email: string;
  user_name: string | null;
  staff_role: AdminOperatorStaffRole;
  staff_roles: AdminOperatorStaffRole[];
  assigned_shipper_users?: AssignedShipperUser[];
  created_at: string;
  updated_at: string;
  auth0_provisioning_status: Auth0ProvisioningStatus;
}

export type AdminOperatorStaffRole =
  "sales" | "customer_service" | "operations" | "other";

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
  auth0_provisioning_status: Auth0ProvisioningStatus;
  admin_assignments?: ShipperUserAdminAssignment[];
  created_at: string;
  updated_at: string;
}

export interface AdminOperatorForm {
  email: string;
  user_name: string;
  staff_roles: AdminOperatorStaffRole[];
}

export const defaultAdminOperatorForm: AdminOperatorForm = {
  email: "",
  user_name: "",
  staff_roles: ["sales"],
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
    operator_staff_roles: form.staff_roles,
    operator_password: "",
    super_admin_email: superAdminEmail,
  });

  if (error) {
    throw error;
  }

  try {
    await provisionAuth0Users([{ email: form.email, role: "admin" }]);
    return { auth0Provisioned: true };
  } catch {
    return { auth0Provisioned: false };
  }
}

export async function retryAdminOperatorAuth0Provisioning(email: string) {
  await provisionAuth0Users([{ email, role: "admin" }]);
}

export async function updateAdminOperator({
  superAdminEmail,
  operatorId,
  operatorName,
  staffRoles,
}: {
  superAdminEmail: string;
  operatorId: string;
  operatorName: string;
  staffRoles: AdminOperatorStaffRole[];
}) {
  const { error } = await supabase.rpc("update_admin_operator", {
    super_admin_email: superAdminEmail,
    target_operator_id: operatorId,
    operator_name: operatorName.trim(),
    operator_staff_roles: staffRoles,
  });

  if (error) {
    throw error;
  }
}

export async function deleteAdminOperator({
  operatorId,
}: {
  operatorId: string;
}) {
  await deleteAuth0User(operatorId);
}
