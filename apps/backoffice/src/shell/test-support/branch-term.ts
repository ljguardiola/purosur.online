import { vi } from "vitest";
import type { BranchSettings } from "../../branch/branch-settings-api";
import type { BranchTermServices } from "../branch-term-services";

export const BRANCH_SETTINGS: BranchSettings = {
  address: "Av. Belgrano 1450, CABA",
  whatsappNumber: "+54 9 11 3333-2211",
  instagramHandle: "@purosur.dietetica",
  hours: {
    monday: [
      { opensAt: "09:00", closesAt: "13:00" },
      { opensAt: "17:00", closesAt: "21:00" },
    ],
    tuesday: [{ opensAt: "09:00", closesAt: "20:00" }],
    wednesday: [{ opensAt: "09:00", closesAt: "20:00" }],
    thursday: [{ opensAt: "09:00", closesAt: "20:00" }],
    friday: [{ opensAt: "09:00", closesAt: "20:00" }],
    saturday: [{ opensAt: "09:00", closesAt: "13:30" }],
    sunday: [],
  },
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 45,
  goodConditionReturnDays: 15,
  supplierPriceListDailyExtractionCap: 10,
  zoneRulesVersion: "2026a",
  version: 3,
};

export const SAVED_SETTINGS_REQUEST = {
  address: "Av. Belgrano 1450, CABA",
  whatsapp_number: "+54 9 11 3333-2211",
  instagram_handle: "@purosur.dietetica",
  monday_hours: [
    { opens_at: "09:00", closes_at: "13:00" },
    { opens_at: "17:00", closes_at: "21:00" },
  ],
  tuesday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  wednesday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  thursday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  friday_hours: [{ opens_at: "09:00", closes_at: "20:00" }],
  saturday_hours: [{ opens_at: "09:00", closes_at: "13:30" }],
  sunday_hours: [],
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 45,
  good_condition_return_days: 15,
  supplier_price_list_daily_extraction_cap: 10,
  version: 3,
};

export function createBranchTermServices(
  overrides: Partial<BranchTermServices> = {},
): BranchTermServices {
  return {
    fetchBranchSettings: vi.fn().mockResolvedValue({ kind: "ok", value: BRANCH_SETTINGS }),
    saveBranchSettings: vi.fn().mockResolvedValue({ kind: "ok" }),
    fetchGoodConditionReturnDays: vi.fn().mockResolvedValue({ kind: "ok", value: 15 }),
    fetchSupplierPriceListDailyCap: vi.fn().mockResolvedValue({ kind: "ok", value: 10 }),
    ...overrides,
  };
}
