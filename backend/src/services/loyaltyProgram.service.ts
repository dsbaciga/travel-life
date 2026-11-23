import prisma from '../config/database';
import { AppError } from '../errors/errors';
import {
  CreateLoyaltyProgramInput,
  UpdateLoyaltyProgramInput,
  LoyaltyProgramResponse,
} from '../types/loyaltyProgram.types';
import { buildConditionalUpdateData } from '../services/_shared/prismaUpdateData';
import { Prisma, LoyaltyProgram } from '@prisma/client';

function toResponse(program: LoyaltyProgram): LoyaltyProgramResponse {
  return {
    id: program.id,
    userId: program.userId,
    name: program.name,
    type: program.type,
    providerName: program.providerName,
    providerCode: program.providerCode,
    alliance: program.alliance,
    aliases: program.aliases,
    membershipNumber: program.membershipNumber,
    tier: program.tier,
    pointsBalance: program.pointsBalance,
    notes: program.notes,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
  };
}

class LoyaltyProgramService {
  async create(userId: number, data: CreateLoyaltyProgramInput): Promise<LoyaltyProgramResponse> {
    const program = await prisma.loyaltyProgram.create({
      data: {
        userId,
        name: data.name,
        type: data.type,
        providerName: data.providerName,
        providerCode: data.providerCode || null,
        alliance: data.alliance || null,
        aliases: data.aliases ?? [],
        membershipNumber: data.membershipNumber,
        tier: data.tier || null,
        pointsBalance: data.pointsBalance ?? null,
        notes: data.notes || null,
      },
    });

    return toResponse(program);
  }

  async getAll(userId: number): Promise<LoyaltyProgramResponse[]> {
    const programs = await prisma.loyaltyProgram.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { providerName: 'asc' }, { name: 'asc' }],
    });

    return programs.map(toResponse);
  }

  async getById(userId: number, programId: number): Promise<LoyaltyProgramResponse> {
    const program = await prisma.loyaltyProgram.findFirst({
      where: { id: programId, userId },
    });

    if (!program) {
      throw new AppError("We couldn't find that loyalty program.", 404);
    }

    return toResponse(program);
  }

  async update(
    userId: number,
    programId: number,
    data: UpdateLoyaltyProgramInput
  ): Promise<LoyaltyProgramResponse> {
    const existing = await prisma.loyaltyProgram.findFirst({
      where: { id: programId, userId },
    });

    if (!existing) {
      throw new AppError("We couldn't find that loyalty program.", 404);
    }

    const updateData: Prisma.LoyaltyProgramUncheckedUpdateInput = buildConditionalUpdateData(data);

    const program = await prisma.loyaltyProgram.update({
      where: { id: programId },
      data: updateData,
    });

    return toResponse(program);
  }

  async delete(userId: number, programId: number): Promise<void> {
    const existing = await prisma.loyaltyProgram.findFirst({
      where: { id: programId, userId },
    });

    if (!existing) {
      throw new AppError("We couldn't find that loyalty program.", 404);
    }

    // Bookings that referenced it fall back to no program (ON DELETE SET NULL)
    await prisma.loyaltyProgram.delete({ where: { id: programId } });
  }

  /**
   * Guard for bookings: a transportation or lodging record may only reference a program
   * that belongs to the user making the change. Without this a collaborator could point a
   * booking at someone else's program id.
   */
  async assertOwnedBy(userId: number, programId: number): Promise<void> {
    const program = await prisma.loyaltyProgram.findFirst({
      where: { id: programId, userId },
      select: { id: true },
    });

    if (!program) {
      throw new AppError("We couldn't find that loyalty program.", 404);
    }
  }
}

export default new LoyaltyProgramService();
