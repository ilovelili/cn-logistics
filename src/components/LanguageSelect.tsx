import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getLocale, setLocale, type Locale } from "../lib/i18n";

const languageOptions: Array<{
  value: Locale;
  flag: string;
  label: string;
}> = [
  { value: "ja", flag: "🇯🇵", label: "日本語" },
  { value: "en", flag: "🇺🇸", label: "English" },
];

export default function LanguageSelect() {
  const currentLocale = getLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentOption =
    languageOptions.find((option) => option.value === currentLocale) ??
    languageOptions[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const selectLocale = (nextLocale: Locale) => {
    if (nextLocale === currentLocale) {
      setOpen(false);
      return;
    }

    setLocale(nextLocale);
    window.location.reload();
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 text-lg font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="Language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span aria-hidden="true">{currentOption.flag}</span>
        <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-[220] mt-2 min-w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        >
          {languageOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === currentLocale}
              onClick={() => selectLocale(option.value)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition ${
                option.value === currentLocale
                  ? "bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              <span aria-hidden="true">{option.flag}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
