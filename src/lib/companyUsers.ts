import { supabase } from "./supabase";

export interface CompanyUserForm {
  email: string;
  company_name: string;
  zipcode: string;
  company_address: string;
  telephone: string;
  budget: string;
  contact_person: string;
  notes: string;
}

export type CompanyUserApprovalStatus =
  | "to_be_approved"
  | "approved"
  | "rejected";

export interface CompanyUser {
  id: string;
  email: string;
  company_name: string;
  zipcode: string | null;
  company_address: string;
  telephone: string;
  budget: number;
  contact_person: string | null;
  notes: string | null;
  approval_status: CompanyUserApprovalStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  admin_assignments?: CompanyUserAdminAssignment[];
}

export interface CompanyUserAdminAssignment {
  admin_user_id: string;
  email: string;
  user_name: string | null;
  created_at: string;
  updated_at: string;
}

export const defaultCompanyUserForm: CompanyUserForm = {
  email: "",
  company_name: "",
  zipcode: "",
  company_address: "",
  telephone: "",
  budget: "",
  contact_person: "",
  notes: "",
};

export async function createCompanyUser(
  form: CompanyUserForm,
  createdBy: string,
) {
  const { error } = await supabase.rpc("create_registered_normal_user", {
    user_email: form.email.trim(),
    user_company_name: form.company_name.trim(),
    user_zipcode: form.zipcode.trim(),
    user_company_address: form.company_address.trim(),
    user_telephone: form.telephone.trim(),
    user_budget: Number(form.budget || 0),
    user_contact_person: form.contact_person.trim(),
    user_notes: form.notes.trim(),
    admin_email: createdBy,
  });

  if (error) {
    throw error;
  }
}

export async function fetchCompanyUsersByAdmin(createdBy: string) {
  const { data, error } = await supabase.rpc("list_registered_normal_users", {
    admin_email: createdBy,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as CompanyUser[];
}

export async function updatePendingCompanyUser(
  id: string,
  form: CompanyUserForm,
) {
  const { data, error } = await supabase.rpc(
    "update_pending_registered_normal_user",
    {
      user_id: id,
      user_email: form.email.trim(),
      user_company_name: form.company_name.trim(),
      user_zipcode: form.zipcode.trim(),
      user_company_address: form.company_address.trim(),
      user_telephone: form.telephone.trim(),
      user_budget: Number(form.budget || 0),
      user_contact_person: form.contact_person.trim(),
      user_notes: form.notes.trim(),
    },
  );

  if (error) {
    throw error;
  }

  const [updatedUser] = (data ?? []) as CompanyUser[];
  return updatedUser;
}

export async function updateCompanyUserApprovalStatus({
  superAdminEmail,
  userId,
  status,
}: {
  superAdminEmail: string;
  userId: string;
  status: Extract<CompanyUserApprovalStatus, "approved" | "rejected">;
}) {
  const { data, error } = await supabase.rpc(
    "update_normal_user_approval_status",
    {
      super_admin_email: superAdminEmail,
      target_user_id: userId,
      next_approval_status: status,
    },
  );

  if (error) {
    throw error;
  }

  const [updatedUser] = (data ?? []) as CompanyUser[];
  if (!updatedUser) {
    throw new Error("User approval status was not updated.");
  }

  return updatedUser;
}

export async function deleteCompanyUser({
  superAdminEmail,
  userId,
}: {
  superAdminEmail: string;
  userId: string;
}) {
  const { error } = await supabase.rpc("delete_normal_user", {
    super_admin_email: superAdminEmail,
    target_user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export async function updateCompanyUserAdminAssignments({
  superAdminEmail,
  userId,
  adminUserIds,
}: {
  superAdminEmail: string;
  userId: string;
  adminUserIds: string[];
}) {
  const { data, error } = await supabase.rpc(
    "update_normal_user_admin_assignments",
    {
      super_admin_email: superAdminEmail,
      target_user_id: userId,
      admin_user_ids: adminUserIds,
    },
  );

  if (error) {
    throw error;
  }

  const [updatedUser] = (data ?? []) as CompanyUser[];
  if (!updatedUser) {
    throw new Error("User admin assignments were not updated.");
  }

  return updatedUser;
}
