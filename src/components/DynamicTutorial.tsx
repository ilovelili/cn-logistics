import { HelpCircle, MousePointerClick, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "../lib/i18n";
import type { AppUserRole } from "../lib/auth";
import InstantTooltip from "./InstantTooltip";

type TutorialVariant = "user" | "admin";
type TutorialStepId =
  | "admin-nav"
  | "admin-shipments"
  | "admin-shippers"
  | "admin-operators"
  | "admin-standard-flow"
  | "admin-documents"
  | "admin-feedback"
  | "user-filters"
  | "user-table"
  | "user-documents";

interface TutorialStep {
  id: TutorialStepId;
  title: string;
  body: string;
  fallbackX: string;
  fallbackY: string;
  targetSelector?: string;
  superAdminOnly?: boolean;
  normalUserOnly?: boolean;
}

interface DynamicTutorialProps {
  variant: TutorialVariant;
  adminTheme?: boolean;
  profileRole?: AppUserRole;
  onStepChange?: (stepIndex: number, stepId: TutorialStepId) => void;
}

export default function DynamicTutorial({
  variant,
  adminTheme = false,
  profileRole = "normal",
  onStepChange,
}: DynamicTutorialProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [pointerPosition, setPointerPosition] = useState({
    x: "50%",
    y: "50%",
  });
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const autoOpenCheckedRef = useRef(false);
  const steps = useMemo(
    () => getTutorialSteps(variant, profileRole),
    [profileRole, variant],
  );
  const currentStep = steps[stepIndex] ?? steps[0];
  const storageKey = `cn_logistics_tutorial_hidden_${variant}_${profileRole}`;

  const savePreference = useCallback(() => {
    if (doNotShowAgain) {
      localStorage.setItem(storageKey, "true");
      return;
    }

    localStorage.removeItem(storageKey);
  }, [doNotShowAgain, storageKey]);

  const closeTutorial = useCallback(() => {
    savePreference();
    setOpen(false);
  }, [savePreference]);

  useEffect(() => {
    if (stepIndex >= steps.length) {
      setStepIndex(0);
    }
  }, [stepIndex, steps.length]);

  useLayoutEffect(() => {
    if (!open || !currentStep) return;

    const updatePointerPosition = () => {
      const target = currentStep.targetSelector
        ? document.querySelector<HTMLElement>(currentStep.targetSelector)
        : null;
      const rect = target?.getBoundingClientRect();

      if (rect && rect.width > 0 && rect.height > 0) {
        const x = clamp(rect.left + rect.width / 2, 48, window.innerWidth - 48);
        const y = clamp(rect.top + rect.height / 2, 48, window.innerHeight - 48);
        setPointerPosition({ x: `${x}px`, y: `${y}px` });
        return;
      }

      setPointerPosition({
        x: currentStep.fallbackX,
        y: currentStep.fallbackY,
      });
    };

    updatePointerPosition();
    window.addEventListener("resize", updatePointerPosition);
    window.addEventListener("scroll", updatePointerPosition, true);

    return () => {
      window.removeEventListener("resize", updatePointerPosition);
      window.removeEventListener("scroll", updatePointerPosition, true);
    };
  }, [currentStep, open]);

  const openTutorial = () => {
    if (!steps.length) return;

    onStepChange?.(0, steps[0].id);
    setStepIndex(0);
    setDoNotShowAgain(localStorage.getItem(storageKey) === "true");
    setOpen(true);
  };

  const showStep = (nextStepIndex: number) => {
    const nextStep = steps[nextStepIndex];
    if (!nextStep) return;

    onStepChange?.(nextStepIndex, nextStep.id);
    setStepIndex(nextStepIndex);
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTutorial();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTutorial, open]);

  useEffect(() => {
    if (autoOpenCheckedRef.current) return;

    autoOpenCheckedRef.current = true;
    if (localStorage.getItem(storageKey) === "true") return;
    if (!steps.length) return;

    onStepChange?.(0, steps[0].id);
    setStepIndex(0);
    setDoNotShowAgain(false);
    setOpen(true);
  }, [onStepChange, steps, storageKey]);

  const buttonClass = adminTheme
    ? "rounded-xl bg-gray-100 p-2 text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
    : "rounded-xl bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700";

  return (
    <>
      <InstantTooltip label={t("tutorial.open")}>
        {(tooltipId) => (
          <button
            type="button"
            onClick={openTutorial}
            className={buttonClass}
            aria-label={t("tutorial.open")}
            aria-describedby={tooltipId}
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        )}
      </InstantTooltip>

      {open && currentStep && (
        <div
          className="fixed inset-0 z-[160] overflow-hidden bg-slate-950/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("tutorial.title")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTutorial();
            }
          }}
        >
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200/80 bg-cyan-100/10 shadow-[0_0_36px_rgba(103,232,249,0.38)] transition-all duration-700 ease-out"
              style={{ left: pointerPosition.x, top: pointerPosition.y }}
            />
            <MousePointerClick
              className="absolute h-14 w-14 -translate-x-2 -translate-y-2 text-cyan-100 drop-shadow-[0_8px_18px_rgba(8,145,178,0.55)] transition-all duration-700 ease-out tutorial-pointer-tap"
              style={{ left: pointerPosition.x, top: pointerPosition.y }}
            />
          </div>

          <div
            className="flex h-full items-end justify-center pb-8 sm:items-center sm:pb-0"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-white p-6 pr-16 shadow-2xl dark:bg-gray-900">
              <button
                type="button"
                onClick={closeTutorial}
                className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label={t("tutorial.close")}
              >
                <X className="h-5 w-5" />
              </button>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                {t("tutorial.title")}
              </div>
              <h2 className="mt-3 text-2xl font-black text-gray-900 dark:text-white">
                {currentStep.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                {currentStep.body}
              </p>

              <label className="mt-5 flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={doNotShowAgain}
                  onChange={(event) => setDoNotShowAgain(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 dark:border-gray-700 dark:bg-gray-800"
                />
                {t("tutorial.doNotShowAgain")}
              </label>

              <div className="mt-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  {steps.map((step, index) => (
                    <button
                      key={step.title}
                      type="button"
                      onClick={() => showStep(index)}
                      className={`h-2.5 rounded-full transition-all ${
                        index === stepIndex
                          ? "w-8 bg-cyan-500"
                          : "w-2.5 bg-gray-300 dark:bg-gray-700"
                      }`}
                      aria-label={t("tutorial.step", {
                        current: index + 1,
                        total: steps.length,
                      })}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      showStep((stepIndex - 1 + steps.length) % steps.length);
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {t("tutorial.previous")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepIndex === steps.length - 1) {
                        closeTutorial();
                        return;
                      }
                      showStep(stepIndex + 1);
                    }}
                    className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
                  >
                    {stepIndex === steps.length - 1
                      ? t("tutorial.done")
                      : t("tutorial.next")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getTutorialSteps(
  variant: TutorialVariant,
  profileRole: AppUserRole,
): TutorialStep[] {
  if (variant === "admin") {
    const adminSteps: TutorialStep[] = [
      {
        id: "admin-nav",
        title: t("tutorial.admin.nav.title"),
        body:
          profileRole === "super_admin"
            ? t("tutorial.admin.nav.body")
            : t("tutorial.admin.nav.bodyAdmin"),
        targetSelector: '[data-tutorial-target="admin-nav"]',
        fallbackX: "7.5rem",
        fallbackY: "18rem",
      },
      {
        id: "admin-shipments",
        title: t("tutorial.admin.shipments.title"),
        body: t("tutorial.admin.shipments.body"),
        targetSelector: '[data-tutorial-target="shipment-table"]',
        fallbackX: "50%",
        fallbackY: "44%",
      },
      {
        id: "admin-documents",
        title: t("tutorial.admin.documents.title"),
        body: t("tutorial.admin.documents.body"),
        targetSelector: '[data-tutorial-target="shipment-documents"]',
        fallbackX: "78%",
        fallbackY: "58%",
      },
      {
        id: "admin-shippers",
        title: t("tutorial.admin.shippers.title"),
        body: t("tutorial.admin.shippers.body"),
        targetSelector: '[data-tutorial-target="shipper-registration-page"]',
        fallbackX: "50%",
        fallbackY: "38%",
      },
      {
        id: "admin-operators",
        title: t("tutorial.admin.operators.title"),
        body: t("tutorial.admin.operators.body"),
        targetSelector: '[data-tutorial-target="admin-operator-page"]',
        fallbackX: "50%",
        fallbackY: "38%",
        superAdminOnly: true,
      },
      {
        id: "admin-standard-flow",
        title: t("tutorial.admin.standardFlow.title"),
        body: t("tutorial.admin.standardFlow.body"),
        targetSelector: '[data-tutorial-target="standard-flow-page"]',
        fallbackX: "50%",
        fallbackY: "38%",
        superAdminOnly: true,
      },
      {
        id: "admin-feedback",
        title: t("tutorial.admin.feedback.title"),
        body: t("tutorial.admin.feedback.body"),
        targetSelector: '[data-tutorial-target="feedback-review-page"]',
        fallbackX: "50%",
        fallbackY: "42%",
        superAdminOnly: true,
      },
    ];

    return adminSteps.filter(
      (step) => !step.superAdminOnly || profileRole === "super_admin",
    );
  }

  const userSteps: TutorialStep[] = [
    {
      id: "user-filters",
      title: t("tutorial.user.filters.title"),
      body: t("tutorial.user.filters.body"),
      targetSelector: '[data-tutorial-target="shipment-filters"]',
      fallbackX: "46%",
      fallbackY: "28%",
    },
    {
      id: "user-table",
      title: t("tutorial.user.table.title"),
      body: t("tutorial.user.table.body"),
      targetSelector: '[data-tutorial-target="shipment-table"]',
      fallbackX: "52%",
      fallbackY: "54%",
    },
    {
      id: "user-documents",
      title: t("tutorial.user.documents.title"),
      body: t("tutorial.user.documents.body"),
      targetSelector: '[data-tutorial-target="shipment-documents"]',
      fallbackX: "78%",
      fallbackY: "58%",
    },
  ];

  return userSteps.filter(
    (step) => !step.normalUserOnly || profileRole === "normal",
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
