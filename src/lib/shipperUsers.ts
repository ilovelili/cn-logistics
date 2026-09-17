import { supabase } from "./supabase";
import { deleteAuth0User, provisionAuth0Users } from "./auth0Provisioning";
import type { Auth0ProvisioningStatus } from "./auth0Provisioning";

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
  "to_be_approved" | "approved" | "rejected";

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
  auth0_provisioning_status: Auth0ProvisioningStatus;
}

export interface ShipperUserAdminAssignment {
  admin_user_id: string;
  email: string;
  user_name: string | null;
  staff_role: "sales" | "customer_service" | "operations" | "other";
  staff_roles?: ("sales" | "customer_service" | "operations" | "other")[];
  created_at: string;
  updated_at: string;
}

export interface ShipperAdminAssignmentOption {
  shipper_name: string;
  email: string;
  contact_person: string | null;
  admin_assignments: ShipperUserAdminAssignment[];
}

export interface ShipperChangeRequestSnapshot {
  shipper_name: string;
  zipcode: string;
  shipper_address: string;
  telephone: string;
  budget: number;
  notes: string;
  contacts: ShipperUserContact[];
  admin_user_ids: string[];
}

export interface ShipperChangeRequest {
  id: string;
  target_user_id: string;
  shipper_name: string;
  status: "pending" | "approved" | "rejected";
  requested_by_email: string;
  current_snapshot: ShipperChangeRequestSnapshot;
  proposed_snapshot: ShipperChangeRequestSnapshot;
  created_at: string;
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
  const contacts = form.contacts
    .map((contact) => ({
      email: contact.email.trim(),
      contact_person: contact.contact_person.trim(),
    }))
    .filter((contact) => contact.email && contact.contact_person);

  const { error } = await supabase.rpc("create_registered_normal_user", {
    user_shipper_name: form.shipper_name.trim(),
    user_zipcode: form.zipcode.trim(),
    user_shipper_address: form.shipper_address.trim(),
    user_telephone: form.telephone.trim(),
    user_budget: Number(form.budget || 0),
    user_contacts: contacts,
    user_notes: form.notes.trim(),
    admin_email: createdBy,
  });

  if (error) {
    throw error;
  }

  try {
    await provisionAuth0Users(
      contacts.map((contact) => ({ email: contact.email, role: "normal" })),
    );
    return { auth0Provisioned: true };
  } catch {
    return { auth0Provisioned: false };
  }
}

export async function retryShipperUserAuth0Provisioning(email: string) {
  await provisionAuth0Users([{ email, role: "normal" }]);
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

export async function fetchShipperUsersForAssignmentChange(
  requesterEmail: string,
  shipperName: string,
) {
  const { data, error } = await supabase.rpc(
    "list_shipper_users_for_assignment_change",
    { requester_email: requesterEmail, target_shipper_name: shipperName },
  );
  if (error) throw error;
  return (data ?? []) as ShipperUser[];
}

export async function fetchApprovedShippersForShipments(
  requesterEmail: string,
) {
  const { data, error } = await supabase.rpc(
    "list_approved_shippers_for_shipments",
    { requester_email: requesterEmail },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as Pick<
    ShipperUser,
    "shipper_name" | "email" | "contact_person" | "admin_assignments"
  >[];
}

export async function fetchAccessibleShipperAdminAssignments(
  requesterEmail: string,
) {
  const { data, error } = await supabase.rpc(
    "list_accessible_shipper_admin_assignments",
    { requester_email: requesterEmail },
  );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as Pick<
      ShipperAdminAssignmentOption,
      "shipper_name" | "admin_assignments"
    >[]
  ).map((option) => ({
    ...option,
    email: "",
    contact_person: null,
    admin_assignments: option.admin_assignments ?? [],
  }));
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

  const updatedUsers = (data ?? []) as ShipperUser[];
  try {
    await provisionAuth0Users(
      updatedUsers.map((user) => ({ email: user.email, role: "normal" })),
    );
    return {
      users: updatedUsers.map((user) => ({
        ...user,
        auth0_provisioning_status: "provisioned" as const,
      })),
      auth0Provisioned: true,
    };
  } catch {
    return { users: updatedUsers, auth0Provisioned: false };
  }
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

export async function deleteShipperUser({ userId }: { userId: string }) {
  await deleteAuth0User(userId);
}

export async function updateShipperUserAdminAssignments({
  requesterEmail,
  userId,
  adminUserIds,
}: {
  requesterEmail: string;
  userId: string;
  adminUserIds: string[];
}) {
  const { data, error } = await supabase.rpc(
    "update_accessible_normal_user_admin_assignments",
    {
      requester_email: requesterEmail,
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

export async function fetchAccessibleShipperChangeRequests() {
  const { data, error } = await supabase.rpc(
    "list_accessible_shipper_change_requests",
  );

  if (error) throw error;
  return (data ?? []) as ShipperChangeRequest[];
}

export async function submitShipperChangeRequest({
  userId,
  requesterEmail,
  form,
  adminUserIds,
}: {
  userId: string;
  requesterEmail: string;
  form: ShipperUserForm;
  adminUserIds: string[];
}) {
  const { data, error } = await supabase.rpc("submit_shipper_change_request", {
    target_user_id: userId,
    proposed_shipper_name: form.shipper_name.trim(),
    proposed_zipcode: form.zipcode.trim(),
    proposed_shipper_address: form.shipper_address.trim(),
    proposed_telephone: form.telephone.trim(),
    proposed_budget: Number(form.budget || 0),
    proposed_contacts: form.contacts
      .map((contact) => ({
        id: contact.id,
        email: contact.email.trim(),
        contact_person: contact.contact_person.trim(),
      }))
      .filter((contact) => contact.email && contact.contact_person),
    proposed_notes: form.notes.trim(),
    proposed_admin_user_ids: adminUserIds,
    requester_email: requesterEmail,
  });

  if (error) throw error;
  return data as string;
}

export async function reviewShipperChangeRequest({
  requestId,
  status,
}: {
  requestId: string;
  status: "approved" | "rejected";
}) {
  const { data, error } = await supabase.rpc("review_shipper_change_request", {
    request_id: requestId,
    next_status: status,
  });

  if (error) throw error;

  const updatedUsers = (data ?? []) as ShipperUser[];
  if (status === "approved" && updatedUsers.length > 0) {
    try {
      await provisionAuth0Users(
        updatedUsers.map((user) => ({ email: user.email, role: "normal" })),
      );
    } catch {
      return { users: updatedUsers, auth0Provisioned: false };
    }
  }

  return { users: updatedUsers, auth0Provisioned: true };
}
