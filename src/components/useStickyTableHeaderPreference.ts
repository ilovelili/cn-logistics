import { useEffect, useState } from "react";

const storageKey = "sticky_table_header_enabled";
const stickyHeaderPreferenceEvent = "sticky-table-header-preference";

export function useStickyTableHeaderPreference() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "true";
  });

  useEffect(() => {
    const syncPreference = () => {
      setEnabled(window.localStorage.getItem(storageKey) === "true");
    };

    window.addEventListener("storage", syncPreference);
    window.addEventListener(stickyHeaderPreferenceEvent, syncPreference);

    return () => {
      window.removeEventListener("storage", syncPreference);
      window.removeEventListener(stickyHeaderPreferenceEvent, syncPreference);
    };
  }, []);

  const toggleEnabled = () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    window.localStorage.setItem(storageKey, String(nextEnabled));
    window.dispatchEvent(new Event(stickyHeaderPreferenceEvent));
  };

  return [enabled, toggleEnabled] as const;
}
