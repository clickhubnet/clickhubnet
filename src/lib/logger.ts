import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "FATAL";

type TechnicalLogInput = {
  requestId?: string;
  level: LogLevel;
  category: string;
  message: string;
  method?: string;
  endpoint?: string;
  durationMs?: number;
  statusCode?: number;
  integration?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeTechnicalLog(input: TechnicalLogInput) {
  try {
    await prisma.technicalLog.create({ data: input });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Technical log failed", error);
    }
  }
}
