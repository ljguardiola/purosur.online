import { isEmailAddress } from "@purosur/domain";
import { z } from "zod";

const MESSAGE = "email must look like local@domain";

export const emailAddressSchema = z
  .string({ error: MESSAGE })
  .trim()
  .toLowerCase()
  .refine(isEmailAddress, MESSAGE);
