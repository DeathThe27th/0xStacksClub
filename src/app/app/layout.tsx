import { AuthGate } from "@/components/shell/AuthGate";
import { Shell } from "@/components/shell/Shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Shell>{children}</Shell>
    </AuthGate>
  );
}
