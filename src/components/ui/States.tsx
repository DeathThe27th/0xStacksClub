import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface text-text-muted">{icon}</span>
      <p className="text-[16px] font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-[30ch] text-secondary text-text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center" role="alert">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-down/10 text-down">
        <AlertTriangle size={24} />
      </span>
      <p className="text-[16px] font-semibold">Couldn&apos;t load this</p>
      <p className="mt-1 max-w-[34ch] text-secondary text-text-muted">{message ?? "Check your connection and try again."}</p>
      {onRetry && (
        <Button variant="secondary" size="md" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
