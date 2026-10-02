import {
  ADJUSTMENT_REASONS,
  LOSS_REASONS,
  MANUAL_STOCK_MOVEMENT_KINDS,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";

export const STOCK_PERIOD_DAYS = [7, 30, 90] as const;

export type StockPeriodDays = (typeof STOCK_PERIOD_DAYS)[number];

const stockProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  saleUnit: z.enum(SALE_UNITS),
});

export const stockProductListSchema = z.object({ products: z.array(stockProductSchema) });

export type StockProduct = z.output<typeof stockProductSchema>;
export type StockProductList = z.output<typeof stockProductListSchema>;

export const stockBalanceSchema = stockProductSchema.extend({ balance: z.int() });

export const stockBalanceListSchema = z.object({ products: z.array(stockBalanceSchema) });

export type StockBalance = z.output<typeof stockBalanceSchema>;
export type StockBalanceList = z.output<typeof stockBalanceListSchema>;

const stockCountSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  saleUnit: z.enum(SALE_UNITS),
  occurredAt: z.iso.datetime(),
  expected: z.int(),
  counted: z.int().nonnegative(),
  delta: z.int(),
  superseded: z.boolean(),
});

export const stockCountListSchema = z.object({ counts: z.array(stockCountSchema) });

export type StockCount = z.output<typeof stockCountSchema>;
export type StockCountList = z.output<typeof stockCountListSchema>;

const stockMovementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  categoryName: z.string(),
  saleUnit: z.enum(SALE_UNITS),
  kind: z.enum(MANUAL_STOCK_MOVEMENT_KINDS),
  reason: z.enum([...LOSS_REASONS, ...ADJUSTMENT_REASONS]),
  delta: z.int(),
  occurredAt: z.iso.datetime(),
  superseded: z.boolean(),
});

export const stockMovementListSchema = z.object({ movements: z.array(stockMovementSchema) });

export type StockMovement = z.output<typeof stockMovementSchema>;
export type StockMovementList = z.output<typeof stockMovementListSchema>;
