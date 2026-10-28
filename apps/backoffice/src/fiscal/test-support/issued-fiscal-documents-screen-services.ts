import { vi } from "vitest";
import type { IssuedFiscalDocumentsScreenServices } from "../issued-fiscal-documents-services";

export function createIssuedFiscalDocumentsServices(): IssuedFiscalDocumentsScreenServices {
  return {
    fetchIssuedFiscalDocuments: vi.fn(),
    fetchIssuedFiscalDocument: vi.fn(),
    fetchFiscalRegisters: vi.fn(),
  };
}
