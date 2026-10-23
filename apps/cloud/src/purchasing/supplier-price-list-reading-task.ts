import { recordIdSchema } from "@purosur/contracts";
import {
  type PriceListExtractor,
  readSupplierPriceList,
  type SupplierPriceListFiles,
  settleAbandonedSupplierPriceListReadings,
} from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { z } from "zod";
import { type BackgroundJobs, crontabLineEvery } from "../platform/background-jobs.js";
import { DrizzleSupplierPriceListReadings } from "./drizzle-supplier-price-list-readings.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";

const SUPPLIER_PRICE_LIST_ABANDONED_READING_CHECK_TASK_IDENTIFIER =
  "supplier-price-list-abandoned-reading-check";

const ABANDONED_READING_CHECK_INTERVAL_MS = 60 * 1000;

const payloadSchema = z.object({ listId: recordIdSchema() });

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
      [SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER]: async (payload, helpers) => {
        const { listId } = payloadSchema.parse(payload);
        await readSupplierPriceList(
          { store: new DrizzleSupplierPriceListStore(db, now), files, extractor },
          { listId, now, finalAttempt: helpers.job.attempts >= helpers.job.max_attempts },
        );
      },
      [SUPPLIER_PRICE_LIST_ABANDONED_READING_CHECK_TASK_IDENTIFIER]: async () => {
        await settleAbandonedSupplierPriceListReadings(
          {
            store: new DrizzleSupplierPriceListStore(db, now),
            readings: new DrizzleSupplierPriceListReadings(db),
          },
          { now: now() },
        );
      },
    },
    crontab: [
      crontabLineEvery(
        ABANDONED_READING_CHECK_INTERVAL_MS,
        SUPPLIER_PRICE_LIST_ABANDONED_READING_CHECK_TASK_IDENTIFIER,
      ),
    ],
  };
}
