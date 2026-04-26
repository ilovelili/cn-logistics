import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Mail, Upload, UserRound, X } from "lucide-react";
import {
  AppUserProfile,
  fetchAppUserProfile,
  updateAppUserAvatar,
  uploadAppUserAvatar,
} from "../lib/auth";
import { t } from "../lib/i18n";

interface ProfileButtonProps {
  email: string;
}

export default function ProfileButton({ email }: ProfileButtonProps) {
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cropImageUrl, setCropImageUrl] = useState("");
  const [cropFileName, setCropFileName] = useState("");
  const [cropZoom, setCropZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const nextProfile = await fetchAppUserProfile(email);
        if (active) {
          setProfile(nextProfile);
        }
      } catch {
        if (active) {
          setError(t("profile.loadFailed"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [email]);

  const avatarUrl = profile?.avatar_url;
  const displayEmail = profile?.email ?? email;

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setCropZoom(1);
    setCropFileName(file.name);
    setCropImageUrl(URL.createObjectURL(file));
    event.target.value = "";
  };

  const cancelCrop = () => {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
    }
    setCropImageUrl("");
    setCropFileName("");
    setCropZoom(1);
  };

  const createCroppedAvatarFile = async () => {
    const image = cropImageRef.current;
    if (!image) return null;

    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) return null;

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const cropSize = Math.min(naturalWidth, naturalHeight) / cropZoom;
    const sourceX = (naturalWidth - cropSize) / 2;
    const sourceY = (naturalHeight - cropSize) / 2;

    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      size,
      size,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png", 0.92);
    });

    if (!blob) return null;

    const baseName = cropFileName.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${baseName}-avatar.png`, { type: "image/png" });
  };

  const uploadCroppedAvatar = async () => {
    setUploading(true);
    setError("");

    try {
      const croppedFile = await createCroppedAvatarFile();
      if (!croppedFile) {
        throw new Error("Unable to crop avatar");
      }

      const publicUrl = await uploadAppUserAvatar(displayEmail, croppedFile);
      const nextProfile = await updateAppUserAvatar(displayEmail, publicUrl);
      setProfile(nextProfile);
      cancelCrop();
    } catch {
      setError(t("profile.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={t("profile.avatar")}
      className="h-full w-full object-cover"
    />
  ) : (
    <UserRound className="h-5 w-5" />
  );

  const modal = open ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            {t("profile.title")}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cropImageUrl ? (
          <div className="space-y-4">
            <div className="mx-auto h-64 w-64 overflow-hidden rounded-2xl bg-slate-950">
              <img
                ref={cropImageRef}
                src={cropImageUrl}
                alt={t("profile.crop")}
                className="h-full w-full object-cover"
                style={{ transform: `scale(${cropZoom})` }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-gray-300">
                {t("profile.zoom")}
              </label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={cancelCrop}
                disabled={uploading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={uploadCroppedAvatar}
                disabled={uploading}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
              >
                <Check className="h-4 w-4" />
                {uploading ? t("profile.uploading") : t("profile.applyCrop")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={t("profile.avatar")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-10 w-10" />
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
            >
              <Upload className="h-4 w-4" />
              {t("profile.upload")}
            </button>
          </div>
        )}

        <div className="mt-6">
          <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-gray-300">
            {t("profile.email")}
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={displayEmail}
              readOnly
              className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-slate-700 outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700"
        title={t("profile.title")}
      >
        {loading ? <UserRound className="h-5 w-5 animate-pulse" /> : avatar}
      </button>

      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
