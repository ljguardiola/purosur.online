import type { SyncChange } from "@purosur/contracts";
import {
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import type { PulledEntity } from "@purosur/domain/sync/use-cases";
import type { RegisterPulledChange } from "../pulled-change";

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const OTHER_ID = "9b2f1c3e-58a4-4f0e-8a4d-3c1f7a5e2d10";

type RemovableEntity = Extract<SyncChange, { entity: "removal" }>["removed_entity"];

function upsertOf(entity: PulledEntity, changeSeq: number): SyncChange {
  const base = { change_seq: changeSeq, entity_id: ID };
  switch (entity) {
    case "branch_settings":
      return {
        ...base,
        entity,
        row: {
          address: "Av. Belgrano 1450, CABA",
          whatsapp_number: "+54 9 11 3333-2211",
          instagram_handle: "@purosur.dietetica",
          monday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
          tuesday_hours: [],
          wednesday_hours: [],
          thursday_hours: [],
          friday_hours: [],
          saturday_hours: [],
          sunday_hours: [],
          expiring_lot_alert_days: 30,
          unreviewed_price_alert_days: 30,
          good_condition_return_days: 15,
          version: 1,
        },
      };
    case "branch_first_cash_session":
      return { ...base, entity, row: { opened_at: "2026-10-10T12:00:00.000Z" } };
    case "category":
      return { ...base, entity, row: { name: "Almacén", parent_id: null, version: 1 } };
    case "product":
      return {
        ...base,
        entity,
        row: {
          name: "Arroz largo fino 1 kg",
          category_id: OTHER_ID,
          brand_id: null,
          sale_unit: "UNIT",
          active: true,
          net_content: { quantity: 1, unit: "KG" },
          barcodes: [{ position: 0, code: "7790001000011" }],
          tag_ids: [OTHER_ID],
          version: 1,
        },
      };
    case "tag":
      return { ...base, entity, row: { name: "Sin TACC", active: true, version: 1 } };
    case "price_list":
      return { ...base, entity, row: { name: "Minorista", version: 1 } };
    case "price":
      return {
        ...base,
        entity,
        row: {
          product_id: OTHER_ID,
          price_list_id: OTHER_ID,
          unit_price: 1500,
          valid_from: "2026-10-01T00:00:00.000Z",
          version: 1,
        },
      };
    case "user":
      return {
        ...base,
        entity,
        row: {
          first_name: "Ada",
          role_id: OTHER_ID,
          salt: "c2FsdA",
          pin_hash: "hash-del-pin",
          active: true,
          version: 1,
        },
      };
    case "role":
      return {
        ...base,
        entity,
        row: {
          name: "Cajera",
          is_administrator: false,
          permission_keys: ["sell_and_charge"],
          version: 1,
        },
      };
    case "register":
      return { ...base, entity, row: { name: "Caja 1", version: 1 } };
    case "register_point_of_sale":
      return {
        ...base,
        entity,
        row: {
          point_of_sale_number: 12,
          fiscal_address_id: OTHER_ID,
          tax_authority_last_authorized_number: 4,
          version: 1,
        },
      };
    case "register_point_terminal":
      return { ...base, entity, row: { assigned: true, version: 1 } };
    case "register_offline_point_of_sale":
      return {
        ...base,
        entity,
        row: {
          point_of_sale_number: 31,
          tax_authority_last_authorized_number: 4,
          highest_synced_offline_number: null,
          version: 1,
        },
      };
    case "discount":
      return {
        ...base,
        entity,
        row: {
          name: "Martes de infusiones",
          benefit: { kind: "PERCENT_OFF", percent: 10 },
          target: { kind: "TAG", id: OTHER_ID },
          valid_from: "2026-10-01",
          valid_to: "2026-10-31",
          weekdays: [2, 4],
          active: true,
          version: 1,
        },
      };
    case "issuer_identification":
      return {
        ...base,
        entity,
        row: {
          legal_name: FICTIONAL_LEGAL_NAME,
          gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
          activity_start_date: "2020-03-01",
          authorized_cuit: "20000000001",
          tax_status: "Responsable Monotributo",
          version: 1,
        },
      };
    case "buyer_identification_threshold":
      return {
        ...base,
        entity,
        row: { amount: 10_000_000, valid_from: "2026-01-01", revision: 0 },
      };
    case "buyer_tax_status_set":
      return {
        ...base,
        entity,
        row: {
          params_version: 1,
          options: [{ code: 5, description: "Consumidor Final", invoice_class: "C" }],
        },
      };
    case "refund_completion":
      return {
        ...base,
        entity,
        row: { done_by: OTHER_ID, done_at: "2026-10-10T16:45:00.000Z" },
      };
    case "stock_movement":
      return {
        ...base,
        entity,
        row: {
          product_id: OTHER_ID,
          kind: "adjustment",
          delta: 4000,
          occurred_at: "2026-10-09T15:00:00.000Z",
          superseded_by_count_id: null,
          version: 1,
        },
      };
    case "offline_authorization_code":
      return {
        ...base,
        entity,
        row: {
          fortnight_start: "2026-10-01",
          fortnight_end: "2026-10-15",
          code: "70000000000001",
          report_deadline: "2026-10-20",
          version: 1,
        },
      };
    case "offline_number_block":
      return {
        ...base,
        entity,
        row: {
          point_of_sale_number: 31,
          document_type: "factura_c",
          first_number: 1,
          last_number: 50,
          status: "in_use",
          version: 1,
        },
      };
  }
}

const REMOVABLE_ENTITIES: readonly RemovableEntity[] = [
  "category",
  "product",
  "tag",
  "price",
  "user",
  "role",
  "register",
  "discount",
];

function isRemovable(entity: PulledEntity): entity is RemovableEntity {
  return REMOVABLE_ENTITIES.some((removable) => removable === entity);
}

function pulled(change: SyncChange): RegisterPulledChange {
  return { changeSeq: change.change_seq, change };
}

export function changesOfEntity(entity: PulledEntity): RegisterPulledChange[] {
  const upsert = pulled(upsertOf(entity, 1));
  if (!isRemovable(entity)) {
    return [upsert];
  }
  return [
    upsert,
    pulled({
      change_seq: 2,
      entity: "removal",
      entity_id: ID,
      removed_entity: entity,
      version: 2,
    }),
  ];
}
