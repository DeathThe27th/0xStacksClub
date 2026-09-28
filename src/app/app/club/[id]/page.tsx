import { redirect } from "next/navigation";

/** The in-app Club chat is retired: a basket's Club is now its holders-only Telegram link. */
export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/app/basket/${(await params).id}`);
}
