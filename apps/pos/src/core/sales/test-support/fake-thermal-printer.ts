import { createServer, type Server, type Socket } from "node:net";

const STATUS_QUERY = [0x10, 0x04, 0x02];
const COVER_OPEN_BIT = 0x04;
const PAPER_END_BIT = 0x20;
const FIXED_STATUS_BITS = 0x12;

interface Connection {
  socket: Socket;
  pending: number[];
  receipt: number[];
  printed: boolean;
}

type Match = "match" | "partial" | "none";

function matchAt(bytes: number[], at: number): Match {
  for (let offset = 0; offset < STATUS_QUERY.length; offset += 1) {
    if (at + offset >= bytes.length) return "partial";
    if (bytes[at + offset] !== STATUS_QUERY[offset]) return "none";
  }
  return "match";
}

export class FakeThermalPrinter {
  readonly printed: Uint8Array[] = [];
  statusQueries = 0;
  private server: Server | undefined;
  private listeningPort = 0;
  private readonly connections = new Set<Connection>();
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
  }

  runOutOfPaper(): void {
    this.paperOut = true;
  }

  loadPaper(): void {
    this.paperOut = false;
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

  async whenStatusQueries(count: number): Promise<void> {
    await this.until(() => this.statusQueries >= count);
  }

  async whenPrinted(count: number): Promise<void> {
    await this.until(() => this.printed.length >= count);
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
    const connection: Connection = { socket, pending: [], receipt: [], printed: false };
    this.connections.add(connection);
    socket.on("data", (chunk) => {
      connection.pending.push(...chunk);
      this.consume(connection);
    });
    socket.on("error", () => {});
    socket.on("end", () => this.print(connection));
    socket.on("close", () => {
      this.print(connection);
      this.connections.delete(connection);
      this.changed();
    });
    this.changed();
  }

  private print(connection: Connection): void {
    if (connection.printed || connection.receipt.length === 0) return;
    connection.printed = true;
    this.printed.push(Uint8Array.from(connection.receipt));
    this.changed();
  }

  private consume(connection: Connection): void {
    const bytes = connection.pending;
    let at = 0;
    let consumed = 0;
    while (at < bytes.length) {
      const query = matchAt(bytes, at);
      if (query === "partial") break;
      if (query === "match") {
        this.answerStatusQuery(connection.socket);
        at += STATUS_QUERY.length;
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
}
