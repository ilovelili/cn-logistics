import { supabase } from "./supabase";
import type { CompanyUserAdminAssignment } from "./companyUsers";

export interface AdminOperator {
  id: string;
  email: string;
  user_name: string | null;
  assigned_company_users?: AssignedCompanyUser[];
  created_at: string;
  updated_at: string;
}

export interface AssignedCompanyUser {
  id: string;
  email: string;
  company_name: string;
  zipcode: string | null;
  company_address: string | null;
  telephone: string | null;
  budget: number | null;
  contact_person: string | null;
  notes: string | null;
  approval_status: string;
  admin_assignments?: CompanyUserAdminAssignment[];
  created_at: string;
  updated_at: string;
}

export interface AdminOperatorForm {
  email: string;
  user_name: string;
  password: string;
}

export const defaultAdminOperatorForm: AdminOperatorForm = {
  email: "",
  user_name: "",
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
    operator_password: form.password,
    super_admin_email: superAdminEmail,
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
