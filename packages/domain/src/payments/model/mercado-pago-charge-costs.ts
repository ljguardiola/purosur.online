import {
  argentinaCalendarDay,
  compareCodeUnits,
  compareSpanishText,
  type ZoneRules,
} from "../../shared/index.js";
import {
  type ChargeCost,
  chargeCostOf,
  type SettlementMovement,
} from "./mercado-pago-settlement.js";
import { MERCADO_PAGO_PAYMENT_METHODS, type MercadoPagoPaymentMethod } from "./payment.js";

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
type ChargeCostsOfMethod = { method: MercadoPagoPaymentMethod } & ChargeCostEntry;
type ChargeCostsOfRegister = { registerId: string; registerName: string } & ChargeCostEntry;

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
  method: MercadoPagoPaymentMethod;
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

export function summarizeChargeCosts({
  charges,
  rules,
}: {
  charges: readonly OwnChargeInput[];
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
  const counted: readonly Counted[] = lines.map((line) => ({
    day: argentinaCalendarDay(line.chargedAt, rules),
    method: line.method,
    cost: line.cost,
  }));
  const totals = emptyEntry();
  for (const item of counted) {
    add(totals, item.cost);
  }
  const byRegister = new Map<string, ChargeCostsOfRegister>();
  for (const line of lines) {
    const group = byRegister.get(line.registerId) ?? {
      registerId: line.registerId,
      registerName: line.registerName,
      ...emptyEntry(),
    };
    add(group, line.cost);
    byRegister.set(line.registerId, group);
  }
  const byMethod = groupBy(counted, (item) => item.method);

  return {
    charges: lines.sort((a, b) => b.chargedAt.getTime() - a.chargedAt.getTime()),
    days: [...groupBy(counted, (item) => item.day)]
      .sort(([a], [b]) => compareCodeUnits(a, b))
      .map(([day, entry]) => ({ day, ...entry })),
    months: [...groupBy(counted, (item) => item.day.slice(0, 7))]
      .sort(([a], [b]) => compareCodeUnits(a, b))
      .map(([month, entry]) => ({ month, ...entry })),
    methods: MERCADO_PAGO_PAYMENT_METHODS.flatMap((method) => {
      const entry = byMethod.get(method);
      return entry === undefined ? [] : [{ method, ...entry }];
    }),
    registers: [...byRegister.values()].sort((a, b) =>
      compareSpanishText(a.registerName, b.registerName),
    ),
    totals,
  };
}
