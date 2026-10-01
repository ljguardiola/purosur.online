import { isPointOfSaleNumber } from "@purosur/domain";
import { z } from "zod";

export const pointOfSaleNumberSchema = z.int().refine(isPointOfSaleNumber);
