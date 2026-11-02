export type RevokedInstallationTarget = {
  registerName: string;
  pointOfSaleNumber: number;
  fortnight: { start: string; end: string };
  installationId: string;
  revokedAt: string;
};
