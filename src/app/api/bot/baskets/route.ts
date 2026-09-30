import { botBaskets, linkedBotRoute, phoneBody } from "@/server/bot";

export const POST = linkedBotRoute(phoneBody, async () => botBaskets());
