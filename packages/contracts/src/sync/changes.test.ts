import { describe, expect, it } from "vitest";
import { changesPageSchema, changesQuerySchema } from "./changes.js";

const settingsRow = {
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
  version: 3,
};

function branchSettingsChange(changeSeq: number) {
  return {
    change_seq: changeSeq,
    entity: "branch_settings",
    entity_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
    row: settingsRow,
  };
}

describe("changesQuerySchema", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("reads since=%s as the cursor %s", (since, cursor) => {
    expect(changesQuerySchema.parse({ since })).toEqual({ since: cursor });
  });

  it.each([
    ["missing", {}],
    ["negative", { since: "-1" }],
    ["fractional", { since: "1.5" }],
    ["written with a leading zero", { since: "01" }],
    ["written with an exponent", { since: "1e3" }],
    ["empty", { since: "" }],
    ["not a number", { since: "abc" }],
    ["beyond a safe integer", { since: "9007199254740992" }],
    ["repeated", { since: ["1", "2"] }],
  ])("refuses a since that is %s, naming the field", (_case, query) => {
    const result = changesQuerySchema.safeParse(query);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["since"]);
    expect(result.error?.issues[0]?.message).toBe(
      "since must be the cursor of the last page already pulled, 0 the first time",
    );
  });
});

describe("changesPageSchema", () => {
  it("accepts a page of branch settings changes with its cursor and whether more wait", () => {
    const page = { changes: [branchSettingsChange(4)], cursor: 4, has_more: true };

    expect(changesPageSchema.parse(page)).toEqual(page);
  });

  it("accepts an empty last page", () => {
    const page = { changes: [], cursor: 0, has_more: false };

    expect(changesPageSchema.parse(page)).toEqual(page);
  });

  it("accepts exactly 500 changes", () => {
    const changes = Array.from({ length: 500 }, (_, index) => branchSettingsChange(index + 1));

    expect(changesPageSchema.safeParse({ changes, cursor: 500, has_more: true }).success).toBe(
      true,
    );
  });

  it("refuses more than 500 changes", () => {
    const changes = Array.from({ length: 501 }, (_, index) => branchSettingsChange(index + 1));

    expect(changesPageSchema.safeParse({ changes, cursor: 501, has_more: true }).success).toBe(
      false,
    );
  });

  it.each([
    ["a negative cursor", { changes: [], cursor: -1, has_more: false }],
    ["a fractional cursor", { changes: [], cursor: 1.5, has_more: false }],
    [
      "a change of an entity it does not know",
      {
        changes: [{ ...branchSettingsChange(1), entity: "unknown" }],
        cursor: 1,
        has_more: false,
      },
    ],
    [
      "a change with no sequence number",
      {
        changes: [{ ...branchSettingsChange(1), change_seq: 0 }],
        cursor: 1,
        has_more: false,
      },
    ],
    [
      "a branch settings row without its version",
      {
        changes: [{ ...branchSettingsChange(1), row: { ...settingsRow, version: undefined } }],
        cursor: 1,
        has_more: false,
      },
    ],
    ["no has_more", { changes: [], cursor: 0 }],
  ])("refuses %s", (_case, page) => {
    expect(changesPageSchema.safeParse(page).success).toBe(false);
  });
});
