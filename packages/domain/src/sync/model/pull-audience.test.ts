import { describe, expect, it } from "vitest";
import {
  PULLED_ENTITIES,
  type PullAudience,
  pullAudienceOf,
  pullAudienceOfEntity,
} from "./pull-audience.js";

const REGISTER = "register-1";
const BRANCH = "branch-a";
const PRICE_LIST = "price-list-a";

describe("what a register may pull", () => {
  it("is its branch's settings, first cash session, users, stock movements, refund completions, price list and prices, its own register, points of sale, point terminal, QR point of sale and offline number blocks, and everything shared by every branch", () => {
    expect(
      pullAudienceOf({ registerId: REGISTER, locationId: BRANCH, priceListId: PRICE_LIST }),
    ).toEqual({
      branch_settings: { kind: "row", id: BRANCH },
      branch_first_cash_session: { kind: "row", id: BRANCH },
      category: { kind: "every_row" },
      product: { kind: "every_row" },
      tag: { kind: "every_row" },
      price_list: { kind: "row", id: PRICE_LIST },
      price: { kind: "rows_of_price_list", priceListId: PRICE_LIST },
      user: { kind: "rows_of_branch", locationId: BRANCH },
      role: { kind: "every_row" },
      register: { kind: "row", id: REGISTER },
      register_point_of_sale: { kind: "row", id: REGISTER },
      register_point_terminal: { kind: "row", id: REGISTER },
      register_qr_point_of_sale: { kind: "row", id: REGISTER },
      register_offline_point_of_sale: { kind: "row", id: REGISTER },
      discount: { kind: "every_row" },
      issuer_identification: { kind: "every_row" },
      buyer_identification_threshold: { kind: "every_row" },
      buyer_tax_status_set: { kind: "every_row" },
      stock_movement: { kind: "rows_of_branch", locationId: BRANCH },
      refund_completion: { kind: "rows_of_branch", locationId: BRANCH },
      offline_authorization_code: { kind: "every_row" },
      offline_number_block: { kind: "rows_of_register", registerId: REGISTER },
    } satisfies PullAudience);
  });

  it("holds no price list and no price while its branch sells with no price list", () => {
    const audience = pullAudienceOf({
      registerId: REGISTER,
      locationId: BRANCH,
      priceListId: null,
    });

    expect(audience.price_list).toEqual({ kind: "none" });
    expect(audience.price).toEqual({ kind: "none" });
  });
});

describe("what a register may pull of one entity", () => {
  const register = { registerId: REGISTER, locationId: BRANCH, priceListId: PRICE_LIST };

  it("is the register's reach of that entity and nothing of every other", () => {
    const whole = pullAudienceOf(register);

    for (const entity of PULLED_ENTITIES) {
      const audience = pullAudienceOfEntity(register, entity);

      for (const other of PULLED_ENTITIES) {
        expect(audience[other]).toEqual(other === entity ? whole[other] : { kind: "none" });
      }
    }
  });

  it("is nothing at all of an entity the register has no reach of", () => {
    const audience = pullAudienceOfEntity({ ...register, priceListId: null }, "price");

    expect(Object.values(audience)).toEqual(PULLED_ENTITIES.map(() => ({ kind: "none" })));
  });

  it("lists every entity the register may pull once", () => {
    expect([...PULLED_ENTITIES].sort()).toEqual(Object.keys(pullAudienceOf(register)).sort());
  });
});
