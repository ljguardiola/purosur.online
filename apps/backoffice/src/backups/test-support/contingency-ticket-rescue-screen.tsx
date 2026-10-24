import {
  type ContingencyBackupTicketRescueResponse,
  contingencyBackupTicketQrCodes,
} from "@purosur/contracts";
import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { ContingencyTicketRescueScreen } from "../contingency-ticket-rescue-screen";
import type { ContingencyTicketRescueScreenServices } from "../contingency-ticket-rescue-services";
import { createFakeQrScanner } from "./fake-qr-scanner";

export type RescuedResponse = Extract<
  ContingencyBackupTicketRescueResponse,
  { outcome: "rescued" }
>;

export function createServices() {
  const scanner = createFakeQrScanner();
  const services: ContingencyTicketRescueScreenServices = {
    rescueContingencyBackupTicket: vi.fn(),
    scanner: scanner.Scanner,
  };
  return { services, scanner };
}

export function renderScreen(
  services: ContingencyTicketRescueScreenServices,
  onSessionEnded: () => void = vi.fn(),
) {
  return render(
    <ContingencyTicketRescueScreen onSessionEnded={onSessionEnded} services={services} />,
  );
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const REGISTER_ID = "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11";

export function ticketCodes(parts: number, nonceByte = 1): string[] {
  return contingencyBackupTicketQrCodes({
    registerId: REGISTER_ID,
    keyVersion: 1,
    nonce: new Uint8Array(12).fill(nonceByte),
    sealed: new Uint8Array(parts * 500).fill(nonceByte),
  });
}

export const rescuedSale: RescuedResponse = {
  outcome: "rescued",
  register_id: REGISTER_ID,
  register_name: "Caja 1",
  received: 3,
  already_received: 0,
  summary: {
    operation: "sale",
    occurred_at: "2026-09-14T20:22:00.000Z",
    vouchers: [{ point_of_sale: 4, document_type: "factura_c", number: 301 }],
    sale_total: 894_000,
  },
};

export const rescuedEarlierSale: RescuedResponse = {
  ...rescuedSale,
  summary: {
    ...rescuedSale.summary,
    occurred_at: "2026-09-14T20:05:00.000Z",
    vouchers: [{ point_of_sale: 4, document_type: "factura_c", number: 300 }],
    sale_total: 320_000,
  },
};
