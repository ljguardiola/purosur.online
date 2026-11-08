import { argentinaCalendarDay, type ReportPeriod, type ZoneRules } from "../../shared/index.js";
import {
  type ChargeCost,
  chargeCostOf,
  type SettlementMovement,
} from "./mercado-pago-settlement.js";
import type { MercadoPagoPaymentMethod } from "./payment.js";

export const CHARGE_COST_METHODS = ["QR", "POINT", "OTHER"] as const satisfies readonly (
  | MercadoPagoPaymentMethod
  | "OTHER"
)[];

export type ChargeCostMethod = (typeof CHARGE_COST_METHODS)[number];

export interface OwnChargeInput {
  paymentTransactionId: string;
  saleId: string;
  method: MercadoPagoPaymentMethod;
  registerId: string;
  registerName: string;
  amount: number;
  chargedAt: Date;
  movements: SettlementMovement[];
}

export interface OtherChargeInput {
  sourceId: string;
  movements: SettlementMovement[];
}

export interface ChargeCostEntry {
  chargesCount: number;
  pendingCount: number;
  grossAmount: number;
  feeAmount: number;
  financingFeeAmount: number;
  taxesAmount: number;
  netAmount: number;
}

interface ChargeCostLine {
  paymentTransactionId: string;
  saleId: string;
  method: MercadoPagoPaymentMethod;
  registerId: string;
  registerName: string;
  amount: number;
  chargedAt: Date;
  cost: ChargeCost | null;
}

type ChargeCostsOfDay = { day: string } & ChargeCostEntry;
type ChargeCostsOfMonth = { month: string } & ChargeCostEntry;
type ChargeCostsOfMethod = { method: ChargeCostMethod } & ChargeCostEntry;
type ChargeCostsOfRegister = {
  registerId: string | null;
  registerName: string | null;
} & ChargeCostEntry;

export interface ChargeCostsSummary {
  charges: ChargeCostLine[];
  days: ChargeCostsOfDay[];
  months: ChargeCostsOfMonth[];
  methods: ChargeCostsOfMethod[];
  registers: ChargeCostsOfRegister[];
  totals: ChargeCostEntry;
}

interface Counted {
  day: string;
  method: ChargeCostMethod;
  cost: ChargeCost | null;
}

function emptyEntry(): ChargeCostEntry {
  return {
    chargesCount: 0,
    pendingCount: 0,
    grossAmount: 0,
    feeAmount: 0,
    financingFeeAmount: 0,
    taxesAmount: 0,
    netAmount: 0,
  };
}

function add(entry: ChargeCostEntry, cost: ChargeCost | null): void {
  entry.chargesCount += 1;
  if (cost === null) {
    entry.pendingCount += 1;
    return;
  }
  entry.grossAmount += cost.grossAmount;
  entry.feeAmount += cost.feeAmount;
  entry.financingFeeAmount += cost.financingFeeAmount;
  entry.taxesAmount += cost.taxesAmount;
  entry.netAmount += cost.netAmount;
}

function groupBy<Key extends string>(
  counted: readonly Counted[],
  keyOf: (item: Counted) => Key,
): Map<Key, ChargeCostEntry> {
  const groups = new Map<Key, ChargeCostEntry>();
  for (const item of counted) {
    const key = keyOf(item);
    const entry = groups.get(key) ?? emptyEntry();
    add(entry, item.cost);
    groups.set(key, entry);
  }
  return groups;
}

function earliestDate(movements: readonly SettlementMovement[]): Date | null {
  if (movements.length === 0) {
    return null;
  }
  return new Date(Math.min(...movements.map((movement) => movement.transactionDate.getTime())));
}

export function summarizeChargeCosts({
  charges,
  otherCharges,
  period,
  rules,
}: {
  charges: readonly OwnChargeInput[];
  otherCharges: readonly OtherChargeInput[];
  period: ReportPeriod;
  rules: ZoneRules;
}): ChargeCostsSummary {
  const lines: ChargeCostLine[] = charges.map((charge) => ({
    paymentTransactionId: charge.paymentTransactionId,
    saleId: charge.saleId,
    method: charge.method,
    registerId: charge.registerId,
    registerName: charge.registerName,
    amount: charge.amount,
    chargedAt: charge.chargedAt,
    cost: charge.movements.length === 0 ? null : chargeCostOf(charge.movements),
  }));
  const counted: Counted[] = lines.map((line) => ({
    day: argentinaCalendarDay(line.chargedAt, rules),
    method: line.method,
    cost: line.cost,
  }));
  for (const other of otherCharges) {
    const first = earliestDate(other.movements);
    if (first === null) {
      continue;
    }
    const day = argentinaCalendarDay(first, rules);
    if (day < period.from || day > period.to) {
      continue;
    }
    counted.push({
      day,
      method: "OTHER",
      cost: chargeCostOf(other.movements),
    });
  }

  const totals = emptyEntry();
  for (const item of counted) {
    add(totals, item.cost);
  }
  const byRegister = new Map<
    string,
    { registerId: string; registerName: string } & ChargeCostEntry
  >();
  for (const line of lines) {
    const group = byRegister.get(line.registerId) ?? {
      registerId: line.registerId,
      registerName: line.registerName,
      ...emptyEntry(),
    };
    add(group, line.cost);
    byRegister.set(line.registerId, group);
  }
  const otherChargesGroup = groupBy(
    counted.filter((item) => item.method === "OTHER"),
    () => "other",
  ).get("other");
  const byMethod = groupBy(counted, (item) => item.method);

  return {
    charges: lines.sort((a, b) => b.chargedAt.getTime() - a.chargedAt.getTime()),
    days: [...groupBy(counted, (item) => item.day)]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, entry]) => ({ day, ...entry })),
    months: [...groupBy(counted, (item) => item.day.slice(0, 7))]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, entry]) => ({ month, ...entry })),
    methods: CHARGE_COST_METHODS.flatMap((method) => {
      const entry = byMethod.get(method);
      return entry === undefined ? [] : [{ method, ...entry }];
    }),
    registers: [
      ...[...byRegister.values()].sort((a, b) => a.registerName.localeCompare(b.registerName)),
      ...(otherChargesGroup === undefined
        ? []
        : [{ registerId: null, registerName: null, ...otherChargesGroup }]),
    ],
    totals,
  };
}
