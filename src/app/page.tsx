import { Mark } from "@/components/brand/Mark";

export default function Landing() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-gutter text-center">
      <Mark size={56} />
      <h1 className="text-[28px] font-bold leading-tight">StacksClub</h1>
      <p className="text-secondary text-text-muted">Stocks, onchain. Build and share your own Stacks.</p>
    </main>
  );
}
