
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";
import type { CreateSlotInput } from "../validators/slot.schema.js";

export async function createSlot(input: CreateSlotInput) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: input.clinicId },
    select: { id: true },
  });

  if (!clinic) {
    throw new AppError(404, "CLINIC_NOT_FOUND", "Clinic not found.");
  }

  return prisma.slot.create({
    data: {
      clinicId: input.clinicId,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    },
  });
}

export async function listSlots(filters: {
  clinicId?: string;
  status?: "AVAILABLE" | "CANCELLED";
  from?: string;
  to?: string;
}) {
  const slots = await prisma.slot.findMany({
    where: {
      ...(filters.clinicId && { clinicId: filters.clinicId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.from && {
        startsAt: { gte: new Date(filters.from) },
      }),
      ...(filters.to && {
        startsAt: { lt: new Date(filters.to) },
      }),
    },
    orderBy: { startsAt: "asc" },
    take: 100,
  });

  return slots;
}

export async function getSlot(id: string) {
  const slot = await prisma.slot.findUnique({
    where: { id },
    include: {
      bookings: {
        where: { status: "CONFIRMED" },
        select: { id: true },
      },
    },
  });

  if (!slot) {
    throw new AppError(404, "SLOT_NOT_FOUND", "Slot not found.");
  }

  const { bookings, ...slotData } = slot;

  return {
    ...slotData,
    isBooked: bookings.length > 0,
  };
}
