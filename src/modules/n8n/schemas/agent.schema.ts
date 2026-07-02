import { z } from "zod";

export const createAgentSchema = z.object({
  name: z.string().min(2, "Informe o nome do agente."),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  personality: z.string().min(10, "Informe a personalidade do agente."),
  rules: z.record(z.unknown()).optional(),
  flow: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  minTypingSeconds: z.coerce.number().int().min(0).optional(),
  maxTypingSeconds: z.coerce.number().int().min(1).optional(),
  enableReadReceipt: z.boolean().optional(),
  enableTyping: z.boolean().optional(),
  enableReplyDelay: z.boolean().optional(),
  openAiModel: z.string().optional(),
  zapiBaseUrl: z.string().optional(),
  zapiInstanceId: z.string().optional(),
  zapiToken: z.string().optional(),
  zapiClientToken: z.string().optional(),
  zapiWhatsappNumber: z.string().optional(),
  planIds: z.array(z.string().uuid()).optional(),
});

export const updateAgentSchema = createAgentSchema.partial();
