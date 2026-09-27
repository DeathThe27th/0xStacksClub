import { PROVIDER_LABEL, type Provider } from "@/lib/constants";

export function ProviderPill({ provider }: { provider: string }) {
  return (
    <span className="rounded-badge bg-surface-2 px-1.5 py-0.5 text-pill text-text-muted">{PROVIDER_LABEL[provider as Provider] ?? provider}</span>
  );
}
