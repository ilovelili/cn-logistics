import { supabase } from "./supabase";

export interface AdminOperator {
  id: string;
  email: string;
  user_name: string | null;
  is_active: boolean;
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
