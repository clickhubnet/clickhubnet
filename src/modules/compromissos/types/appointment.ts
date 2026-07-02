import type { AppointmentPriority } from "@prisma/client";

export type CreateAppointmentInput = {
  title: string;
  description?: string;
  status?: string;
  stageId?: string;
  priority?: AppointmentPriority;
  startsAt?: Date;
  dueAt?: Date;
  leadId?: string;
  responsibleId?: string;
  assignedToAll?: boolean;
  order?: number;
};

export type UpdateAppointmentInput = Partial<CreateAppointmentInput>;
