import type { IdGenerator } from "@purosur/domain/register/use-cases";
import { v7 } from "uuid";

export const uuidV7Ids: IdGenerator = { next: () => v7() };
