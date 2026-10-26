import { contingencyBackupTicketQrCodes } from "@purosur/contracts";
import { expect, test } from "vitest";
import { NO_PENDING_TICKETS, scanTicketCode } from "./ticket-scan";

const REGISTER_ID = "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11";

function ticketCodes(parts: number, nonceByte = 1, keyVersion = 1): string[] {
  const codes = contingencyBackupTicketQrCodes({
    registerId: REGISTER_ID,
    keyVersion,
    nonce: new Uint8Array(12).fill(nonceByte),
    sealed: new Uint8Array(parts * 500).fill(nonceByte),
  });
  expect(codes).toHaveLength(parts);
  return codes;
}

test("a ticket of one code is complete as soon as it is read", () => {
  const [only] = ticketCodes(1);

  expect(scanTicketCode(NO_PENDING_TICKETS, only ?? "")).toEqual({
    kind: "complete",
    pending: NO_PENDING_TICKETS,
    qrCodes: [only],
  });
});

test("a text that is not a code of this system is unreadable and leaves what was read as it was", () => {
  const [first] = ticketCodes(2);
  const afterFirst = scanTicketCode(NO_PENDING_TICKETS, first ?? "");
  if (afterFirst.kind !== "waiting") {
    throw new Error("the first of two codes must wait for the second");
  }

  expect(scanTicketCode(afterFirst.pending, "https://example.com")).toEqual({
    kind: "unreadable",
  });
});

test("a ticket of several codes waits for each one and counts how many were read", () => {
  const [first, second, third] = ticketCodes(3);

  const afterFirst = scanTicketCode(NO_PENDING_TICKETS, first ?? "");
  expect(afterFirst).toMatchObject({ kind: "waiting", read: 1, of: 3 });
  if (afterFirst.kind !== "waiting") {
    throw new Error("unreachable");
  }
  const afterSecond = scanTicketCode(afterFirst.pending, second ?? "");
  expect(afterSecond).toMatchObject({ kind: "waiting", read: 2, of: 3 });
  if (afterSecond.kind !== "waiting") {
    throw new Error("unreachable");
  }
  expect(scanTicketCode(afterSecond.pending, third ?? "")).toEqual({
    kind: "complete",
    pending: NO_PENDING_TICKETS,
    qrCodes: [first, second, third],
  });
});

test("the codes of a complete ticket are in the order of their parts however they were read", () => {
  const [first, second, third] = ticketCodes(3);
  let pending = NO_PENDING_TICKETS;
  for (const code of [third ?? "", first ?? ""]) {
    const step = scanTicketCode(pending, code);
    if (step.kind !== "waiting") {
      throw new Error("the ticket cannot be complete yet");
    }
    pending = step.pending;
  }

  expect(scanTicketCode(pending, second ?? "")).toMatchObject({
    kind: "complete",
    qrCodes: [first, second, third],
  });
});

test("a code already read is ignored", () => {
  const [first] = ticketCodes(2);
  const afterFirst = scanTicketCode(NO_PENDING_TICKETS, first ?? "");
  if (afterFirst.kind !== "waiting") {
    throw new Error("the first of two codes must wait for the second");
  }

  expect(scanTicketCode(afterFirst.pending, first ?? "")).toEqual({ kind: "already_read" });
});

test("codes of different tickets are kept apart while both are in progress", () => {
  const [oneFirst, oneSecond] = ticketCodes(2, 1);
  const [otherFirst, otherSecond] = ticketCodes(2, 2);
  let pending = NO_PENDING_TICKETS;
  for (const code of [oneFirst ?? "", otherFirst ?? ""]) {
    const step = scanTicketCode(pending, code);
    if (step.kind !== "waiting") {
      throw new Error("the ticket cannot be complete yet");
    }
    expect(step).toMatchObject({ read: 1, of: 2 });
    pending = step.pending;
  }

  const one = scanTicketCode(pending, oneSecond ?? "");
  expect(one).toMatchObject({ kind: "complete", qrCodes: [oneFirst, oneSecond] });
  if (one.kind !== "complete") {
    throw new Error("unreachable");
  }
  expect(scanTicketCode(one.pending, otherSecond ?? "")).toMatchObject({
    kind: "complete",
    qrCodes: [otherFirst, otherSecond],
  });
});

test("codes sealed with another version of the key are another ticket", () => {
  const [firstV1] = ticketCodes(2, 1, 1);
  const [firstV2] = ticketCodes(2, 1, 2);
  const afterV1 = scanTicketCode(NO_PENDING_TICKETS, firstV1 ?? "");
  if (afterV1.kind !== "waiting") {
    throw new Error("the first of two codes must wait for the second");
  }

  expect(scanTicketCode(afterV1.pending, firstV2 ?? "")).toMatchObject({
    kind: "waiting",
    read: 1,
    of: 2,
  });
});

test("codes numbered for another count of parts are another ticket", () => {
  const [firstOfTwo] = ticketCodes(2, 1);
  const [, secondOfThree] = ticketCodes(3, 1);
  const afterFirst = scanTicketCode(NO_PENDING_TICKETS, firstOfTwo ?? "");
  if (afterFirst.kind !== "waiting") {
    throw new Error("the first of two codes must wait for the second");
  }

  expect(scanTicketCode(afterFirst.pending, secondOfThree ?? "")).toMatchObject({
    kind: "waiting",
    read: 1,
    of: 3,
  });
});
