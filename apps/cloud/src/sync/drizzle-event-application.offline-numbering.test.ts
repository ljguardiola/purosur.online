import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { configureOfflinePointOfSale } from "../fiscal/test-support/offline-point-of-sale-fixtures.js";
import {
  insertAppliedOfflineDocument,
  insertReceivedOfflineDocumentEvent,
} from "../fiscal/test-support/synced-offline-documents.js";
import { changes, offlineNumberBlocks } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "./test-support/drizzle-event-application.js";
import { anOfflineFiscalDocumentFact } from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();
const OFFLINE_POINT_OF_SALE = 8;

async function registerWithFirstBlock() {
  const registerId = await configureOfflinePointOfSale(system.db, {
    registerName: "Caja 1",
    realTimePointOfSale: 7,
    offlinePointOfSale: OFFLINE_POINT_OF_SALE,
    now: APPLICATION_NOW,
  });
  const { deviceId } = await insertEnrolledInstallation(system.db, {
    now: APPLICATION_NOW,
    existingRegisterId: registerId,
  });
  return { registerId, deviceId };
}

async function applyDocument(registerId: string, number: number) {
  await insertAppliedOfflineDocument(system.db, registerId, {
    pointOfSale: OFFLINE_POINT_OF_SALE,
    number,
  });
  const { document } = anOfflineFiscalDocumentFact({
    registerId,
    pointOfSale: OFFLINE_POINT_OF_SALE,
    number,
  });
  await system.application.transaction((tx) => tx.advanceOfflineNumbering(document));
}

async function blocks() {
  return system.db
    .select({
      first: offlineNumberBlocks.firstNumber,
      last: offlineNumberBlocks.lastNumber,
      status: offlineNumberBlocks.status,
      version: offlineNumberBlocks.version,
    })
    .from(offlineNumberBlocks)
    .orderBy(asc(offlineNumberBlocks.firstNumber));
}

describe("advancing the offline numbering when an offline document is applied", () => {
  it("assigns the next contiguous block once the document reaches the last number of the block in use, marking that block used up", async () => {
    const { registerId } = await registerWithFirstBlock();

    await applyDocument(registerId, 1000);

    expect(await blocks()).toEqual([
      { first: 1, last: 1000, status: "used_up", version: 2 },
      { first: 1001, last: 2000, status: "in_use", version: 1 },
    ]);
  });

  it("assigns nothing for a document below the last number of the block in use", async () => {
    const { registerId } = await registerWithFirstBlock();

    await applyDocument(registerId, 999);

    expect(await blocks()).toEqual([{ first: 1, last: 1000, status: "in_use", version: 1 }]);
  });

  it("assigns the next block when a document received but not applied yet already reaches the last number", async () => {
    const { registerId, deviceId } = await registerWithFirstBlock();
    await insertReceivedOfflineDocumentEvent(
      system.db,
      { deviceId, registerId },
      { pointOfSale: OFFLINE_POINT_OF_SALE, number: 1000 },
      { quarantinedAt: APPLICATION_NOW },
    );

    await applyDocument(registerId, 998);

    expect(await blocks()).toEqual([
      { first: 1, last: 1000, status: "used_up", version: 2 },
      { first: 1001, last: 2000, status: "in_use", version: 1 },
    ]);
  });

  it("assigns no second block when another document of the used up block is applied", async () => {
    const { registerId } = await registerWithFirstBlock();

    await applyDocument(registerId, 1000);
    await applyDocument(registerId, 1001);

    expect(await blocks()).toHaveLength(2);
  });

  it("keeps one block in use when documents use up several blocks one after another", async () => {
    const { registerId } = await registerWithFirstBlock();

    await applyDocument(registerId, 1000);
    await applyDocument(registerId, 2000);

    expect(await blocks()).toEqual([
      { first: 1, last: 1000, status: "used_up", version: 2 },
      { first: 1001, last: 2000, status: "used_up", version: 2 },
      { first: 2001, last: 3000, status: "in_use", version: 1 },
    ]);
  });

  it("notes the used up block and the new one for the register, so its next pull carries both", async () => {
    const { registerId } = await registerWithFirstBlock();

    await applyDocument(registerId, 1000);

    const logged = await system.db
      .select({ op: changes.op, version: changes.version, registerId: changes.registerId })
      .from(changes)
      .where(eq(changes.entity, "offline_number_block"))
      .orderBy(asc(changes.changeSeq));
    expect(logged).toEqual([
      { op: "insert", version: 1, registerId },
      { op: "update", version: 2, registerId },
      { op: "insert", version: 1, registerId },
    ]);
  });

  it("assigns nothing for a point of sale with no block", async () => {
    const { registerId } = await registerWithFirstBlock();
    const { document } = anOfflineFiscalDocumentFact({ registerId, pointOfSale: 31, number: 5000 });

    await system.application.transaction((tx) => tx.advanceOfflineNumbering(document));

    expect(await blocks()).toEqual([{ first: 1, last: 1000, status: "in_use", version: 1 }]);
  });
});
