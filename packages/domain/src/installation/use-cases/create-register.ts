import { type BranchRegisterStore, RegisterNameConflict } from "./branch-register-store.js";

export interface CreateRegisterInput {
  locationId: string;
  name: string;
  actorId: string;
}

export type CreateRegisterOutcome =
  | { kind: "name_taken" }
  | { kind: "created"; register: { id: string; name: string } };

export async function createRegister(
  store: BranchRegisterStore,
  input: CreateRegisterInput,
): Promise<CreateRegisterOutcome> {
  try {
    return await store.transaction<CreateRegisterOutcome>(async (tx) => {
      if (await tx.registerNameTaken(input.locationId, input.name)) {
        return { kind: "name_taken" };
      }

      const { id } = await tx.recordRegister({ locationId: input.locationId, name: input.name });
      await tx.recordRegisterCreation({
        registerId: id,
        locationId: input.locationId,
        name: input.name,
        actorId: input.actorId,
      });

      return { kind: "created", register: { id, name: input.name } };
    });
  } catch (error) {
    if (!(error instanceof RegisterNameConflict)) {
      throw error;
    }
    return { kind: "name_taken" };
  }
}
