import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CheckCircle2, MessageSquareText, Send, X } from "lucide-react";
import { createPortal } from "react-dom";
import { submitAppFeedback } from "../lib/appFeedback";
import { type AppUserRole } from "../lib/auth";
import { t } from "../lib/i18n";

const initialForm = {
  title: "",
  message: "",
  page: "",
};

export default function FeedbackWidget({
  profileRole,
}: {
  profileRole: AppUserRole;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const pageOptions = getFeedbackPageOptions(profileRole);

  useEffect(() => {
    setForm((current) =>
      current.page &&
      !getFeedbackPageOptions(profileRole).some(
        (option) => option.value === current.page,
      )
        ? { ...current, page: "" }
        : current,
    );
  }, [profileRole]);

  useEffect(() => {
    if (!open) return;

    titleInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting]);

  const openForm = () => {
    setError(null);
    setSubmitted(false);
    setOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setOpen(false);
    setError(null);
    if (submitted) {
      setForm(initialForm);
      setSubmitted(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await submitAppFeedback(form);
      setSubmitted(true);
      setForm(initialForm);
    } catch {
      setError(t("appFeedback.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openForm}
        aria-label={t("appFeedback.open")}
        className="group fixed bottom-20 right-6 z-[70] flex h-14 items-center overflow-hidden rounded-full border border-cyan-200 bg-slate-950 text-white shadow-2xl shadow-slate-950/25 transition-all hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/50 dark:border-cyan-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
      >
        <span className="max-w-0 overflow-hidden whitespace-nowrap pl-0 text-sm font-black opacity-0 transition-all duration-200 group-hover:max-w-40 group-hover:pl-5 group-hover:opacity-100 group-focus:max-w-40 group-focus:pl-5 group-focus:opacity-100">
          {t("appFeedback.open")}
        </span>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center">
          <MessageSquareText className="h-6 w-6" aria-hidden="true" />
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[250] flex items-end justify-center bg-slate-950/45 p-4 pb-24 backdrop-blur-sm sm:justify-end sm:p-6 sm:pb-24"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) closeForm();
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            >
              <header className="flex items-start justify-between bg-slate-950 px-6 py-5 text-white dark:bg-gray-800">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
                    <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id={titleId} className="text-lg font-black">
                      {t("appFeedback.title")}
                    </h2>
                    <p
                      id={descriptionId}
                      className="mt-0.5 text-xs text-slate-300"
                    >
                      {t("appFeedback.description")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  aria-label={t("appFeedback.close")}
                  className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </header>

              {submitted ? (
                <div className="px-6 py-10 text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-black text-gray-950 dark:text-white">
                    {t("appFeedback.thankYou")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {t("appFeedback.submitted")}
                  </p>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
                  >
                    {t("appFeedback.done")}
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(event) => void handleSubmit(event)}
                  className="space-y-5 p-6"
                >
                  <FeedbackField
                    ref={titleInputRef}
                    label={t("appFeedback.feedbackTitle")}
                    value={form.title}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, title: value }))
                    }
                    placeholder={t("appFeedback.titlePlaceholder")}
                    maxLength={200}
                    required
                  />
                  <FeedbackField
                    label={t("appFeedback.message")}
                    value={form.message}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, message: value }))
                    }
                    placeholder={t("appFeedback.messagePlaceholder")}
                    maxLength={5000}
                    multiline
                    required
                  />
                  <label className="block">
                    <span className="text-sm font-black text-gray-800 dark:text-gray-200">
                      {t("appFeedback.page")}
                    </span>
                    <select
                      value={form.page}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          page: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-950 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:border-cyan-700 dark:focus:ring-cyan-950"
                    >
                      <option value="">
                        {t("appFeedback.pagePlaceholder")}
                      </option>
                      {pageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={
                      submitting || !form.title.trim() || !form.message.trim()
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {submitting
                      ? t("appFeedback.submitting")
                      : t("appFeedback.submit")}
                  </button>
                </form>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

const FeedbackField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    maxLength: number;
    multiline?: boolean;
    required?: boolean;
  }
>(function FeedbackField(
  {
    label,
    value,
    onChange,
    placeholder,
    maxLength,
    multiline = false,
    required = false,
  },
  ref,
) {
  const inputClassName =
    "mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:border-cyan-700 dark:focus:ring-cyan-950";

  return (
    <label className="block">
      <span className="text-sm font-black text-gray-800 dark:text-gray-200">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          rows={6}
          className={`${inputClassName} resize-y`}
        />
      ) : (
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          className={inputClassName}
        />
      )}
      <span className="mt-1 block text-right text-xs text-gray-400">
        {value.length.toLocaleString()} / {maxLength.toLocaleString()}
      </span>
    </label>
  );
});

function getFeedbackPageOptions(profileRole: AppUserRole) {
  if (profileRole === "normal") {
    return [
      { value: "shipments", label: t("app.nav.jobs") },
      { value: "notifications", label: t("app.nav.notifications") },
    ];
  }

  const adminPages = [
    { value: "shipment_management", label: t("admin.nav.shipmentEntry") },
    { value: "shipper_registration", label: t("admin.nav.userRegistration") },
  ];

  if (profileRole === "admin") {
    return adminPages;
  }

  return [
    ...adminPages,
    { value: "admin_registration", label: t("superAdmin.nav.adminOperators") },
    { value: "standard_flow", label: t("superAdmin.nav.standardFlow") },
    { value: "shipment_feedback", label: t("superAdmin.nav.feedback") },
    { value: "email_templates", label: t("superAdmin.nav.emailTemplates") },
  ];
}
