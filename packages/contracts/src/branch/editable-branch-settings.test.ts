import { describe, expect, it } from "vitest";
import { branchSettingsSchema } from "../shared/index.js";
import { editableBranchSettingsSchema } from "./editable-branch-settings.js";

const settings = {
  address: "Av. Belgrano 1450, CABA",
  whatsapp_number: "+54 9 11 3333-2211",
  instagram_handle: "@purosur.dietetica",
  monday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
  tuesday_hours: [],
  wednesday_hours: [],
  thursday_hours: [],
  friday_hours: [],
  saturday_hours: [],
  sunday_hours: [],
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 1,
};

describe("editableBranchSettingsSchema", () => {
  it("accepts the branch settings with the supplier price list daily extraction cap", () => {
    const withCap = { ...settings, supplier_price_list_daily_extraction_cap: 10 };

    expect(editableBranchSettingsSchema.safeParse(withCap).data).toEqual(withCap);
  });

  it.each([undefined, 1.5, "10"])("rejects a cap of %s", (cap) => {
    const body = { ...settings, supplier_price_list_daily_extraction_cap: cap };

    expect(editableBranchSettingsSchema.safeParse(body).success).toBe(false);
  });

  it("leaves the settings registers pull without the cap", () => {
    const withCap = { ...settings, supplier_price_list_daily_extraction_cap: 10 };

    expect(branchSettingsSchema.safeParse(withCap).data).toEqual(settings);
  });
});
