import { describe, expect, it } from "vitest";
import { configureOfflinePointOfSale } from "../fiscal/test-support/offline-point-of-sale-fixtures.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildChangesRouteApp, pulledPage } from "../sync/test-support/changes-route.js";
import { SESSION_NOON } from "../test-support/backoffice-session.js";
import {
  registerWithTicketKey,
  rescueRouteUnderTest,
  rescueSession,
  rescuing,
} from "./test-support/contingency-backup-ticket-rescue-route.js";
import { ticketEvent } from "./test-support/sealed-contingency-backup-ticket.js";

const OFFLINE_POINT_OF_SALE = 8;
const route = rescueRouteUnderTest();

function offlineDocumentEvent(
  registerId: string,
  deviceSeq: number,
  number: number,
  documentType: "factura_c" | "credit_note_c" = "factura_c",
) {
  const saleId = crypto.randomUUID();
  return ticketEvent(deviceSeq, {
    aggregate_id: saleId,
    event_type: "offline_fiscal_document_issued",
    payload: {
      fiscal_document_id: crypto.randomUUID(),
      sale_id: saleId,
      register_id: registerId,
      point_of_sale: OFFLINE_POINT_OF_SALE,
      document_type: documentType,
      number,
      issued_on: "2026-10-06",
      generated_at: "2026-10-06T11:20:00.000Z",
      generation_stamp: "20261006082000",
      offline_authorization_code: "21403471111111",
      fortnight_start: "2026-10-01",
      fortnight_end: "2026-10-15",
      buyer_document_type: 99,
      buyer_document_number: 0,
      buyer_tax_status_code: 5,
      total: 4800,
      net_amount: 4800,
      cause: "no_connectivity",
    },
    occurred_at: "2026-10-06T11:20:00.000Z",
  });
}

async function offlineRegisterWithDeadInstallation() {
  const registerId = await configureOfflinePointOfSale(route.db, {
    registerName: "Caja 1",
    realTimePointOfSale: 7,
    offlinePointOfSale: OFFLINE_POINT_OF_SALE,
    now: SESSION_NOON,
  });
  const dead = await registerWithTicketKey(route.db, {
    existingRegisterId: registerId,
    revokedAt: new Date("2026-01-04T12:00:00.000Z"),
  });
  const { deviceToken } = await insertEnrolledInstallation(route.db, {
    now: SESSION_NOON,
    existingRegisterId: registerId,
  });
  return { registerId, dead, deviceToken };
}

async function pulledOfflinePointOfSale(deviceToken: string) {
  const pulls = buildChangesRouteApp(route.db, { now: () => SESSION_NOON });
  const page = await pulledPage(pulls, 0, deviceToken);
  await pulls.close();
  const [change] = page.changes.filter(
    (candidate) => candidate.entity === "register_offline_point_of_sale",
  );
  if (change === undefined || !("row" in change)) {
    throw new Error("the pull carried no offline point of sale");
  }
  return change.row as {
    series_counts: { document_type: string; highest_synced_offline_number: number | null }[];
  };
}

function highestSynced(
  row: Awaited<ReturnType<typeof pulledOfflinePointOfSale>>,
  documentType: string,
) {
  return row.series_counts.find((entry) => entry.document_type === documentType)
    ?.highest_synced_offline_number;
}

describe("rescuing the tickets of an installation that died offline", () => {
  it("fixes the highest synced number from the vouchers recovered, whichever tickets are missing", async () => {
    const { registerId, dead, deviceToken } = await offlineRegisterWithDeadInstallation();
    const session = await rescueSession(route.db);

    await rescuing(route, session, dead.seal([offlineDocumentEvent(registerId, 3, 5)]));
    await rescuing(route, session, dead.seal([offlineDocumentEvent(registerId, 7, 9)]));

    const row = await pulledOfflinePointOfSale(deviceToken);
    expect(highestSynced(row, "factura_c")).toBe(9);
    expect(highestSynced(row, "credit_note_c")).toBeNull();
  });

  it("keeps the numbering of each document type apart", async () => {
    const { registerId, dead, deviceToken } = await offlineRegisterWithDeadInstallation();
    const session = await rescueSession(route.db);

    await rescuing(
      route,
      session,
      dead.seal([
        offlineDocumentEvent(registerId, 2, 12),
        offlineDocumentEvent(registerId, 3, 4, "credit_note_c"),
      ]),
    );

    const row = await pulledOfflinePointOfSale(deviceToken);
    expect(highestSynced(row, "factura_c")).toBe(12);
    expect(highestSynced(row, "credit_note_c")).toBe(4);
  });

  it("neither abandons nor registers anew the point of sale", async () => {
    const { registerId, dead, deviceToken } = await offlineRegisterWithDeadInstallation();
    const session = await rescueSession(route.db);
    const before = await pulledOfflinePointOfSale(deviceToken);

    await rescuing(route, session, dead.seal([offlineDocumentEvent(registerId, 3, 5)]));

    const { series_counts: _beforeCounts, ...pointOfSaleBefore } = before;
    const { series_counts: _afterCounts, ...pointOfSaleAfter } =
      await pulledOfflinePointOfSale(deviceToken);
    expect(pointOfSaleAfter).toEqual(pointOfSaleBefore);
  });

  it("leaves the highest number as it was when a ticket is scanned a second time", async () => {
    const { registerId, dead, deviceToken } = await offlineRegisterWithDeadInstallation();
    const session = await rescueSession(route.db);
    const codes = dead.seal([offlineDocumentEvent(registerId, 3, 5)]);
    await rescuing(route, session, codes);

    const second = await rescuing(route, session, codes);

    expect(second.json()).toMatchObject({ received: 0, already_received: 1 });
    expect(highestSynced(await pulledOfflinePointOfSale(deviceToken), "factura_c")).toBe(5);
  });

  it("names the vouchers a ticket carries in the answer", async () => {
    const { registerId, dead } = await offlineRegisterWithDeadInstallation();
    const session = await rescueSession(route.db);

    const response = await rescuing(
      route,
      session,
      dead.seal([offlineDocumentEvent(registerId, 3, 5)]),
    );

    expect(response.json().summary.vouchers).toEqual([
      { point_of_sale: OFFLINE_POINT_OF_SALE, document_type: "factura_c", number: 5 },
    ]);
  });
});
