import { supabase } from "./supabase";

export interface ShipperUserForm {
  email: string;
  shipper_name: string;
  zipcode: string;
  shipper_address: string;
  telephone: string;
  budget: string;
  contact_person: string;
  contacts: ShipperUserContact[];
  notes: string;
}

export interface ShipperUserContact {
  id?: string;
  email: string;
  contact_person: string;
}

export type ShipperUserApprovalStatus =
  | "to_be_approved"
  | "approved"
  | "rejected";

export interface ShipperUser {
  id: string;
  email: string;
  shipper_name: string;
  zipcode: string | null;
  shipper_address: string;
  telephone: string;
  budget: number;
  contact_person: string | null;
  notes: string | null;
  approval_status: ShipperUserApprovalStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  admin_assignments?: ShipperUserAdminAssignment[];
}

export interface ShipperUserAdminAssignment {
  admin_user_id: string;
  email: string;
  user_name: string | null;
  staff_role: "sales" | "customer_service" | "operations" | "other";
  created_at: string;
  updated_at: string;
}

export const defaultShipperUserForm: ShipperUserForm = {
  email: "",
  shipper_name: "",
  zipcode: "",
  shipper_address: "",
  telephone: "",
  budget: "",
  contact_person: "",
  contacts: [{ email: "", contact_person: "" }],
  notes: "",
};

export async function createShipperUser(
  form: ShipperUserForm,
  createdBy: string,
) {
  const { error } = await supabase.rpc("create_registered_normal_user", {
    user_shipper_name: form.shipper_name.trim(),
    user_zipcode: form.zipcode.trim(),
    user_shipper_address: form.shipper_address.trim(),
    user_telephone: form.telephone.trim(),
    user_budget: Number(form.budget || 0),
    user_contacts: form.contacts
      .map((contact) => ({
        email: contact.email.trim(),
        contact_person: contact.contact_person.trim(),
      }))
      .filter((contact) => contact.email && contact.contact_person),
    user_notes: form.notes.trim(),
    admin_email: createdBy,
  });

  if (error) {
    throw error;
  }
}

export async function fetchShipperUsersByAdmin(createdBy: string) {
  const { data, error } = await supabase.rpc("list_registered_normal_users", {
    admin_email: createdBy,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipperUser[];
}

export async function updateShipperUser(id: string, form: ShipperUserForm) {
  const { data, error } = await supabase.rpc("update_registered_normal_user", {
    user_id: id,
    user_email: form.email.trim(),
    user_shipper_name: form.shipper_name.trim(),
    user_zipcode: form.zipcode.trim(),
    user_shipper_address: form.shipper_address.trim(),
    user_telephone: form.telephone.trim(),
    user_budget: Number(form.budget || 0),
    user_contact_person: form.contact_person.trim(),
    user_notes: form.notes.trim(),
  });

  if (error) {
    throw error;
  }

  const [updatedUser] = (data ?? []) as ShipperUser[];
  return updatedUser;
}

export async function updateShipperContacts(id: string, form: ShipperUserForm) {
  const { data, error } = await supabase.rpc(
    "update_registered_shipper_contacts",
    {
      target_user_id: id,
      user_shipper_name: form.shipper_name.trim(),
      user_zipcode: form.zipcode.trim(),
      user_shipper_address: form.shipper_address.trim(),
      user_telephone: form.telephone.trim(),
      user_budget: Number(form.budget || 0),
      user_contacts: form.contacts
        .map((contact) => ({
          id: contact.id,
          email: contact.email.trim(),
          contact_person: contact.contact_person.trim(),
        }))
        .filter((contact) => contact.email && contact.contact_person),
      user_notes: form.notes.trim(),
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as ShipperUser[];
}

export async function updateShipperUserApprovalStatus({
  superAdminEmail,
  userId,
  status,
}: {
  superAdminEmail: string;
  userId: string;
  status: Extract<ShipperUserApprovalStatus, "approved" | "rejected">;
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

  const [updatedUser] = (data ?? []) as ShipperUser[];
  if (!updatedUser) {
    throw new Error("User approval status was not updated.");
  }

  return updatedUser;
}

export async function deleteShipperUser({
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

export async function updateShipperUserAdminAssignments({
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

  const [updatedUser] = (data ?? []) as ShipperUser[];
  if (!updatedUser) {
    throw new Error("User admin assignments were not updated.");
  }

  return updatedUser;
}
