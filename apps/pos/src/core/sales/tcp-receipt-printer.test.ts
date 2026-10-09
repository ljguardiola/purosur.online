import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TcpReceiptPrinter } from "./tcp-receipt-printer.js";
import { FakeThermalPrinter } from "./test-support/fake-thermal-printer.js";
import { ManualTimers } from "./test-support/manual-timers.js";
import { ReceiptPrintObserver, settled } from "./test-support/receipt-print-watch.js";
import { ScriptedSocket } from "./test-support/scripted-socket.js";

const POLL_INTERVAL_MS = 500;
const CONNECT_LIMIT_MS = 3000;
const PRINT_ID = "A1b2";
const RECEIPT = Uint8Array.of(0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a);
const TRANSMIT_RESPONSE_REQUEST = [0x1d, 0x28, 0x48, 0x06, 0x00, 0x30, 0x30, ...ascii(PRINT_ID)];
const STATUS_QUERY = [0x10, 0x04, 0x02];
const READY = 0x12;
const COVER_OPEN = 0x16 | 0x20;
const PAPER_OUT = 0x32;

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

function responseTo(id: string): number[] {
  return [0x37, 0x22, ...ascii(id), 0x00];
}

async function nextIoTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("TcpReceiptPrinter against a printer on the network", () => {
  let fake: FakeThermalPrinter;
  let timers: ManualTimers;
  let observer: ReceiptPrintObserver;
  let printer: TcpReceiptPrinter;

  async function pollUntil(condition: () => boolean): Promise<void> {
    while (!condition()) {
      const queriesBefore = fake.statusQueries;
      timers.fire(POLL_INTERVAL_MS);
      await Promise.race([fake.whenStatusQueries(queriesBefore + 1), nextIoTurn()]);
      await nextIoTurn();
      await nextIoTurn();
    }
  }

  beforeEach(async () => {
    fake = new FakeThermalPrinter();
    await fake.listen();
    timers = new ManualTimers();
    observer = new ReceiptPrintObserver();
    printer = new TcpReceiptPrinter({
      host: "127.0.0.1",
      port: fake.port,
      timers,
      nextPrintId: () => PRINT_ID,
    });
  });

  afterEach(async () => {
    observer.abort.abort();
    await fake.stop();
  });

  it("acknowledges once the ticket has come out, with the receipt bytes alone printed", async () => {
    const ending = await printer.print(RECEIPT, observer.watch);

    expect(ending).toEqual({ kind: "acknowledged" });
    expect(fake.printed).toEqual([RECEIPT]);
  });

  it("does not acknowledge while the cover is open and prints exactly once after closing it", async () => {
    fake.openCover();
    const ending = printer.print(RECEIPT, observer.watch);
    const outcome = settled(ending);
    await fake.whenHeld(1);

    await pollUntil(() => observer.statuses.includes("cover_open"));
    expect(outcome.done).toBe(false);
    expect(fake.printed).toEqual([]);

    fake.closeCover();
    expect(await ending).toEqual({ kind: "acknowledged" });
    expect(fake.printed).toEqual([RECEIPT]);
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
    expect(fake.printed).toHaveLength(1);
  });

  it("reports paper out and acknowledges after loading paper", async () => {
    fake.runOutOfPaper();
    const ending = printer.print(RECEIPT, observer.watch);
    await fake.whenHeld(1);

    await pollUntil(() => observer.statuses.length === 1);
    expect(observer.statuses).toEqual(["paper_out"]);

    fake.loadPaper();
    expect(await ending).toEqual({ kind: "acknowledged" });
    expect(fake.printed).toEqual([RECEIPT]);
  });

  it("reports cover open rather than paper out when both are reported", async () => {
    fake.openCover();
    fake.runOutOfPaper();
    void printer.print(RECEIPT, observer.watch);
    await fake.whenHeld(1);

    await pollUntil(() => observer.statuses.length === 1);

    expect(observer.statuses).toEqual(["cover_open"]);
  });

  it("does not repeat a status that has not changed", async () => {
    fake.openCover();
    void printer.print(RECEIPT, observer.watch);
    await fake.whenHeld(1);

    await pollUntil(() => fake.statusQueries >= 4);
    fake.closeCover();
    await fake.whenStatusQueries(4);

    expect(observer.statuses).toEqual(["cover_open"]);
  });

  it("reports not responding when the connection is refused, and sends the receipt once the printer accepts", async () => {
    await fake.refuseConnections();
    const ending = printer.print(RECEIPT, observer.watch);
    const outcome = settled(ending);

    await pollUntil(() => observer.statuses.length >= 1);
    expect(observer.statuses).toEqual(["not_responding"]);

    await fake.listen();
    await pollUntil(() => outcome.done);
    expect(await ending).toEqual({ kind: "acknowledged" });
    expect(fake.printed).toEqual([RECEIPT]);
  });

  it("reports not responding when the connection drops, without resending and without ever resolving", async () => {
    fake.openCover();
    const ending = printer.print(RECEIPT, observer.watch);
    const outcome = settled(ending);
    await fake.whenHeld(1);

    fake.dropConnections();
    await pollUntil(() => observer.statuses.includes("not_responding"));
    await pollUntil(() => observer.statuses.includes("cover_open"));
    expect(fake.heldCount).toBe(1);

    fake.closeCover();
    await pollUntil(() => observer.statuses.at(-1) === "ready");

    expect(fake.printed).toEqual([RECEIPT]);
    expect(outcome.done).toBe(false);
    observer.abort.abort();
    expect(await ending).toEqual({ kind: "abandoned" });
  });

  it("is ready again after a power cycle, never prints the lost receipt and waits until aborted", async () => {
    fake.openCover();
    const ending = printer.print(RECEIPT, observer.watch);
    const outcome = settled(ending);
    await fake.whenHeld(1);

    fake.powerCycle();
    await pollUntil(() => observer.statuses.at(-1) === "not_responding");
    await pollUntil(() => observer.statuses.at(-1) === "ready");
    const queries = fake.statusQueries;
    await pollUntil(() => fake.statusQueries >= queries + 3);

    expect(observer.statuses).toEqual(["not_responding", "ready"]);
    expect(fake.printed).toEqual([]);
    expect(fake.heldCount).toBe(0);
    expect(outcome.done).toBe(false);

    observer.abort.abort();
    expect(await ending).toEqual({ kind: "abandoned" });
    expect(fake.printed).toEqual([]);
  });

  it("does not take another print's acknowledgment for its own", async () => {
    fake.openCover();
    const ending = printer.print(RECEIPT, observer.watch);
    const outcome = settled(ending);
    await fake.whenHeld(1);

    fake.sendToHosts(responseTo("ZZZZ"));
    await pollUntil(() => observer.statuses.length === 1);
    expect(outcome.done).toBe(false);

    fake.closeCover();
    expect(await ending).toEqual({ kind: "acknowledged" });
  });

  it("closes the connection and stops polling when aborted", async () => {
    fake.openCover();
    const ending = printer.print(RECEIPT, observer.watch);
    await fake.whenHeld(1);

    observer.abort.abort();

    expect(await ending).toEqual({ kind: "abandoned" });
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
    await fake.whenConnectionCount(0);
  });

  it("is abandoned without connecting when already aborted", async () => {
    let connections = 0;
    const idle = new TcpReceiptPrinter({
      host: "127.0.0.1",
      port: fake.port,
      timers,
      nextPrintId: () => PRINT_ID,
      connect: () => {
        connections += 1;
        return new ScriptedSocket();
      },
    });
    observer.abort.abort();

    expect(await idle.print(RECEIPT, observer.watch)).toEqual({ kind: "abandoned" });
    expect(connections).toBe(0);
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
  });
});

describe("TcpReceiptPrinter reading the printer's byte stream", () => {
  let timers: ManualTimers;
  let observer: ReceiptPrintObserver;
  let sockets: ScriptedSocket[];
  let printer: TcpReceiptPrinter;
  let nextId: string;

  beforeEach(() => {
    timers = new ManualTimers();
    observer = new ReceiptPrintObserver();
    sockets = [];
    nextId = PRINT_ID;
    printer = new TcpReceiptPrinter({
      host: "printer.local",
      timers,
      nextPrintId: () => nextId,
      connect: () => {
        const socket = new ScriptedSocket();
        sockets.push(socket);
        return socket;
      },
    });
  });

  afterEach(() => {
    observer.abort.abort();
  });

  function connectedSocket(): ScriptedSocket {
    const socket = sockets[0] as ScriptedSocket;
    socket.connected();
    return socket;
  }

  it("sends the receipt followed by the transmit response request on connecting", () => {
    void printer.print(RECEIPT, observer.watch);
    const socket = connectedSocket();

    expect(socket.written).toHaveLength(1);
    expect([...(socket.written[0] as Uint8Array)]).toEqual([
      ...RECEIPT,
      ...TRANSMIT_RESPONSE_REQUEST,
    ]);
  });

  it("acknowledges a response split across several chunks", async () => {
    const ending = printer.print(RECEIPT, observer.watch);
    const socket = connectedSocket();

    socket.receive(0x37);
    socket.receive(0x22, ...ascii("A1"));
    socket.receive(...ascii("b2"), 0x00);

    expect(await ending).toEqual({ kind: "acknowledged" });
  });

  it("does not take id bytes that look like status bytes for statuses", async () => {
    nextId = "2r2r";
    const ending = printer.print(RECEIPT, observer.watch);
    const socket = connectedSocket();

    socket.receive(...responseTo("2r2r"));

    expect(await ending).toEqual({ kind: "acknowledged" });
    expect(observer.statuses).toEqual([]);
  });

  it("reads a status byte that follows a stray response mark", () => {
    void printer.print(RECEIPT, observer.watch);
    const socket = connectedSocket();

    socket.receive(0x37, READY);

    expect(observer.statuses).toEqual(["ready"]);
  });

  it("reads cover open before paper out and reports only changes", () => {
    void printer.print(RECEIPT, observer.watch);
    const socket = connectedSocket();

    socket.receive(COVER_OPEN);
    socket.receive(COVER_OPEN);
    socket.receive(PAPER_OUT);
    socket.receive(READY);

    expect(observer.statuses).toEqual(["cover_open", "paper_out", "ready"]);
  });

  it("queries the status on every poll", () => {
    void printer.print(RECEIPT, observer.watch);
    const socket = connectedSocket();

    timers.fire(POLL_INTERVAL_MS);
    socket.receive(READY);
    timers.fire(POLL_INTERVAL_MS);

    expect(socket.written.slice(1).map((bytes) => [...bytes])).toEqual([
      STATUS_QUERY,
      STATUS_QUERY,
    ]);
  });

  it("reports not responding after two unanswered polls and recovers when the printer answers", () => {
    void printer.print(RECEIPT, observer.watch);
    const socket = connectedSocket();

    timers.fire(POLL_INTERVAL_MS);
    timers.fire(POLL_INTERVAL_MS);
    expect(observer.statuses).toEqual([]);
    timers.fire(POLL_INTERVAL_MS);
    expect(observer.statuses).toEqual(["not_responding"]);

    socket.receive(READY);
    expect(observer.statuses).toEqual(["not_responding", "ready"]);
  });

  it("reports not responding when the connect limit passes, then connects again at the next poll", () => {
    void printer.print(RECEIPT, observer.watch);
    expect(timers.pending(CONNECT_LIMIT_MS)).toBe(1);

    timers.fire(CONNECT_LIMIT_MS);

    expect(observer.statuses).toEqual(["not_responding"]);
    expect((sockets[0] as ScriptedSocket).destroyed).toBe(true);

    timers.fire(POLL_INTERVAL_MS);
    expect(sockets).toHaveLength(2);
    (sockets[1] as ScriptedSocket).connected();
    expect((sockets[1] as ScriptedSocket).written).toHaveLength(1);
  });

  it("stops waiting for the connect limit once connected", () => {
    void printer.print(RECEIPT, observer.watch);

    connectedSocket();

    expect(timers.pending(CONNECT_LIMIT_MS)).toBe(0);
  });

  it("reconnects after the socket closes and only asks for the status, never resending the receipt", () => {
    void printer.print(RECEIPT, observer.watch);
    connectedSocket().emit("close");
    expect(observer.statuses).toEqual(["not_responding"]);

    timers.fire(POLL_INTERVAL_MS);
    const second = sockets[1] as ScriptedSocket;
    second.connected();
    expect(second.written).toEqual([]);
    timers.fire(POLL_INTERVAL_MS);
    second.receive(READY);

    expect(second.written.map((bytes) => [...bytes])).toEqual([STATUS_QUERY]);
    expect(observer.statuses).toEqual(["not_responding", "ready"]);
  });

  it("reports not responding on a socket error", () => {
    void printer.print(RECEIPT, observer.watch);

    connectedSocket().emit("error", new Error("reset"));

    expect(observer.statuses).toEqual(["not_responding"]);
  });

  it("ignores an acknowledgment arriving on a connection that never carried the receipt", async () => {
    const ending = printer.print(RECEIPT, observer.watch);
    const outcome = settled(ending);
    connectedSocket().emit("close");
    timers.fire(POLL_INTERVAL_MS);
    const second = sockets[1] as ScriptedSocket;
    second.connected();

    second.receive(...responseTo(PRINT_ID));
    await Promise.resolve();

    expect(outcome.done).toBe(false);
  });
});
