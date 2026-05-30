import { useMemo, useState } from "react";
import { UserDetailModal } from "../admin/UserRegistrationForm";
import type { AdminOperator } from "../lib/adminOperators";
import type { ShipperUser } from "../lib/shipperUsers";

interface ShipperNameDetailButtonProps {
  shipperName: string | null;
  shipperUsers: ShipperUser[];
  requesterEmail?: string;
  isSuperAdmin?: boolean;
  adminOperators?: AdminOperator[];
  className?: string;
  fallbackClassName?: string;
}

export default function ShipperNameDetailButton({
  shipperName,
  shipperUsers,
  requesterEmail = "",
  isSuperAdmin = false,
  adminOperators = [],
  className = "",
  fallbackClassName = "",
}: ShipperNameDetailButtonProps) {
  const [selectedShipperUser, setSelectedShipperUser] =
    useState<ShipperUser | null>(null);
  const matchingShipperUsers = useMemo(
    () =>
      shipperUsers.filter(
        (shipperUser) => shipperUser.shipper_name === shipperName,
      ),
    [shipperName, shipperUsers],
  );
  const displayName = shipperName || "-";

  if (matchingShipperUsers.length === 0) {
    return (
      <span className={fallbackClassName} title={displayName}>
        {displayName}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSelectedShipperUser(matchingShipperUsers[0])}
        className={className}
        title={displayName}
      >
        {displayName}
      </button>
      {selectedShipperUser && (
        <UserDetailModal
          user={selectedShipperUser}
          users={shipperUsers}
          onSaved={() => undefined}
          isSuperAdmin={isSuperAdmin}
          adminOperators={adminOperators}
          superAdminEmail={requesterEmail}
          detailsReadOnly
          assignmentsReadOnly
          onAssignmentsSaved={() => undefined}
          onClose={() => setSelectedShipperUser(null)}
        />
      )}
    </>
  );
}
