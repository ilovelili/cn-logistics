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
  const { error } = await supabase.from("company_users").insert({
    email: form.email.trim(),
    user_name: form.company_name.trim(),
    company_name: form.company_name.trim(),
    zipcode: form.zipcode.trim(),
    company_address: form.company_address.trim(),
    telephone: form.telephone.trim(),
    budget: Number(form.budget || 0),
    contact_person: form.contact_person.trim() || null,
    notes: form.notes.trim() || null,
    approval_status: "to_be_approved",
    created_by: createdBy,
  });

  if (error) {
    throw error;
  }
}

export async function fetchCompanyUsersByAdmin(createdBy: string) {
  const { data, error } = await supabase
    .from("company_users")
    .select("*")
    .eq("created_by", createdBy)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as CompanyUser[];
}

export async function updatePendingCompanyUser(
  id: string,
  form: CompanyUserForm,
) {
  const { data, error } = await supabase
    .from("company_users")
    .update({
      email: form.email.trim(),
      user_name: form.company_name.trim(),
      company_name: form.company_name.trim(),
      zipcode: form.zipcode.trim(),
      company_address: form.company_address.trim(),
      telephone: form.telephone.trim(),
      budget: Number(form.budget || 0),
      contact_person: form.contact_person.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("approval_status", "to_be_approved")
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as CompanyUser;
}
