import type { BranchSettingsBody } from "@purosur/contracts";
import type { NetContentUnit, SaleUnit } from "@purosur/domain";
import type { LocalReplica, PullPage } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { prepareAccessPageWrites } from "./access-page-writes";
import { prepareCatalogPageWrites } from "./catalog-page-writes";
import { prepareDiscountPageWrites } from "./discount-page-writes";
import { prepareFiscalPageWrites } from "./fiscal-page-writes";
import type { RegisterPulledChange } from "./pulled-change";
import { prepareRegisterPageWrites } from "./register-page-writes";

const DAY_FIELDS = [
  "monday_hours",
  "tuesday_hours",
  "wednesday_hours",
  "thursday_hours",
  "friday_hours",
  "saturday_hours",
  "sunday_hours",
] as const;

type WeeklyHours = Pick<BranchSettingsBody, (typeof DAY_FIELDS)[number]>;

interface BranchSettingsRecord {
  address: string;
  whatsapp_number: string;
  instagram_handle: string;
  weekly_hours: string;
  expiring_lot_alert_days: number;
  unreviewed_price_alert_days: number;
  good_condition_return_days: number;
  version: number;
}

function weeklyHoursOf(row: BranchSettingsBody): WeeklyHours {
  return Object.fromEntries(DAY_FIELDS.map((field) => [field, row[field]])) as WeeklyHours;
}

export class SqliteLocalReplica implements LocalReplica<RegisterPulledChange> {
  private readonly database: LocalDatabase;
  private pepper: string | undefined;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  // A cursor only means something to the installation that pulled it: another one, perhaps of
  // another branch, starts over from the first change. The users held so far are marked removed,
  // because another branch's pull never sends a removal for them; those it still serves come back
  // as they arrive. Their PIN verifiers were derived with the pepper of the one before, and the PIN
  // hashes they came from are not kept, so they are dropped and derived again, and the wrong PINs
  // counted against them go with them, and so does who the register remembered. The register row
  // and its point of sale held are the previous installation's own, so they go too. Its unsent outbox events stay, tagged
  // with its device id: they are the only record of what it did.
  adoptDevice({ deviceId, pepper }: { deviceId: string; pepper: string }): void {
    this.pepper = pepper;
    this.database.transaction(() => {
      const reset = this.database
        .prepare<[string, string]>(
          `UPDATE sync_state SET pull_cursor = 0, device_id = ?, last_device_seq = 0, last_chain_hmac = NULL,
                                 installation_revoked_at = NULL, sales_stopped_reason = NULL
           WHERE id = 1 AND device_id IS NOT ?`,
        )
        .run(deviceId, deviceId);
      if (reset.changes > 0) {
        this.database.prepare("UPDATE users SET removed = 1").run();
        this.database.prepare("DELETE FROM pin_verifiers").run();
        this.database.prepare("DELETE FROM pin_sign_in_failures").run();
        this.database.prepare("DELETE FROM remembered_users").run();
        this.database.prepare("DELETE FROM own_register").run();
        this.database.prepare("DELETE FROM register_point_of_sale").run();
      }
    })();
  }

  async savedCursor(): Promise<number> {
    const row = this.database
      .prepare<[], { pull_cursor: number }>("SELECT pull_cursor FROM sync_state WHERE id = 1")
      .get();
    if (row === undefined) {
      throw new Error("the local database has no sync state");
    }
    return row.pull_cursor;
  }

  // A version the register already has, or an older one delivered late, never overwrites it.
  async savePage(page: PullPage<RegisterPulledChange>): Promise<void> {
    const catalog = prepareCatalogPageWrites(this.database);
    const access = prepareAccessPageWrites(this.database, this.pepper);
    const register = prepareRegisterPageWrites(this.database);
    const discount = prepareDiscountPageWrites(this.database);
    const fiscal = prepareFiscalPageWrites(this.database);
    const saveBranchSettings = this.database.prepare(
      `INSERT INTO branch_settings (
         location_id, address, whatsapp_number, instagram_handle, weekly_hours,
         expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version
       ) VALUES (
         @location_id, @address, @whatsapp_number, @instagram_handle, @weekly_hours,
         @expiring_lot_alert_days, @unreviewed_price_alert_days, @good_condition_return_days,
         @version
       )
       ON CONFLICT (location_id) DO UPDATE SET
         address = excluded.address,
         whatsapp_number = excluded.whatsapp_number,
         instagram_handle = excluded.instagram_handle,
         weekly_hours = excluded.weekly_hours,
         expiring_lot_alert_days = excluded.expiring_lot_alert_days,
         unreviewed_price_alert_days = excluded.unreviewed_price_alert_days,
         good_condition_return_days = excluded.good_condition_return_days,
         version = excluded.version
       WHERE excluded.version > branch_settings.version`,
    );
    const saveCursor = this.database.prepare<[number]>(
      "UPDATE sync_state SET pull_cursor = ? WHERE id = 1",
    );

    this.database.transaction(() => {
      for (const { change } of page.changes) {
        switch (change.entity) {
          case "branch_settings": {
            const { row } = change;
            saveBranchSettings.run({
              location_id: change.entity_id,
              address: row.address,
              whatsapp_number: row.whatsapp_number,
              instagram_handle: row.instagram_handle,
              weekly_hours: JSON.stringify(weeklyHoursOf(row)),
              expiring_lot_alert_days: row.expiring_lot_alert_days,
              unreviewed_price_alert_days: row.unreviewed_price_alert_days,
              good_condition_return_days: row.good_condition_return_days,
              version: row.version,
            });
            break;
          }
          case "category":
            catalog.category(change);
            break;
          case "product":
            catalog.product(change);
            break;
          case "tag":
            catalog.tag(change);
            break;
          case "price_list":
            catalog.priceList(change);
            break;
          case "price":
            catalog.price(change);
            break;
          case "user":
            access.user(change);
            break;
          case "role":
            access.role(change);
            break;
          case "register":
            register.save(change);
            break;
          case "register_point_of_sale":
            register.pointOfSale(change);
            break;
          case "discount":
            discount.save(change);
            break;
          case "issuer_identification":
            fiscal.issuerIdentification(change);
            break;
          case "buyer_identification_threshold":
            fiscal.buyerIdentificationThreshold(change);
            break;
          case "buyer_tax_status_set":
            fiscal.buyerTaxStatusSet(change);
            break;
          case "removal": {
            const { removed_entity } = change;
            if (removed_entity === "register") {
              register.removal({ ...change, removed_entity });
            } else if (removed_entity === "discount") {
              discount.removal({ ...change, removed_entity });
            } else if (removed_entity === "user" || removed_entity === "role") {
              access.removal({ ...change, removed_entity });
            } else {
              catalog.removal({ ...change, removed_entity });
            }
            break;
          }
        }
      }
      saveCursor.run(page.cursor);
    })();
  }

  registerName(): string | undefined {
    return this.database
      .prepare<[], { name: string }>("SELECT name FROM own_register WHERE removed = 0")
      .get()?.name;
  }

  branchSettings(locationId: string): BranchSettingsBody | undefined {
    const record = this.database
      .prepare<[string], BranchSettingsRecord>(
        `SELECT address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days,
                unreviewed_price_alert_days, good_condition_return_days, version
         FROM branch_settings WHERE location_id = ?`,
      )
      .get(locationId);
    if (record === undefined) {
      return undefined;
    }
    const { weekly_hours, ...fields } = record;
    return { ...fields, ...(JSON.parse(weekly_hours) as WeeklyHours) };
  }

  category(id: string) {
    const record = this.database
      .prepare<
        [string],
        { name: string; parent_id: string | null; version: number; removed: number }
      >("SELECT name, parent_id, version, removed FROM categories WHERE id = ?")
      .get(id);
    return record && { ...record, removed: record.removed === 1 };
  }

  product(id: string) {
    const record = this.database
      .prepare<
        [string],
        {
          name: string;
          category_id: string;
          brand_id: string | null;
          sale_unit: SaleUnit;
          active: number;
          net_content_quantity: number | null;
          net_content_unit: NetContentUnit | null;
          version: number;
          removed: number;
        }
      >(
        `SELECT name, category_id, brand_id, sale_unit, active, net_content_quantity,
                net_content_unit, version, removed
         FROM products WHERE id = ?`,
      )
      .get(id);
    if (record === undefined) {
      return undefined;
    }
    const { net_content_quantity, net_content_unit, ...fields } = record;
    const barcodes = this.database
      .prepare<[string], { position: number; code: string; active: number }>(
        "SELECT position, code, active FROM product_barcodes WHERE product_id = ? ORDER BY position",
      )
      .all(id);
    const tagIds = this.database
      .prepare<[string], { tag_id: string; active: number }>(
        "SELECT tag_id, active FROM product_tags WHERE product_id = ? ORDER BY tag_id",
      )
      .all(id);
    return {
      ...fields,
      active: record.active === 1,
      tag_ids: tagIds.map((tag) => ({ tag_id: tag.tag_id, active: tag.active === 1 })),
      net_content:
        net_content_quantity === null || net_content_unit === null
          ? null
          : { quantity: net_content_quantity, unit: net_content_unit },
      barcodes: barcodes.map((barcode) => ({ ...barcode, active: barcode.active === 1 })),
      removed: record.removed === 1,
    };
  }

  tag(id: string) {
    const record = this.database
      .prepare<[string], { name: string; active: number; version: number; removed: number }>(
        "SELECT name, active, version, removed FROM tags WHERE id = ?",
      )
      .get(id);
    return record && { ...record, active: record.active === 1, removed: record.removed === 1 };
  }

  priceList(id: string) {
    return this.database
      .prepare<[string], { name: string; version: number }>(
        "SELECT name, version FROM price_lists WHERE id = ?",
      )
      .get(id);
  }

  price(id: string) {
    const record = this.database
      .prepare<
        [string],
        {
          product_id: string;
          price_list_id: string;
          unit_price: number;
          valid_from: string;
          version: number;
          removed: number;
        }
      >(
        `SELECT product_id, price_list_id, unit_price, valid_from, version, removed
         FROM prices WHERE id = ?`,
      )
      .get(id);
    return record && { ...record, removed: record.removed === 1 };
  }

  user(id: string) {
    const record = this.database
      .prepare<
        [string],
        {
          first_name: string;
          role_id: string;
          salt: string | null;
          active: number;
          version: number;
          removed: number;
        }
      >("SELECT first_name, role_id, salt, active, version, removed FROM users WHERE id = ?")
      .get(id);
    return record && { ...record, active: record.active === 1, removed: record.removed === 1 };
  }

  pinVerifier(userId: string): string | undefined {
    return this.database
      .prepare<[string], { verifier: string }>(
        "SELECT verifier FROM pin_verifiers WHERE user_id = ?",
      )
      .get(userId)?.verifier;
  }

  discount(id: string) {
    const record = this.database
      .prepare<
        [string],
        {
          name: string;
          kind: string;
          percent: number | null;
          buy_qty: number | null;
          pay_qty: number | null;
          target_kind: string;
          target_id: string;
          valid_from: string;
          valid_to: string;
          weekdays: string;
          active: number;
          version: number;
          removed: number;
        }
      >(
        `SELECT name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from,
                valid_to, weekdays, active, version, removed
         FROM discounts WHERE id = ?`,
      )
      .get(id);
    return (
      record && {
        ...record,
        weekdays: JSON.parse(record.weekdays) as number[],
        active: record.active === 1,
        removed: record.removed === 1,
      }
    );
  }

  role(id: string) {
    const record = this.database
      .prepare<
        [string],
        { name: string | null; is_administrator: number; version: number; removed: number }
      >("SELECT name, is_administrator, version, removed FROM roles WHERE id = ?")
      .get(id);
    if (record === undefined) {
      return undefined;
    }
    const permissions = this.database
      .prepare<[string], { permission_key: string; active: number }>(
        "SELECT permission_key, active FROM role_permissions WHERE role_id = ? ORDER BY permission_key",
      )
      .all(id);
    return {
      ...record,
      is_administrator: record.is_administrator === 1,
      removed: record.removed === 1,
      permissions: permissions.map((permission) => ({
        ...permission,
        active: permission.active === 1,
      })),
    };
  }
}
