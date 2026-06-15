import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
  const listboxId = useId();
  const currentLocale = getLocale();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(() =>
    Math.max(
      languageOptions.findIndex((option) => option.value === currentLocale),
      0,
    ),
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentOption =
    languageOptions.find((option) => option.value === currentLocale) ??
    languageOptions[0];
  const currentOptionIndex = Math.max(
    languageOptions.findIndex((option) => option.value === currentLocale),
    0,
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    optionRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open]);

  const openMenu = (nextIndex = currentOptionIndex) => {
    setFocusedIndex(nextIndex);
    setOpen(true);
  };

  const selectLocale = (nextLocale: Locale) => {
    if (nextLocale === currentLocale) {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }

    setLocale(nextLocale);
    window.location.reload();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;

      if (!open) {
        openMenu(currentOptionIndex);
        return;
      }

      setFocusedIndex(
        (current) =>
          (current + direction + languageOptions.length) %
          languageOptions.length,
      );
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : languageOptions.length - 1;

      if (!open) {
        openMenu(nextIndex);
        return;
      }

      setFocusedIndex(nextIndex);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      selectLocale(languageOptions[focusedIndex]?.value ?? currentLocale);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }

          openMenu();
        }}
        className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 text-lg font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="Language"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span aria-hidden="true">{currentOption.flag}</span>
        <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Language"
          className="absolute right-0 z-[220] mt-2 min-w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        >
          {languageOptions.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={option.value === currentLocale}
              onClick={() => selectLocale(option.value)}
              onFocus={() => setFocusedIndex(index)}
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
