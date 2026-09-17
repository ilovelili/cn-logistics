import { useEffect, useState } from "react";
import {
  fetchAssignableAdminOperators,
  type AdminOperator,
} from "../lib/adminOperators";
import {
  fetchAccessibleShipperChangeRequests,
  fetchShipperUsersForAssignmentChange,
  type ShipperChangeRequest,
  type ShipperUser,
} from "../lib/shipperUsers";
import { t } from "../lib/i18n";
import { UserDetailModal } from "./UserRegistrationForm";

interface ShipperAssignmentChangeRequestModalProps {
  adminEmail: string;
  shipperName: string;
  onClose: () => void;
  onRequested: () => void;
}

export default function ShipperAssignmentChangeRequestModal({
  adminEmail,
  shipperName,
  onClose,
  onRequested,
}: ShipperAssignmentChangeRequestModalProps) {
  const [users, setUsers] = useState<ShipperUser[]>([]);
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [requests, setRequests] = useState<ShipperChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchShipperUsersForAssignmentChange(adminEmail, shipperName),
      fetchAssignableAdminOperators(adminEmail),
      fetchAccessibleShipperChangeRequests(),
    ])
      .then(([loadedUsers, loadedOperators, loadedRequests]) => {
        if (!active) return;
        setUsers(
          loadedUsers.filter(
            (user) =>
              user.shipper_name.trim().toLowerCase() ===
              shipperName.trim().toLowerCase(),
          ),
        );
        setOperators(loadedOperators);
        setRequests(loadedRequests);
      })
      .catch(() => {
        if (active) setError(t("admin.userRegistration.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [adminEmail, shipperName]);

  const user = users[0];
  const changeRequest = requests.find((request) =>
    users.some((candidate) => candidate.id === request.target_user_id),
  );

  if (loading || error || !user) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-gray-900">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {loading ? t("common.loading") : error || t("common.unset")}
          </p>
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold dark:border-gray-700"
            >
              {t("jobs.detail.close")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <UserDetailModal
      user={user}
      users={users}
      onSaved={setUsers}
      showAdminAssignments
      adminOperators={operators}
      requesterEmail={adminEmail}
      changeRequest={changeRequest}
      canSubmitChangeRequest={user.approval_status === "approved"}
      onChangeRequested={onRequested}
      detailsReadOnly
      assignmentsReadOnly
      onAssignmentsSaved={() => undefined}
      onClose={onClose}
    />
  );
}
