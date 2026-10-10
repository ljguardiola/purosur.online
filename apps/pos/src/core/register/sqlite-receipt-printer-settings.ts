import type { ReceiptPrinterAddress } from "@purosur/domain";
import type { ReceiptPrinterSettings } from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface ReceiptPrinterRow {
  host: string;
  port: number | null;
}

export class SqliteReceiptPrinterSettings implements ReceiptPrinterSettings {
  constructor(private readonly database: LocalDatabase) {}

  receiptPrinterAddress(): ReceiptPrinterAddress | undefined {
    const row = this.database
      .prepare<[], ReceiptPrinterRow>("SELECT host, port FROM receipt_printer WHERE id = 1")
      .get();
    return row === undefined ? undefined : { host: row.host, port: row.port };
  }

  saveReceiptPrinterAddress({ host, port }: ReceiptPrinterAddress): void {
    this.database
      .prepare(
        `INSERT INTO receipt_printer (id, host, port) VALUES (1, @host, @port)
         ON CONFLICT (id) DO UPDATE SET host = excluded.host, port = excluded.port`,
      )
      .run({ host, port });
  }
}
