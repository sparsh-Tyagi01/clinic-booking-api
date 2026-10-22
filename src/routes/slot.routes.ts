
import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { AppError } from "../errors/app-error.js";
import {
  createSlotSchema,
  listSlotsSchema,
} from "../validators/slot.schema.js";
import {
  createSlot,
  listSlots,
  getSlot,
} from "../services/slot.service.js";
import { cancelSlot } from "../services/slot-cancel.service.js";

export const slotRouter = Router();

slotRouter.post(
  "/",
  validateBody(createSlotSchema),
  async (req, res, next) => {
    try {
      const slot = await createSlot(req.body);
      res.status(201).json({ data: slot });
    } catch (error) {
      next(error);
    }
  },
);

slotRouter.get("/", async (req, res, next) => {
  try {
    const filters = listSlotsSchema.parse(req.query);
    const slots = await listSlots(filters);
    res.status(200).json({ data: slots });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(
        400,
        "VALIDATION_ERROR",
        "Invalid query parameters.",
        error.issues,
      ));
      return;
    }
    next(error);
  }
});

slotRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = z.object({
      id: z.string().uuid(),
    }).parse(req.params);

    const slot = await getSlot(id);
    res.status(200).json({ data: slot });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, "VALIDATION_ERROR", "Invalid slot ID."));
      return;
    }
    next(error);
  }
});

slotRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = z.object({
      id: z.string().uuid(),
    }).parse(req.params);

    const slot = await cancelSlot(id);
    res.status(200).json({ data: slot });
  } catch (error) {
    next(error);
  }
});
