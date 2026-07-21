import { useState } from "react";
import { Lock, Mail } from "lucide-react";
import LogoMark from "./LogoMark";
import { t } from "../lib/i18n";

interface LoginPageProps {
  onLogin: () => Promise<void>;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);

    try {
      await onLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f2ec] p-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/30 sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <LogoMark className="h-12 w-12 rounded-2xl" />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              CN Navigator
            </h1>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {t("login.tagline")}
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="text-xl font-black text-slate-950 dark:text-white">
            {t("login.heading")}
          </h3>
        </div>

        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-600 dark:text-gray-300">
            {t("login.passwordlessDescription")}
          </p>
          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
          >
            <Mail className="h-4 w-4" />
            {loading ? t("login.redirecting") : t("login.emailOtp")}
          </button>
          <p className="text-center text-xs leading-5 text-slate-500 dark:text-gray-400">
            {t("login.signupHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
