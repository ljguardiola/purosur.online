import type { SupplierPriceComparison } from "@purosur/contracts";

export const PRICE_COMPARISON: SupplierPriceComparison = {
  products: [
    {
      id: "90d00000-0000-4000-8000-000000000041",
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
      offers: [
        {
          supplier: { id: "5a900000-0000-4000-8000-000000000001", name: "Frutos Secos Mendoza" },
          packagingName: "Bolsa 25 kg",
          quantityPerPackage: 25_000,
          priceCents: 25_450_000,
          pricePerSaleUnit: { numerator: "25450000", denominator: "25" },
          listDate: "2026-10-20",
          cheapest: true,
        },
        {
          supplier: { id: "5a900000-0000-4000-8000-000000000002", name: "Distribuidora del Sur" },
          packagingName: "Bolsa 5 kg",
          quantityPerPackage: 5_000,
          priceCents: 5_320_000,
          pricePerSaleUnit: { numerator: "5320000", denominator: "5" },
          listDate: "2026-09-02",
          cheapest: false,
        },
      ],
      unpricedOffers: [],
    },
    {
      id: "90d00000-0000-4000-8000-000000000042",
      name: "Miel pura de abeja 1 kg",
      categoryName: "Almacén",
      saleUnit: "UNIT",
      offers: [
        {
          supplier: { id: "5a900000-0000-4000-8000-000000000003", name: "Apícola Los Tilos" },
          packagingName: "Caja x 12",
          quantityPerPackage: 12_000,
          priceCents: 6_700_000,
          pricePerSaleUnit: { numerator: "6700000", denominator: "12" },
          listDate: "2026-10-11",
          cheapest: true,
        },
      ],
      unpricedOffers: [],
    },
    {
      id: "90d00000-0000-4000-8000-000000000043",
      name: "Galletas de avena integrales",
      categoryName: "Almacén",
      saleUnit: "UNIT",
      offers: [],
      unpricedOffers: [],
    },
  ],
};
