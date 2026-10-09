import { describe, expect, it } from "vitest";
import { type PullAudience, pullAudienceOf } from "./pull-audience.js";

const REGISTER = "register-1";
const BRANCH = "branch-a";
const PRICE_LIST = "price-list-a";

describe("what a register may pull", () => {
  it("is its branch's settings, users, stock movements, price list and prices, its own register and point of sale, and everything shared by every branch", () => {
    expect(
      pullAudienceOf({ registerId: REGISTER, locationId: BRANCH, priceListId: PRICE_LIST }),
    ).toEqual({
      branch_settings: { kind: "row", id: BRANCH },
      category: { kind: "every_row" },
      product: { kind: "every_row" },
      tag: { kind: "every_row" },
      price_list: { kind: "row", id: PRICE_LIST },
      price: { kind: "rows_of_price_list", priceListId: PRICE_LIST },
      user: { kind: "rows_of_branch", locationId: BRANCH },
      role: { kind: "every_row" },
      register: { kind: "row", id: REGISTER },
      register_point_of_sale: { kind: "row", id: REGISTER },
      discount: { kind: "every_row" },
      issuer_identification: { kind: "every_row" },
      buyer_identification_threshold: { kind: "every_row" },
      buyer_tax_status_set: { kind: "every_row" },
      stock_movement: { kind: "rows_of_branch", locationId: BRANCH },
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
