import {
  type AverageTicketBody,
  averageTicketSchema,
  type ReportQuery,
  type SalesByCashierBody,
  type SalesByProductAndCategoryBody,
  type SalesByProductAndCategoryQuery,
  type SalesByPromotionBody,
  type SalesReportBody,
  salesByCashierSchema,
  salesByProductAndCategorySchema,
  salesByPromotionSchema,
  salesReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchSalesReport(query: ReportQuery): Promise<CloudReadOutcome<SalesReportBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/sales-by-day";
  return readCloudJson(search ? `${path}?${search}` : path, salesReportSchema);
}

export function fetchSalesByProductAndCategory(
  query: SalesByProductAndCategoryQuery,
): Promise<CloudReadOutcome<SalesByProductAndCategoryBody>> {
  const params = new URLSearchParams({ group: query.group });
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return readCloudJson(
    `/api/reports/sales-by-product-and-category?${params.toString()}`,
    salesByProductAndCategorySchema,
  );
}

export function fetchSalesByCashier(
  query: ReportQuery,
): Promise<CloudReadOutcome<SalesByCashierBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/sales-by-cashier";
  return readCloudJson(search ? `${path}?${search}` : path, salesByCashierSchema);
}

export function fetchSalesByPromotion(
  query: ReportQuery,
): Promise<CloudReadOutcome<SalesByPromotionBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/sales-by-promotion";
  return readCloudJson(search ? `${path}?${search}` : path, salesByPromotionSchema);
}

export function fetchAverageTicket(
  query: ReportQuery,
): Promise<CloudReadOutcome<AverageTicketBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/average-ticket";
  return readCloudJson(search ? `${path}?${search}` : path, averageTicketSchema);
}
