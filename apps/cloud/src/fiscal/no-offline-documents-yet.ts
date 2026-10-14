import type { OfflineDocumentsOfFortnight } from "@purosur/domain/fiscal/use-cases";

export class NoOfflineDocumentsYet implements OfflineDocumentsOfFortnight {
  async countOn(): Promise<number> {
    return 0;
  }
}
