import { getLocale, setLocale, type Locale } from "../lib/i18n";

const languageOptions: Array<{
  value: Locale;
  label: string;
}> = [
  { value: "ja", label: "🇯🇵 日本語" },
  { value: "en", label: "🇺🇸 English" },
];

export default function LanguageSelect() {
  const currentLocale = getLocale();

  return (
    <select
      value={currentLocale}
      onChange={(event) => {
        const nextLocale = event.target.value as Locale;
        setLocale(nextLocale);
        window.location.reload();
      }}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
      aria-label="Language"
    >
      {languageOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
