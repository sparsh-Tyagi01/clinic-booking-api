
import { z } from "zod";

export const createSlotSchema = z.object({
  clinicId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
}).strict().superRefine((data, ctx) => {
  if (new Date(data.endsAt) <= new Date(data.startsAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "Must be later than startsAt.",
    });
  }

  if (new Date(data.startsAt) <= new Date()) {
    ctx.addIssue({
      code: "custom",
      path: ["startsAt"],
      message: "Appointment must be in the future.",
    });
  }
});

export const listSlotsSchema = z.object({
  clinicId: z.string().uuid().optional(),
  status: z.enum(["AVAILABLE", "CANCELLED"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.from && data.to && new Date(data.from) >= new Date(data.to)) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "Must be later than from.",
    });
  }
});

export type CreateSlotInput = z.infer<typeof createSlotSchema>;
