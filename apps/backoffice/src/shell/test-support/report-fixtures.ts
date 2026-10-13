import type { ReportRegisterListBody } from "@purosur/contracts";

export const FRONT_REGISTER_ID = "11111111-1111-4111-8111-111111111111";
export const BACK_REGISTER_ID = "22222222-2222-4222-8222-222222222222";

export const registers: ReportRegisterListBody = {
  registers: [
    { id: FRONT_REGISTER_ID, name: "Caja principal" },
    { id: BACK_REGISTER_ID, name: "Caja del fondo" },
  ],
};
