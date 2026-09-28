import {
  appendEan13CheckDigit,
  type NetContentUnit,
  PRODUCT_NAME_MAX_LENGTH,
  type SaleUnit,
} from "@purosur/domain";
import type { BranchHoursRange } from "../branch/branch-settings-read-route.js";

// RFC 2606 reserves the "example" top-level domain for documentation and sample data, so no real
// mailbox can ever collide with it.
export const SAMPLE_EMAIL_DOMAIN = "muestra.example";

export function sampleEmail(localPart: string): string {
  return `${localPart}@${SAMPLE_EMAIL_DOMAIN}`;
}

export const SAMPLE_ADMINISTRATOR = {
  firstName: "Administradora de Muestra",
  email: sampleEmail("administradora.muestra"),
};

type SampleProductBarcodePlan = { kind: "manufacturer"; code: string } | { kind: "internal" };

interface SampleProductPlan {
  name: string;
  saleUnit: SaleUnit;
  netContent: { quantity: number; unit: NetContentUnit } | null;
  barcode: SampleProductBarcodePlan;
  active: boolean;
  unitPriceCents: number;
  pricePlan: "current" | "due_for_review";
}

interface SampleLeafCategory {
  name: string;
  products: readonly SampleProductPlan[];
}

interface SampleMidCategory {
  name: string;
  leaves: readonly SampleLeafCategory[];
}

export interface SampleTopCategory {
  name: string;
  mids: readonly SampleMidCategory[];
}

interface RawLeaf {
  name: string;
  baseProductNames: readonly string[];
}

interface RawMid {
  name: string;
  leaves: readonly RawLeaf[];
}

interface RawTop {
  name: string;
  mids: readonly RawMid[];
}

const RAW_CATEGORY_TREE: readonly RawTop[] = [
  {
    name: "Almacén",
    mids: [
      {
        name: "Aceites y Aderezos",
        leaves: [
          {
            name: "Aceites",
            baseProductNames: [
              "Aceite de Girasol",
              "Aceite de Maíz",
              "Aceite de Oliva",
              "Aceite Mezcla",
            ],
          },
          {
            name: "Vinagres y Aderezos",
            baseProductNames: [
              "Vinagre de Alcohol",
              "Vinagre de Manzana",
              "Aderezo para Ensaladas",
              "Mayonesa",
            ],
          },
        ],
      },
      {
        name: "Harinas y Repostería",
        leaves: [
          {
            name: "Harinas",
            baseProductNames: [
              "Harina 000",
              "Harina Integral",
              "Harina Leudante",
              "Premezcla para Tortas",
            ],
          },
          {
            name: "Azúcares y Endulzantes",
            baseProductNames: ["Azúcar Blanca", "Azúcar Rubia", "Edulcorante en Polvo", "Miel"],
          },
        ],
      },
      {
        name: "Conservas",
        leaves: [
          {
            name: "Enlatados",
            baseProductNames: [
              "Tomate Perita en Lata",
              "Arvejas en Lata",
              "Choclo en Lata",
              "Atún en Lata",
            ],
          },
          {
            name: "Encurtidos",
            baseProductNames: [
              "Pepinos Encurtidos",
              "Aceitunas Verdes",
              "Aceitunas Negras",
              "Cebollitas Encurtidas",
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Bebidas",
    mids: [
      {
        name: "Bebidas sin Alcohol",
        leaves: [
          {
            name: "Gaseosas",
            baseProductNames: ["Gaseosa Cola", "Gaseosa Lima Limón", "Gaseosa Naranja", "Soda"],
          },
          {
            name: "Aguas",
            baseProductNames: ["Agua Mineral sin Gas", "Agua Mineral con Gas", "Agua Saborizada"],
          },
        ],
      },
      {
        name: "Bebidas con Alcohol",
        leaves: [
          {
            name: "Cervezas",
            baseProductNames: ["Cerveza Rubia", "Cerveza Negra", "Cerveza sin Alcohol"],
          },
          { name: "Vinos", baseProductNames: ["Vino Tinto", "Vino Blanco", "Vino Rosado"] },
        ],
      },
      {
        name: "Infusiones",
        leaves: [
          {
            name: "Té y Café",
            baseProductNames: ["Té Negro", "Té Verde", "Café Molido", "Café Instantáneo"],
          },
          { name: "Hierbas", baseProductNames: ["Yerba Mate", "Manzanilla", "Boldo"] },
        ],
      },
    ],
  },
  {
    name: "Limpieza",
    mids: [
      {
        name: "Limpieza de Ropa",
        leaves: [
          {
            name: "Detergentes",
            baseProductNames: [
              "Detergente para Ropa Líquido",
              "Detergente para Ropa en Polvo",
              "Jabón en Barra para Ropa",
            ],
          },
          {
            name: "Suavizantes",
            baseProductNames: ["Suavizante para Ropa", "Suavizante Concentrado"],
          },
        ],
      },
      {
        name: "Limpieza del Hogar",
        leaves: [
          {
            name: "Desinfectantes",
            baseProductNames: ["Lavandina", "Desinfectante de Pisos", "Alcohol en Gel"],
          },
          {
            name: "Accesorios de Limpieza",
            baseProductNames: [
              "Esponja de Cocina",
              "Repasador",
              "Guantes de Látex",
              "Bolsas de Residuos",
            ],
          },
        ],
      },
      {
        name: "Higiene Personal",
        leaves: [
          { name: "Jabones", baseProductNames: ["Jabón de Tocador", "Jabón Líquido para Manos"] },
          {
            name: "Shampoo y Acondicionador",
            baseProductNames: [
              "Shampoo Uso Diario",
              "Acondicionador Uso Diario",
              "Shampoo Anticaspa",
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Almacén Fresco",
    mids: [
      {
        name: "Lácteos",
        leaves: [
          {
            name: "Leches",
            baseProductNames: ["Leche Entera", "Leche Descremada", "Leche Chocolatada"],
          },
          { name: "Yogures", baseProductNames: ["Yogur Bebible", "Yogur Firme", "Yogur Griego"] },
        ],
      },
      {
        name: "Fiambres y Quesos",
        leaves: [
          { name: "Fiambres", baseProductNames: ["Jamón Cocido", "Salame", "Mortadela"] },
          {
            name: "Quesos",
            baseProductNames: ["Queso Cremoso", "Queso de Rallar", "Queso en Fetas"],
          },
        ],
      },
      {
        name: "Panificados",
        leaves: [
          { name: "Pan", baseProductNames: ["Pan Lactal", "Pan Francés", "Pan de Salvado"] },
          {
            name: "Galletitas",
            baseProductNames: ["Galletitas Dulces", "Galletitas Saladas", "Galletitas Rellenas"],
          },
        ],
      },
    ],
  },
];

const PRODUCT_DESCRIPTORS: readonly string[] = [
  "Clásico",
  "Premium",
  "Tradicional",
  "Light",
  "Sin TACC",
  "Orgánico",
  "Multipack",
  "Formato Ahorro",
];

// Deliberately overlong: every leaf's first product uses it, then gets clamped to the domain's
// maximum, so at least one sample product always needs a screen to cut its name short.
const LONG_PRODUCT_DESCRIPTOR =
  "Elaborado con Ingredientes Cuidadosamente Seleccionados, sin Conservantes Agregados y con Controles de Calidad en Cada Etapa del Proceso Productivo";

const NET_CONTENT_OPTIONS: readonly { quantity: number; unit: NetContentUnit }[] = [
  { quantity: 900, unit: "G" },
  { quantity: 1, unit: "L" },
  { quantity: 1.5, unit: "L" },
  { quantity: 500, unit: "ML" },
  { quantity: 1, unit: "KG" },
  { quantity: 6, unit: "UNIT" },
];

// GS1's 20-29 restricted-circulation range is what `internalBarcodeSequence` allocates from
// (schema.ts); "04" is a different restricted-circulation prefix, so a manufacturer-style sample
// barcode can never collide with one `allocateInternalBarcode` produces.
const MANUFACTURER_BARCODE_PREFIX = "04";

function manufacturerBarcode(sequence: number): string {
  return appendEan13CheckDigit(
    `${MANUFACTURER_BARCODE_PREFIX}${String(sequence).padStart(10, "0")}`,
  );
}

function clampToMaxLength(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function sampleProductPlansForLeaf(
  leaf: RawLeaf,
  leafIndex: number,
  nextManufacturerSequence: () => number,
): SampleProductPlan[] {
  const count = leafIndex % 2 === 0 ? 12 : 13;
  const plans: SampleProductPlan[] = [];
  for (let i = 0; i < count; i += 1) {
    const seed = leafIndex * 13 + i;
    const base = leaf.baseProductNames[i % leaf.baseProductNames.length] ?? leaf.name;
    const saleUnit: SaleUnit = seed % 4 === 3 ? "KG" : "UNIT";
    const name =
      i === 0
        ? clampToMaxLength(`${base} ${LONG_PRODUCT_DESCRIPTOR}`, PRODUCT_NAME_MAX_LENGTH)
        : `${base} ${PRODUCT_DESCRIPTORS[seed % PRODUCT_DESCRIPTORS.length]}`;
    const barcode: SampleProductBarcodePlan =
      seed % 5 < 2
        ? { kind: "manufacturer", code: manufacturerBarcode(nextManufacturerSequence()) }
        : { kind: "internal" };

    plans.push({
      name,
      saleUnit,
      netContent:
        saleUnit === "KG" ? null : (NET_CONTENT_OPTIONS[seed % NET_CONTENT_OPTIONS.length] ?? null),
      barcode,
      active: seed % 10 !== 9,
      unitPriceCents:
        saleUnit === "KG"
          ? 300_000 + ((seed * 137) % 271) * 10_000
          : 80_000 + ((seed * 137) % 2421) * 1_000,
      pricePlan: seed % 2 === 0 ? "current" : "due_for_review",
    });
  }
  return plans;
}

function buildSampleCategoryTree(): readonly SampleTopCategory[] {
  let leafIndex = 0;
  let manufacturerSequence = 1;
  const nextManufacturerSequence = (): number => {
    const value = manufacturerSequence;
    manufacturerSequence += 1;
    return value;
  };

  return RAW_CATEGORY_TREE.map((top) => ({
    name: top.name,
    mids: top.mids.map((mid) => ({
      name: mid.name,
      leaves: mid.leaves.map((leaf) => {
        const products = sampleProductPlansForLeaf(leaf, leafIndex, nextManufacturerSequence);
        leafIndex += 1;
        return { name: leaf.name, products };
      }),
    })),
  }));
}

export const SAMPLE_CATEGORY_TREE: readonly SampleTopCategory[] = buildSampleCategoryTree();

interface SampleUserPlan {
  firstName: string;
  email: string;
  active: boolean;
}

export interface SampleRolePlan {
  name: string;
  permissionKeys: readonly string[];
  users: readonly SampleUserPlan[];
}

export const SAMPLE_ROLES: readonly SampleRolePlan[] = [
  {
    name: "Cajera de Muestra",
    permissionKeys: ["sell_and_charge", "view_sales_history", "reprint_receipt", "process_return"],
    users: [
      { firstName: "Martina Gómez", email: sampleEmail("cajera.muestra"), active: true },
      {
        firstName: "Lucas Fernández",
        email: sampleEmail("cajero.inactivo.muestra"),
        active: false,
      },
    ],
  },
  {
    name: "Encargada de Turno de Muestra",
    permissionKeys: [
      "sell_and_charge",
      "close_anothers_register_session",
      "override_line_price_or_discount",
      "apply_total_discount",
      "void_sale",
      "confirm_refunds",
      "view_reports",
      "view_branch_alerts",
      "dismiss_alerts_manually",
    ],
    users: [
      { firstName: "Sofía Ramírez", email: sampleEmail("encargada.muestra"), active: true },
      {
        firstName: "Diego Torres",
        email: sampleEmail("encargado.inactivo.muestra"),
        active: false,
      },
    ],
  },
  {
    name: "Repositora de Muestra",
    permissionKeys: [
      "view_stock_balances",
      "perform_stock_counts",
      "adjust_stock",
      "record_stock_losses",
      "manage_expiration_dates",
    ],
    users: [
      { firstName: "Valentina Díaz", email: sampleEmail("repositora.muestra"), active: true },
      { firstName: "Mateo Sosa", email: sampleEmail("repositor.inactivo.muestra"), active: false },
    ],
  },
  {
    name: "Compradora de Muestra",
    permissionKeys: [
      "manage_suppliers",
      "record_purchases",
      "manage_purchase_orders",
      "receive_purchase_orders",
      "compare_prices_and_suggest_orders",
      "manage_supplier_price_lists",
    ],
    users: [
      { firstName: "Camila Herrera", email: sampleEmail("compradora.muestra"), active: true },
      {
        firstName: "Joaquín Molina",
        email: sampleEmail("comprador.inactivo.muestra"),
        active: false,
      },
    ],
  },
];

export const SAMPLE_REGISTER_NAMES: readonly string[] = ["Caja 1 de Muestra", "Caja 2 de Muestra"];

function hours(opensAt: string, closesAt: string): BranchHoursRange {
  return { opensAt, closesAt };
}

const MORNING_AND_EVENING_SHIFTS = [hours("09:00", "13:00"), hours("16:00", "20:00")];
const CLOSED_ALL_DAY: BranchHoursRange[] = [];

export const SAMPLE_BRANCH_SETTINGS = {
  address: "Avenida Ficticia 1234, Ciudad Muestra",
  whatsappNumber: "+54 9 10 5555-0100",
  instagramHandle: "@almacen..muestra",
  mondayHours: MORNING_AND_EVENING_SHIFTS,
  tuesdayHours: [hours("09:00", "20:00")],
  wednesdayHours: [hours("09:00", "20:00")],
  thursdayHours: [hours("09:00", "20:00")],
  fridayHours: [hours("09:00", "20:00")],
  saturdayHours: [hours("09:00", "14:00")],
  sundayHours: CLOSED_ALL_DAY,
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 30,
  goodConditionReturnDays: 15,
};

// RFC 5737 reserves these ranges for documentation, so no real visitor's address is ever named.
export const SAMPLE_LOCKOUT_SOURCE_ADDRESSES = {
  keptOpen: "203.0.113.10",
  closed: "203.0.113.20",
} as const;
