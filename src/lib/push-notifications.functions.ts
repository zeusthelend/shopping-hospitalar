import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const chatMessagePushSchema = z.object({ messageId: z.string().uuid() });

export const checkOverdueDavPushes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deliverOverdueDavPushes } = await import("./push-delivery.server");
    return deliverOverdueDavPushes(context.userId);
  });

export const notifyChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => chatMessagePushSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { deliverChatMessagePush } = await import("./push-delivery.server");
    return deliverChatMessagePush(context.userId, data.messageId);
  });

const chatCallPushSchema = z.object({ callId: z.string().uuid() });

export const notifyChatCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => chatCallPushSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { deliverChatCallPush } = await import("./push-delivery.server");
    return deliverChatCallPush(context.userId, data.callId);
  });
