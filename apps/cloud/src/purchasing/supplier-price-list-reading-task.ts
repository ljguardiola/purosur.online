import {
  type PriceListExtractor,
  readSupplierPriceList,
  type SupplierPriceListFiles,
} from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";

const payloadSchema = z.object({ listId: z.uuid() });

export interface SupplierPriceListReadingInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  db: PgDatabase<TQueryResult>;
  files: SupplierPriceListFiles;
  extractor: PriceListExtractor;
}

export function supplierPriceListReadingJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  db,
  files,
  extractor,
}: SupplierPriceListReadingInput<TQueryResult>): BackgroundJobs {
  return {
    taskList: {
      [SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER]: async (payload) => {
        const { listId } = payloadSchema.parse(payload);
        await readSupplierPriceList(
          { store: new DrizzleSupplierPriceListStore(db, now), files, extractor },
          { listId, now },
        );
      },
    },
    crontab: [],
  };
}
