import { useState } from "react";
import { AlertCircle, Lock, Mail, ShipWheel } from "lucide-react";
import { t } from "../lib/i18n";

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<boolean>;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const success = await onLogin(email, password);

      if (!success) {
        setError(t("login.invalid"));
      }
    } catch {
      setError(t("login.invalid"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f2ec] p-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/30 sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
            <ShipWheel className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              CN Logistics
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
          <div>
            <h3 className="text-xl font-black text-slate-950 dark:text-white">
              {t("login.heading")}
            </h3>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-gray-300">
              {t("admin.login.username")}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:border-cyan-400 dark:focus:ring-cyan-950"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-gray-300">
              {t("admin.login.password")}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:border-cyan-400 dark:focus:ring-cyan-950"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-bold text-white transition hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
          >
            <Lock className="h-4 w-4" />
            {loading ? t("admin.login.submitting") : t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
