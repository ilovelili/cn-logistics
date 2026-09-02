import { useMemo, useState } from "react";
import { Bell, Check, ChevronRight, MapPin, PlaneTakeoff } from "lucide-react";
import { getLocale, t } from "../lib/i18n";
import type { ShipmentNotification } from "../lib/notifications";
import { statusLabels } from "../lib/shipmentJobs";

type NotificationTab = "unread" | "all";

interface NotificationsPageProps {
  notifications: ShipmentNotification[];
  loading: boolean;
  error: string | null;
  markingId: string | null;
  onNotificationClick: (notification: ShipmentNotification) => void;
}

export default function NotificationsPage({
  notifications,
  loading,
  error,
  markingId,
  onNotificationClick,
}: NotificationsPageProps) {
  const [tab, setTab] = useState<NotificationTab>("unread");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readDuringVisitIds, setReadDuringVisitIds] = useState<Set<string>>(
    () => new Set(),
  );
  const unreadCount = notifications.reduce(
    (count, notification) => count + (notification.read_at ? 0 : 1),
    0,
  );
  const visibleNotifications = useMemo(
    () =>
      tab === "unread"
        ? notifications.filter(
            (notification) =>
              !notification.read_at || readDuringVisitIds.has(notification.id),
          )
        : notifications,
    [notifications, readDuringVisitIds, tab],
  );

  const handleNotificationClick = (notification: ShipmentNotification) => {
    if (!notification.read_at) {
      setReadDuringVisitIds((current) => {
        const next = new Set(current);
        next.add(notification.id);
        return next;
      });
    }
    setSelectedId((current) =>
      current === notification.id ? null : notification.id,
    );
    onNotificationClick(notification);
  };

  const handleTabChange = (nextTab: NotificationTab) => {
    setTab(nextTab);
    setSelectedId(null);
    setReadDuringVisitIds(new Set());
  };

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-950 dark:text-white">
            {t("notifications.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("notifications.description")}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div
          className="flex border-b border-gray-200 px-3 pt-2 dark:border-gray-800"
          role="tablist"
          aria-label={t("notifications.tabsLabel")}
        >
          <TabButton
            active={tab === "unread"}
            count={unreadCount}
            label={t("notifications.unread")}
            onClick={() => handleTabChange("unread")}
          />
          <TabButton
            active={tab === "all"}
            count={notifications.length}
            label={t("notifications.all")}
            onClick={() => handleTabChange("all")}
          />
        </div>

        {error && (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("notifications.loading")}
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <div className="rounded-full bg-gray-100 p-4 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
              <Check className="h-7 w-7" />
            </div>
            <p className="mt-4 font-semibold text-gray-700 dark:text-gray-300">
              {tab === "unread"
                ? t("notifications.noUnread")
                : t("notifications.noNotifications")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {visibleNotifications.map((notification) => {
              const isUnread = !notification.read_at;
              const isExpanded = selectedId === notification.id;
              const notificationTitle = getNotificationTitle(notification);
              const notificationSummary = getNotificationSummary(notification);

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  disabled={markingId === notification.id}
                  aria-expanded={isExpanded}
                  className={`block w-full p-5 text-left transition hover:bg-gray-50 disabled:cursor-wait dark:hover:bg-gray-800/60 ${
                    isUnread ? "bg-cyan-50/60 dark:bg-cyan-950/10" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                        isUnread
                          ? "bg-cyan-500"
                          : "bg-gray-300 dark:bg-gray-700"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-bold text-gray-950 dark:text-white">
                          {notificationTitle}
                        </p>
                        <time className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {formatNotificationDate(notification.created_at)}
                        </time>
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {notificationSummary}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1.5">
                          <PlaneTakeoff className="h-4 w-4" />
                          {t("notifications.awbBl")}:{" "}
                          {notification.awb_bl_number || "-"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" />
                          {notification.origin || "-"} →{" "}
                          {notification.destination || "-"}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900 sm:grid-cols-2">
                          <Detail
                            label={t("notifications.origin")}
                            value={notification.origin}
                          />
                          <Detail
                            label={t("notifications.destination")}
                            value={notification.destination}
                          />
                          <Detail
                            label={
                              isShipmentSaveNotification(notification)
                                ? t("notifications.updateType")
                                : t("notifications.previousStatus")
                            }
                            value={getNotificationStatusLabel(
                              notification.previous_status,
                            )}
                          />
                          <Detail
                            label={t("notifications.currentStatus")}
                            value={getNotificationStatusLabel(
                              notification.current_status,
                            )}
                          />
                        </div>
                      )}
                    </div>
                    <ChevronRight
                      className={`mt-1 h-5 w-5 shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm font-bold transition ${
        active
          ? "border-cyan-500 text-cyan-700 dark:text-cyan-300"
          : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      }`}
    >
      {label}
      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">
        {count}
      </span>
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-gray-800 dark:text-gray-200">
        {value || "-"}
      </p>
    </div>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat(getLocale() === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getNotificationTitle(notification: ShipmentNotification) {
  if (notification.previous_status === "__status_set__") {
    return t("notifications.statusSet");
  }
  if (notification.previous_status === "__created__") {
    return t("notifications.shipmentCreated");
  }
  if (notification.previous_status === "__updated__") {
    return t("notifications.shipmentDetailsUpdated");
  }
  return t("notifications.statusUpdated");
}

function getNotificationSummary(notification: ShipmentNotification) {
  const current = getNotificationStatusLabel(notification.current_status);
  if (notification.previous_status === "__status_set__") {
    return t("notifications.statusSetSummary", { current });
  }
  if (
    notification.previous_status === "__created__" ||
    notification.previous_status === "__updated__"
  ) {
    return t("notifications.currentStatusSummary", { current });
  }
  return t("notifications.statusChanged", {
    previous: getNotificationStatusLabel(notification.previous_status),
    current,
  });
}

function getNotificationStatusLabel(status: string) {
  if (status === "__status_set__") {
    return t("notifications.statusSet");
  }
  if (status === "__created__") {
    return t("notifications.shipmentCreated");
  }
  if (status === "__updated__") {
    return t("notifications.shipmentDetailsUpdated");
  }
  return statusLabels[status as keyof typeof statusLabels] ?? status;
}

function isShipmentSaveNotification(notification: ShipmentNotification) {
  return (
    notification.previous_status === "__status_set__" ||
    notification.previous_status === "__created__" ||
    notification.previous_status === "__updated__"
  );
}
