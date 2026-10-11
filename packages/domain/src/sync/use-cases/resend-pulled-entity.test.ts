import { describe, expect, it } from "vitest";
import { pullAudienceOfEntity } from "../model/pull-audience.js";
import { resendPulledEntity } from "./resend-pulled-entity.js";
import { FakeChangeLog, type FakeLoggedChange } from "./test-support/fake-change-log.js";

const DEVICE = "device-1";
const INSTALLED_REGISTER = {
  registerId: "register-1",
  locationId: "branch-a",
  priceListId: "price-list-a",
};

const ownPointOfSale: FakeLoggedChange = {
  changeSeq: 2,
  entity: "register_point_of_sale",
  entityId: "register-1",
};
const otherPointOfSale: FakeLoggedChange = {
  changeSeq: 4,
  entity: "register_point_of_sale",
  entityId: "register-2",
};
const laterOwnPointOfSale: FakeLoggedChange = {
  changeSeq: 6,
  entity: "register_point_of_sale",
  entityId: "register-1",
};

function fakeChangeLog(changes: FakeLoggedChange[]): FakeChangeLog {
  return new FakeChangeLog(changes, { [DEVICE]: INSTALLED_REGISTER });
}

function resend(changeLog: FakeChangeLog, since: number) {
  return resendPulledEntity(
    { changeLog },
    { deviceId: DEVICE, since, entity: "register_point_of_sale" },
  );
}

describe("resending the changes of one entity", () => {
  it("gives only the changes of that entity the register may pull", async () => {
    const changeLog = fakeChangeLog([
      { changeSeq: 1, entity: "category", entityId: "category-1" },
      ownPointOfSale,
      { changeSeq: 3, entity: "register", entityId: "register-1" },
      otherPointOfSale,
      laterOwnPointOfSale,
    ]);

    const page = await resend(changeLog, 0);

    expect(page).toEqual({
      changes: [ownPointOfSale, laterOwnPointOfSale],
      cursor: 6,
      hasMore: false,
    });
  });

  it("asks the change log for the register's reach of that entity alone", async () => {
    const changeLog = fakeChangeLog([ownPointOfSale]);

    await resend(changeLog, 0);

    expect(changeLog.readRequests).toEqual([
      {
        audience: pullAudienceOfEntity(INSTALLED_REGISTER, "register_point_of_sale"),
        since: 0,
        limit: 501,
      },
    ]);
  });

  it("gives only the changes after the cursor it is asked from, and keeps the cursor when none is left", async () => {
    const changeLog = fakeChangeLog([ownPointOfSale, laterOwnPointOfSale]);

    expect(await resend(changeLog, 2)).toEqual({
      changes: [laterOwnPointOfSale],
      cursor: 6,
      hasMore: false,
    });
    expect(await resend(changeLog, 6)).toEqual({ changes: [], cursor: 6, hasMore: false });
  });

  it("says more wait when more than a page of that entity does", async () => {
    const changes = Array.from({ length: 600 }, (_, index) => ({
      changeSeq: index + 1,
      entity: "register_point_of_sale" as const,
      entityId: "register-1",
    }));

    const page = await resend(fakeChangeLog(changes), 0);

    expect(page.changes).toHaveLength(500);
    expect(page).toMatchObject({ cursor: 500, hasMore: true });
  });

  it("records no pull of the device, which would tell the cloud the register is up to date", async () => {
    const changeLog = fakeChangeLog([ownPointOfSale]);

    await resend(changeLog, 0);

    expect(changeLog.state.observedPulls).toEqual([]);
    expect(changeLog.operations).toEqual(["transaction", "pullingRegister", "changesAfter"]);
  });
});
