import { z } from "zod";
import { businessDateSchema, businessDateToMs } from "./common.js";

export const reportRangeQuerySchema = z.object({
  from: businessDateSchema,
  to: businessDateSchema,
  includeBills: z.preprocess((value) => value === true || value === "true", z.boolean()).default(false)
}).superRefine((value, ctx) => {
  const fromMs = businessDateToMs(value.from);
  const toMs = businessDateToMs(value.to);
  if (fromMs > toMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "End date must be on or after start date" });
  }
});

export type ReportRangeQueryInput = z.infer<typeof reportRangeQuerySchema>;
