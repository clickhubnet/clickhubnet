import { z } from "zod";

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalDate = z.preprocess((value) => (value === "" ? undefined : value), z.coerce.date().optional());

export const createAppointmentSchema = z.object({
  title: z.string().min(2, "Informe o titulo."),
  description: z.string().optional(),
  status: z.string().optional(),
  stageId: optionalUuid,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  startsAt: optionalDate,
  dueAt: optionalDate,
  leadId: optionalUuid,
  responsibleId: optionalUuid,
  assignedToAll: z.coerce.boolean().optional(),
  order: z.coerce.number().int().optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial();
