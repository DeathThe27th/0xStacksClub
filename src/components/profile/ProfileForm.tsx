"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ApiError, useApi } from "@/lib/client/api";
import { squareCrop } from "@/lib/client/image";
import type { MeResponse } from "@/lib/client/types";

type Initial = NonNullable<MeResponse["profile"]> | null;

export function ProfileForm({ initial, submitLabel, onSaved }: { initial: Initial; submitLabel: string; onSaved: () => void }) {
  const api = useApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(initial?.username ?? "");
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [xUrl, setXUrl] = useState(initial?.x_url ?? "");
  const [avatar, setAvatar] = useState<string | null>(initial?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameOk = /^[a-z0-9_]{3,20}$/.test(username);
  const xOk = !xUrl || /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(xUrl);

  const upload = async (f: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", await squareCrop(f));
      const r = await api<{ url: string }>("/api/profile/avatar", { method: "POST", body: form });
      setAvatar(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("/api/profile", {
        method: "PUT",
        json: { username, displayName: displayName || null, bio: bio || null, xUrl: xUrl || null, avatarUrl: avatar },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (usernameOk && xOk) void save();
      }}
      className="space-y-5"
    >
      <div className="flex justify-center">
        <button type="button" onClick={() => fileRef.current?.click()} className="press relative" aria-label="Upload avatar">
          <Avatar src={avatar} name={username || "?"} size={88} />
          <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-bg bg-primary text-white">
            <Camera size={15} />
          </span>
          {uploading && <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-[12px]">Uploading</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      <Field label="Username" hint={username && !usernameOk ? "3 to 20 lowercase letters, numbers or underscore" : undefined}>
        <div className="flex items-center">
          <span className="pl-4 text-text-muted">@</span>
          <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={20} autoCapitalize="off" autoComplete="off" className="h-12 flex-1 bg-transparent pl-1 pr-4 outline-none" />
        </div>
      </Field>
      <Field label="Display name (optional)">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className="h-12 w-full bg-transparent px-4 outline-none" />
      </Field>
      <Field label="Bio" hint={`${bio.length}/160`}>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} className="w-full resize-none bg-transparent px-4 py-3 outline-none" />
      </Field>
      <Field label="X profile (optional)" hint={!xOk ? "Use a link like https://x.com/yourhandle" : "Shown as a link. Not verified."}>
        <input value={xUrl} onChange={(e) => setXUrl(e.target.value.trim())} placeholder="https://x.com/yourhandle" inputMode="url" className="h-12 w-full bg-transparent px-4 outline-none" />
      </Field>
      {error && (
        <p className="text-center text-secondary text-down" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={saving} disabled={!usernameOk || !xOk || uploading}>
        {submitLabel}
      </Button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-secondary text-text-muted">{label}</span>
      <span className="block rounded-chip border border-border bg-surface focus-within:border-primary">{children}</span>
      {hint && <span className="mt-1.5 block text-[12px] text-text-muted">{hint}</span>}
    </label>
  );
}
