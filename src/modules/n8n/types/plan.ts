export type CreatePlanInput = {
  name: string;
  speed?: string;
  price: number;
  description?: string;
  active?: boolean;
  order?: number;
};

export type UpdatePlanInput = Partial<CreatePlanInput>;
