import { argon2, randomBytes } from "node:crypto";
import type { SyncChange } from "@purosur/contracts";
import { encodePinHash, type PermissionKey, PIN_HASH_SCHEME } from "@purosur/domain";

type WithoutChangeSeq<TChange> = TChange extends SyncChange ? Omit<TChange, "change_seq"> : never;

export type CloudChange = WithoutChangeSeq<SyncChange>;

export function registerChange(register: { id: string; name: string }): CloudChange {
  return {
    entity: "register",
    entity_id: register.id,
    row: { name: register.name, version: 1 },
  };
}

export function roleChange(role: {
  id: string;
  name: string;
  permissionKeys: readonly PermissionKey[];
}): CloudChange {
  return {
    entity: "role",
    entity_id: role.id,
    row: {
      name: role.name,
      is_administrator: false,
      permission_keys: [...role.permissionKeys],
      version: 1,
    },
  };
}

function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: pin,
        nonce: salt,
        parallelism: PIN_HASH_SCHEME.parallelism,
        passes: PIN_HASH_SCHEME.passes,
        memory: PIN_HASH_SCHEME.memoryKiB,
        tagLength: PIN_HASH_SCHEME.hashLength,
      },
      (error, hash) => (error ? reject(error) : resolve(encodePinHash(hash))),
    );
  });
}

export async function pinRecord(pin: string): Promise<{ salt: string; pin_hash: string }> {
  const salt = randomBytes(PIN_HASH_SCHEME.saltLength);
  return { salt: encodePinHash(salt), pin_hash: await hashPin(pin, salt) };
}

export async function userChange(user: {
  id: string;
  firstName: string;
  roleId: string;
  pin?: string;
}): Promise<CloudChange> {
  const record =
    user.pin === undefined ? { salt: null, pin_hash: null } : await pinRecord(user.pin);
  return {
    entity: "user",
    entity_id: user.id,
    row: {
      first_name: user.firstName,
      role_id: user.roleId,
      ...record,
      active: true,
      version: 1,
    },
  };
}

export function categoryChange(category: { id: string; name: string }): CloudChange {
  return {
    entity: "category",
    entity_id: category.id,
    row: { name: category.name, parent_id: null, version: 1 },
  };
}

export function productChange(product: {
  id: string;
  name: string;
  categoryId: string;
  barcodes: readonly string[];
  saleUnit?: "UNIT" | "KG";
  active?: boolean;
}): CloudChange {
  return {
    entity: "product",
    entity_id: product.id,
    row: {
      name: product.name,
      category_id: product.categoryId,
      brand_id: null,
      sale_unit: product.saleUnit ?? "UNIT",
      active: product.active ?? true,
      net_content: null,
      barcodes: product.barcodes.map((code, position) => ({ position, code })),
      tag_ids: [],
      version: 1,
    },
  };
}

export function priceListChange(priceList: { id: string; name: string }): CloudChange {
  return {
    entity: "price_list",
    entity_id: priceList.id,
    row: { name: priceList.name, version: 1 },
  };
}

export function priceChange(price: {
  id: string;
  productId: string;
  priceListId: string;
  unitPriceCents: number;
  validFrom: string;
}): CloudChange {
  return {
    entity: "price",
    entity_id: price.id,
    row: {
      product_id: price.productId,
      price_list_id: price.priceListId,
      unit_price: price.unitPriceCents,
      valid_from: price.validFrom,
      version: 1,
    },
  };
}

export function buyerIdentificationThresholdChange(threshold: {
  id: string;
  amountCents: number;
  validFrom: string;
}): CloudChange {
  return {
    entity: "buyer_identification_threshold",
    entity_id: threshold.id,
    row: { amount: threshold.amountCents, valid_from: threshold.validFrom },
  };
}

type DiscountRow =Extract<SyncChange, { entity: "discount" }>["row"];

export function discountChange(discount: {
  id: string;
  name: string;
  benefit: DiscountRow["benefit"];
  target: DiscountRow["target"];
  validFrom: string;
  validTo: string;
}): CloudChange {
  return {
    entity: "discount",
    entity_id: discount.id,
    row: {
      name: discount.name,
      benefit: discount.benefit,
      target: discount.target,
      valid_from: discount.validFrom,
      valid_to: discount.validTo,
      weekdays: [],
      active: true,
      version: 1,
    },
  };
}
