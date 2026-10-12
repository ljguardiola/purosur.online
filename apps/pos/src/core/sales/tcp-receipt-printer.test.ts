import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TcpReceiptPrinter } from "./tcp-receipt-printer.js";
import { FakeThermalPrinter } from "./test-support/fake-thermal-printer.js";
import { ManualTimers } from "./test-support/manual-timers.js";
import { ReceiptPrintObserver, settled } from "./test-support/receipt-print-watch.js";
import { ScriptedSocket } from "./test-support/scripted-socket.js";

const POLL_INTERVAL_MS = 500;
const CONNECT_LIMIT_MS = 3000;
const RECEIPT = Uint8Array.of(0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a);
const STATUS_QUERY = [0x10, 0x04, 0x02];
const READY = 0x12;
const COVER_OPEN = 0x16 | 0x20;
const PAPER_OUT = 0x32;

async function nextIoTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function receiptToSend(bytes: Uint8Array = RECEIPT) {
  const handed = { calls: 0 };
  return {
    handed,
    sending: () => {
      handed.calls += 1;
      return bytes;
    },
  };
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
      address: () => ({ host: "127.0.0.1", port: fake.port }),
      timers,
    });
  });

  afterEach(async () => {
    observer.abort.abort();
    await fake.stop();
  });

  it("sends the receipt to a ready printer and resolves sent", async () => {
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);

    await pollUntil(() => outcome.done);

    expect(await ending).toEqual({ kind: "sent" });
    await fake.whenPrinted(1);
    expect(fake.printed).toEqual([RECEIPT]);
    expect(handed.calls).toBe(1);
  });

  it("asks for the bytes and writes nothing while the cover is open, then prints exactly once after closing it", async () => {
    fake.openCover();
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);
    await fake.whenConnectionCount(1);

    await pollUntil(() => observer.statuses.includes("cover_open"));
    await pollUntil(() => fake.statusQueries >= 4);
    expect(outcome.done).toBe(false);
    expect(handed.calls).toBe(0);
    expect(fake.printed).toEqual([]);

    fake.closeCover();
    await pollUntil(() => outcome.done);
    expect(await ending).toEqual({ kind: "sent" });
    await fake.whenPrinted(1);
    expect(fake.printed).toEqual([RECEIPT]);
    expect(handed.calls).toBe(1);
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
  });

  it("reports paper out, writes nothing, and sends after paper is loaded", async () => {
    fake.runOutOfPaper();
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);
    await fake.whenConnectionCount(1);

    await pollUntil(() => observer.statuses.length === 1);
    expect(observer.statuses).toEqual(["paper_out"]);
    expect(handed.calls).toBe(0);
    expect(fake.printed).toEqual([]);

    fake.loadPaper();
    await pollUntil(() => outcome.done);
    expect(await ending).toEqual({ kind: "sent" });
    await fake.whenPrinted(1);
    expect(fake.printed).toEqual([RECEIPT]);
  });

  it("reports cover open rather than paper out when both are reported", async () => {
    fake.openCover();
    fake.runOutOfPaper();
    void printer.print(observer.watch, receiptToSend().sending);
    await fake.whenConnectionCount(1);

    await pollUntil(() => observer.statuses.length === 1);

    expect(observer.statuses).toEqual(["cover_open"]);
  });

  it("does not repeat a status that has not changed", async () => {
    fake.openCover();
    void printer.print(observer.watch, receiptToSend().sending);
    await fake.whenConnectionCount(1);

    await pollUntil(() => fake.statusQueries >= 4);

    expect(observer.statuses).toEqual(["cover_open"]);
  });

  it("reports not responding when the connection is refused, and sends once the printer accepts", async () => {
    await fake.refuseConnections();
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);

    await pollUntil(() => observer.statuses.length >= 1);
    expect(observer.statuses).toEqual(["not_responding"]);
    expect(handed.calls).toBe(0);

    await fake.listen();
    await pollUntil(() => outcome.done);
    expect(await ending).toEqual({ kind: "sent" });
    await fake.whenPrinted(1);
    expect(fake.printed).toEqual([RECEIPT]);
  });

  it("writes nothing while the printer stays silent, and sends once it answers ready", async () => {
    fake.stayUnresponsive();
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);
    await fake.whenConnectionCount(1);

    await pollUntil(() => observer.statuses.includes("not_responding"));
    expect(handed.calls).toBe(0);

    fake.respondAgain();
    await pollUntil(() => outcome.done);
    expect(await ending).toEqual({ kind: "sent" });
    expect(observer.statuses).toEqual(["not_responding", "ready"]);
  });

  it("reports not responding when the connection drops and goes on waiting for a ready answer", async () => {
    fake.openCover();
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);
    await fake.whenConnectionCount(1);

    fake.dropConnections();
    await pollUntil(() => observer.statuses.includes("not_responding"));
    await pollUntil(() => observer.statuses.at(-1) === "cover_open");
    expect(outcome.done).toBe(false);
    expect(handed.calls).toBe(0);

    fake.closeCover();
    await pollUntil(() => outcome.done);
    expect(await ending).toEqual({ kind: "sent" });
    await fake.whenPrinted(1);
    expect(fake.printed).toEqual([RECEIPT]);
  });

  it("closes the connection and stops polling when aborted", async () => {
    fake.openCover();
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    await fake.whenConnectionCount(1);

    observer.abort.abort();

    expect(await ending).toEqual({ kind: "abandoned" });
    expect(handed.calls).toBe(0);
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
    await fake.whenConnectionCount(0);
    expect(fake.printed).toEqual([]);
  });

  it("is abandoned without connecting when already aborted", async () => {
    let connections = 0;
    const idle = new TcpReceiptPrinter({
      address: () => ({ host: "127.0.0.1", port: fake.port }),
      timers,
      connect: () => {
        connections += 1;
        return new ScriptedSocket();
      },
    });
    const { sending, handed } = receiptToSend();
    observer.abort.abort();

    expect(await idle.print(observer.watch, sending)).toEqual({ kind: "abandoned" });
    expect(connections).toBe(0);
    expect(handed.calls).toBe(0);
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
  });
});

describe("TcpReceiptPrinter reading the printer's byte stream", () => {
  let timers: ManualTimers;
  let observer: ReceiptPrintObserver;
  let sockets: ScriptedSocket[];
  let connections: Array<{ port: number; host: string }>;
  let address: { host: string; port: number | null } | undefined;
  let printer: TcpReceiptPrinter;

  beforeEach(() => {
    timers = new ManualTimers();
    observer = new ReceiptPrintObserver();
    sockets = [];
    connections = [];
    address = { host: "printer.local", port: null };
    printer = new TcpReceiptPrinter({
      address: () => address,
      timers,
      connect: (port, host) => {
        connections.push({ port, host });
        const socket = new ScriptedSocket();
        sockets.push(socket);
        return socket;
      },
    });
  });

  afterEach(() => {
    observer.abort.abort();
  });

  function socketAt(index = 0): ScriptedSocket {
    return sockets[index] as ScriptedSocket;
  }

  function connectedSocket(index = 0): ScriptedSocket {
    const socket = socketAt(index);
    socket.connected();
    return socket;
  }

  function written(socket: ScriptedSocket): number[][] {
    return socket.written.map((bytes) => [...bytes]);
  }

  it("connects to the raw printing port when the address has none", () => {
    void printer.print(observer.watch, receiptToSend().sending);

    expect(connections).toEqual([{ port: 9100, host: "printer.local" }]);
  });

  it("connects to the port the address names", () => {
    address = { host: "10.10.10.2", port: 9101 };
    void printer.print(observer.watch, receiptToSend().sending);

    expect(connections).toEqual([{ port: 9101, host: "10.10.10.2" }]);
  });

  it("writes nothing on connecting, only status queries on each poll", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    const socket = connectedSocket();

    expect(socket.written).toEqual([]);
    timers.fire(POLL_INTERVAL_MS);
    socket.receive(COVER_OPEN);
    timers.fire(POLL_INTERVAL_MS);

    expect(written(socket)).toEqual([STATUS_QUERY, STATUS_QUERY]);
  });

  it("writes the bytes it is handed on the connection that answered ready, then ends it gracefully", async () => {
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const socket = connectedSocket();
    timers.fire(POLL_INTERVAL_MS);

    socket.receive(READY);

    expect(await ending).toEqual({ kind: "sent" });
    expect(written(socket)).toEqual([STATUS_QUERY, [...RECEIPT]]);
    expect(socket.ended).toBe(true);
    expect(socket.destroyed).toBe(false);
    expect(handed.calls).toBe(1);
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
  });

  it("reports the ready status before asking for the bytes", () => {
    const seen: string[] = [];
    void printer.print(observer.watch, () => {
      seen.push(...observer.statuses);
      return RECEIPT;
    });

    connectedSocket().receive(READY);

    expect(seen).toEqual(["ready"]);
  });

  it("asks for the bytes only once, however many ready answers follow", async () => {
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const socket = connectedSocket();

    socket.receive(READY, READY);
    await ending;
    socket.receive(READY);

    expect(handed.calls).toBe(1);
    expect(written(socket)).toEqual([[...RECEIPT]]);
  });

  it("resolves sent even when the connection closes right after writing", async () => {
    const ending = printer.print(observer.watch, receiptToSend().sending);
    const socket = connectedSocket();

    socket.receive(READY);
    socket.emit("close");

    expect(await ending).toEqual({ kind: "sent" });
    expect(observer.statuses).toEqual(["ready"]);
    timers.fire(POLL_INTERVAL_MS);
    expect(sockets).toHaveLength(1);
  });

  it("neither writes nor asks for the bytes while the status is not ready", () => {
    const { sending, handed } = receiptToSend();
    void printer.print(observer.watch, sending);
    const socket = connectedSocket();

    socket.receive(COVER_OPEN);
    socket.receive(PAPER_OUT);

    expect(handed.calls).toBe(0);
    expect(socket.written).toEqual([]);
  });

  it("writes nothing and is abandoned when aborted before a ready answer", async () => {
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const socket = connectedSocket();

    observer.abort.abort();
    socket.receive(READY);

    expect(await ending).toEqual({ kind: "abandoned" });
    expect(handed.calls).toBe(0);
    expect(socket.written).toEqual([]);
    expect(socket.destroyed).toBe(true);
  });

  it("rejects and closes the connection when the bytes cannot be produced", async () => {
    const ending = printer.print(observer.watch, () => {
      throw new Error("cannot render");
    });
    const socket = connectedSocket();

    socket.receive(READY);

    await expect(ending).rejects.toThrow("cannot render");
    expect(socket.written).toEqual([]);
    expect(socket.destroyed).toBe(true);
    expect(timers.pending(POLL_INTERVAL_MS)).toBe(0);
  });

  it("ignores bytes that are not a status", () => {
    const { sending, handed } = receiptToSend();
    void printer.print(observer.watch, sending);
    const socket = connectedSocket();

    socket.receive(0x37, 0x22, 0x41, 0x42, 0x43, 0x44, 0x00);

    expect(observer.statuses).toEqual([]);
    expect(handed.calls).toBe(0);
  });

  it("reads cover open before paper out and reports only changes", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    const socket = connectedSocket();

    socket.receive(COVER_OPEN);
    socket.receive(COVER_OPEN);
    socket.receive(PAPER_OUT);

    expect(observer.statuses).toEqual(["cover_open", "paper_out"]);
  });

  it("reports not responding after two unanswered polls and recovers when the printer answers", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    const socket = connectedSocket();

    timers.fire(POLL_INTERVAL_MS);
    timers.fire(POLL_INTERVAL_MS);
    expect(observer.statuses).toEqual([]);
    timers.fire(POLL_INTERVAL_MS);
    expect(observer.statuses).toEqual(["not_responding"]);

    socket.receive(COVER_OPEN);
    expect(observer.statuses).toEqual(["not_responding", "cover_open"]);
  });

  it("keeps querying the status of a printer that stopped answering", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    const socket = connectedSocket();

    for (let poll = 0; poll < 5; poll += 1) timers.fire(POLL_INTERVAL_MS);

    expect(observer.statuses).toEqual(["not_responding"]);
    expect(written(socket)).toEqual(Array.from({ length: 5 }, () => STATUS_QUERY));
  });

  it("reports not responding when the connect limit passes, then connects again at the next poll", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    expect(timers.pending(CONNECT_LIMIT_MS)).toBe(1);

    timers.fire(CONNECT_LIMIT_MS);

    expect(observer.statuses).toEqual(["not_responding"]);
    expect(socketAt(0).destroyed).toBe(true);

    timers.fire(POLL_INTERVAL_MS);
    expect(sockets).toHaveLength(2);
  });

  it("stops waiting for the connect limit once connected", () => {
    void printer.print(observer.watch, receiptToSend().sending);

    connectedSocket();

    expect(timers.pending(CONNECT_LIMIT_MS)).toBe(0);
  });

  it("reconnects after the socket closes and writes the bytes on the new connection when it answers ready", async () => {
    const ending = printer.print(observer.watch, receiptToSend().sending);
    connectedSocket().emit("close");
    expect(observer.statuses).toEqual(["not_responding"]);

    timers.fire(POLL_INTERVAL_MS);
    const second = connectedSocket(1);
    timers.fire(POLL_INTERVAL_MS);
    second.receive(READY);

    expect(await ending).toEqual({ kind: "sent" });
    expect(written(second)).toEqual([STATUS_QUERY, [...RECEIPT]]);
    expect(observer.statuses).toEqual(["not_responding", "ready"]);
  });

  it("reports not responding on a socket error", () => {
    void printer.print(observer.watch, receiptToSend().sending);

    connectedSocket().emit("error", new Error("reset"));

    expect(observer.statuses).toEqual(["not_responding"]);
  });

  it("ignores the bytes of a connection it dropped", async () => {
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);
    const first = connectedSocket();
    first.emit("close");
    timers.fire(POLL_INTERVAL_MS);
    connectedSocket(1);

    first.receive(READY);
    await Promise.resolve();

    expect(outcome.done).toBe(false);
    expect(handed.calls).toBe(0);
    expect(first.written).toEqual([]);
    expect(observer.statuses).toEqual(["not_responding"]);
  });

  it("ignores the bytes of a connection that timed out before connecting", async () => {
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    const outcome = settled(ending);
    timers.fire(CONNECT_LIMIT_MS);

    socketAt(0).receive(READY);
    await Promise.resolve();

    expect(outcome.done).toBe(false);
    expect(handed.calls).toBe(0);
  });
});

describe("TcpReceiptPrinter following the configured address", () => {
  let timers: ManualTimers;
  let observer: ReceiptPrintObserver;
  let sockets: ScriptedSocket[];
  let connections: Array<{ port: number; host: string }>;
  let address: { host: string; port: number | null } | undefined;
  let printer: TcpReceiptPrinter;

  beforeEach(() => {
    timers = new ManualTimers();
    observer = new ReceiptPrintObserver();
    sockets = [];
    connections = [];
    address = { host: "10.10.10.2", port: null };
    printer = new TcpReceiptPrinter({
      address: () => address,
      timers,
      connect: (port, host) => {
        connections.push({ port, host });
        const socket = new ScriptedSocket();
        sockets.push(socket);
        return socket;
      },
    });
  });

  afterEach(() => {
    observer.abort.abort();
  });

  function socketAt(index: number): ScriptedSocket {
    return sockets[index] as ScriptedSocket;
  }

  it("drops the connection and connects to the new address at the next poll", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    socketAt(0).connected();
    socketAt(0).receive(PAPER_OUT);

    address = { host: "10.10.10.3", port: 9101 };
    timers.fire(POLL_INTERVAL_MS);

    expect(socketAt(0).destroyed).toBe(true);
    expect(connections).toEqual([
      { port: 9100, host: "10.10.10.2" },
      { port: 9101, host: "10.10.10.3" },
    ]);
  });

  it("sends the receipt on the new address's connection and never writes to the old one", async () => {
    const { sending, handed } = receiptToSend();
    const ending = printer.print(observer.watch, sending);
    socketAt(0).connected();
    socketAt(0).receive(PAPER_OUT);
    address = { host: "10.10.10.3", port: null };
    timers.fire(POLL_INTERVAL_MS);
    socketAt(1).connected();

    socketAt(0).receive(READY);
    expect(handed.calls).toBe(0);
    timers.fire(POLL_INTERVAL_MS);
    socketAt(1).receive(READY);

    expect(await ending).toEqual({ kind: "sent" });
    expect(handed.calls).toBe(1);
    expect(socketAt(1).written.map((bytes) => [...bytes])).toEqual([STATUS_QUERY, [...RECEIPT]]);
    expect(socketAt(0).written).toEqual([]);
  });

  it("keeps the connection when the address is only written differently", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    socketAt(0).connected();

    address = { host: "10.10.10.2", port: 9100 };
    timers.fire(POLL_INTERVAL_MS);

    expect(socketAt(0).destroyed).toBe(false);
    expect(sockets).toHaveLength(1);
  });

  it("keeps the connection when the same host is written in another case", () => {
    address = { host: "Ticketera.local", port: null };
    void printer.print(observer.watch, receiptToSend().sending);
    socketAt(0).connected();

    address = { host: "ticketera.LOCAL", port: null };
    timers.fire(POLL_INTERVAL_MS);

    expect(sockets).toHaveLength(1);
  });

  it("changes connection when only the port differs", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    socketAt(0).connected();

    address = { host: "10.10.10.2", port: 9101 };
    timers.fire(POLL_INTERVAL_MS);

    expect(connections.at(-1)).toEqual({ port: 9101, host: "10.10.10.2" });
  });

  it("keeps the live connection when no address is configured any more", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    socketAt(0).connected();

    address = undefined;
    timers.fire(POLL_INTERVAL_MS);

    expect(socketAt(0).destroyed).toBe(false);
    expect(sockets).toHaveLength(1);
  });

  it("keeps the live connection and its polling when the address cannot be read", () => {
    let readable = true;
    printer = new TcpReceiptPrinter({
      address: () => {
        if (!readable) throw new Error("the settings cannot be read");
        return address;
      },
      timers,
      connect: () => {
        const socket = new ScriptedSocket();
        sockets.push(socket);
        return socket;
      },
    });
    void printer.print(observer.watch, receiptToSend().sending);
    socketAt(0).connected();

    readable = false;
    timers.fire(POLL_INTERVAL_MS);
    timers.fire(POLL_INTERVAL_MS);

    expect(socketAt(0).destroyed).toBe(false);
    expect(socketAt(0).written.map((bytes) => [...bytes])).toEqual([STATUS_QUERY, STATUS_QUERY]);
    expect(sockets).toHaveLength(1);
  });

  it("connects to the address a lost connection is replaced with", () => {
    void printer.print(observer.watch, receiptToSend().sending);
    socketAt(0).connected();
    socketAt(0).emit("close");

    address = { host: "10.10.10.3", port: null };
    timers.fire(POLL_INTERVAL_MS);

    expect(connections.at(-1)).toEqual({ port: 9100, host: "10.10.10.3" });
  });

  it("reports not responding and connects once an address exists when none was configured at the start", () => {
    address = undefined;
    void printer.print(observer.watch, receiptToSend().sending);

    expect(sockets).toHaveLength(0);
    timers.fire(POLL_INTERVAL_MS);
    expect(observer.statuses).toEqual(["not_responding"]);

    address = { host: "10.10.10.2", port: null };
    timers.fire(POLL_INTERVAL_MS);
    expect(connections).toEqual([{ port: 9100, host: "10.10.10.2" }]);
  });
});
