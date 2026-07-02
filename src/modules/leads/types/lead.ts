export type CreateLeadInput = {
  name: string;
  phone: string;
  email?: string;
  cpfCnpj?: string;
  birthDate?: string | Date;
  cep?: string;
  address?: string;
  streetNumber?: string;
  complement?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  source?: string;
  notes?: string;
  kanbanStageId?: string;
  planId?: string;
  planName?: string;
  planValue?: number;
  billingDueDay?: number;
  assignedUserId?: string;
  expectedValue?: number;
};

export type UpdateLeadInput = Partial<CreateLeadInput> & {
  status?: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";
  kanbanStageId?: string;
  assignedUserId?: string;
  planId?: string;
  expectedValue?: number;
};
