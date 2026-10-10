import { createServer, type Server, type Socket } from "node:net";

const STATUS_QUERY = [0x10, 0x04, 0x02];
const TRANSMIT_RESPONSE_HEAD = [0x1d, 0x28, 0x48, 0x06, 0x00, 0x30, 0x30];
const TRANSMIT_RESPONSE_LENGTH = TRANSMIT_RESPONSE_HEAD.length + 4;
const COVER_OPEN_BIT = 0x04;
const PAPER_END_BIT = 0x20;
const FIXED_STATUS_BITS = 0x12;

interface HeldReceipt {
  bytes: Uint8Array;
  id: Uint8Array;
  connection: Socket;
}

interface Connection {
  socket: Socket;
  pending: number[];
  receipt: number[];
}

type Match = "match" | "partial" | "none";

function matchAt(bytes: number[], at: number, head: number[], length: number): Match {
  for (let offset = 0; offset < head.length; offset += 1) {
    if (at + offset >= bytes.length) return "partial";
    if (bytes[at + offset] !== head[offset]) return "none";
  }
  return bytes.length - at >= length ? "match" : "partial";
}

export class FakeThermalPrinter {
  readonly printed: Uint8Array[] = [];
  statusQueries = 0;
  private server: Server | undefined;
  private listeningPort = 0;
  private readonly connections = new Set<Connection>();
  private held: HeldReceipt[] = [];
  private coverOpen = false;
  private paperOut = false;
  private unresponsive = false;
  private waiters: Array<() => void> = [];

  get port(): number {
    return this.listeningPort;
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  get heldCount(): number {
    return this.held.length;
  }

  async listen(): Promise<void> {
    const server = createServer((socket) => this.accept(socket));
    this.server = server;
    await new Promise<void>((resolve) => server.listen(this.listeningPort, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no TCP address");
    this.listeningPort = address.port;
  }

  async refuseConnections(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async stop(): Promise<void> {
    this.dropConnections();
    await this.refuseConnections();
  }

  openCover(): void {
    this.coverOpen = true;
  }

  closeCover(): void {
    this.coverOpen = false;
    this.printHeld();
  }

  runOutOfPaper(): void {
    this.paperOut = true;
  }

  loadPaper(): void {
    this.paperOut = false;
    this.printHeld();
  }

  stayUnresponsive(): void {
    this.unresponsive = true;
  }

  respondAgain(): void {
    this.unresponsive = false;
  }

  dropConnections(): void {
    for (const connection of this.connections) connection.socket.destroy();
  }

  powerCycle(): void {
    this.held = [];
    this.coverOpen = false;
    this.paperOut = false;
    this.unresponsive = false;
    this.dropConnections();
  }

  sendToHosts(bytes: number[]): void {
    for (const connection of this.connections) connection.socket.write(Uint8Array.from(bytes));
  }

  async whenStatusQueries(count: number): Promise<void> {
    await this.until(() => this.statusQueries >= count);
  }

  async whenHeld(count: number): Promise<void> {
    await this.until(() => this.held.length >= count);
  }

  async whenConnectionCount(count: number): Promise<void> {
    await this.until(() => this.connections.size === count);
  }

  private async until(condition: () => boolean): Promise<void> {
    while (!condition()) await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private changed(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }

  private accept(socket: Socket): void {
    const connection: Connection = { socket, pending: [], receipt: [] };
    this.connections.add(connection);
    socket.on("data", (chunk) => {
      connection.pending.push(...chunk);
      this.consume(connection);
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      this.connections.delete(connection);
      this.changed();
    });
    this.changed();
  }

  private consume(connection: Connection): void {
    const bytes = connection.pending;
    let at = 0;
    let consumed = 0;
    while (at < bytes.length) {
      const query = matchAt(bytes, at, STATUS_QUERY, STATUS_QUERY.length);
      const request = matchAt(bytes, at, TRANSMIT_RESPONSE_HEAD, TRANSMIT_RESPONSE_LENGTH);
      if (query === "partial" || request === "partial") break;
      if (query === "match") {
        this.answerStatusQuery(connection.socket);
        at += STATUS_QUERY.length;
      } else if (request === "match") {
        const id = Uint8Array.from(
          bytes.slice(at + TRANSMIT_RESPONSE_HEAD.length, at + TRANSMIT_RESPONSE_LENGTH),
        );
        this.held.push({
          bytes: Uint8Array.from(connection.receipt),
          id,
          connection: connection.socket,
        });
        connection.receipt = [];
        at += TRANSMIT_RESPONSE_LENGTH;
        this.printHeld();
      } else {
        connection.receipt.push(bytes[at] as number);
        at += 1;
      }
      consumed = at;
    }
    connection.pending = bytes.slice(consumed);
    this.changed();
  }

  private answerStatusQuery(socket: Socket): void {
    this.statusQueries += 1;
    if (this.unresponsive) return;
    let status = FIXED_STATUS_BITS;
    if (this.coverOpen) status |= COVER_OPEN_BIT | PAPER_END_BIT;
    if (this.paperOut) status |= PAPER_END_BIT;
    socket.write(Uint8Array.of(status));
  }

  private printHeld(): void {
    if (this.coverOpen || this.paperOut) return;
    const ready = this.held;
    this.held = [];
    for (const receipt of ready) {
      this.printed.push(receipt.bytes);
      receipt.connection.write(Uint8Array.of(0x37, 0x22, ...receipt.id, 0x00));
    }
    this.changed();
  }
}
