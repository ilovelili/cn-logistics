import { Bell, CheckCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAppNotifications,
  markAppNotificationsRead,
  type AppNotification,
} from "../lib/appNotifications";
import { t, type TranslationKey } from "../lib/i18n";

function getEventLabel(eventType: string) {
  const key = `appNotifications.events.${eventType}` as TranslationKey;
  return t(key);
}

export default function AppNotificationBell({ profileEmail }: { profileEmail: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const load = useCallback(() => {
    void fetchAppNotifications(profileEmail).then(setItems).catch(() => setItems([]));
  }, [profileEmail]);
  useEffect(load, [load]);
  const unread = items.filter((item) => !item.read_at).length;
  const visible = useMemo(
    () => (tab === "unread" ? items.filter((item) => !item.read_at) : items),
    [items, tab],
  );
  const markRead = async (id?: string) => {
    await markAppNotificationsRead(profileEmail, id);
    const now = new Date().toISOString();
    setItems((current) => current.map((item) =>
      !item.read_at && (!id || item.id === id) ? { ...item, read_at: now } : item,
    ));
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="fixed right-4 top-20 z-[150] w-[min(92vw,430px)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
            <div><h3 className="font-black">{t("appNotifications.title")}</h3><p className="text-xs text-gray-500">{t("appNotifications.unreadCount", { count: unread })}</p></div>
            <div className="flex gap-2"><button type="button" onClick={() => void markRead()} className="text-xs font-bold text-cyan-700"><CheckCheck className="mr-1 inline h-4 w-4" />{t("appNotifications.markAllRead")}</button><button type="button" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
          </div>
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            {(["unread", "all"] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`flex-1 px-4 py-3 text-sm font-bold ${tab === value ? "border-b-2 border-cyan-500 text-cyan-700" : "text-gray-500"}`}>{t(value === "unread" ? "appNotifications.unread" : "appNotifications.all")}</button>)}
          </div>
          <div className="max-h-[65vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {visible.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">{t("appNotifications.empty")}</p> : visible.map((item) => (
              <button key={item.id} type="button" onClick={() => void markRead(item.id)} className={`block w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${item.read_at ? "" : "bg-cyan-50/60 dark:bg-cyan-950/20"}`}>
                <div className="flex justify-between gap-3"><p className="font-bold">{getEventLabel(item.event_type)}</p><time className="shrink-0 text-[11px] text-gray-500">{new Date(item.created_at).toLocaleString()}</time></div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.shipper_name || "-"}{item.subject && item.subject !== item.shipper_name ? ` / ${item.subject}` : ""}</p>
                <p className="mt-1 text-xs text-gray-500">{t("appNotifications.actor")}: {item.actor_email || "-"}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
