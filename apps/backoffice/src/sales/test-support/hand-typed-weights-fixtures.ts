import type { HandTypedWeightsBody } from "@purosur/contracts";

const ANA_ID = "11111111-1111-4111-8111-111111111111";
const BETO_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_CASHIER_ID = "33333333-3333-4333-8333-333333333333";

export const handTypedWeightsReport: HandTypedWeightsBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  cashiers: [
    { cashier_id: BETO_ID, name: "Beto", weighed_lines: 10, typed_lines: 6 },
    { cashier_id: UNKNOWN_CASHIER_ID, name: null, weighed_lines: 2, typed_lines: 2 },
    { cashier_id: ANA_ID, name: "Ana", weighed_lines: 30, typed_lines: 1 },
  ],
  sessions: [
    {
      session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      register_name: "Caja principal",
      opened_at: "2026-10-06T11:30:00.000Z",
      weighed_lines: 12,
      typed_lines: 8,
    },
    {
      session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      register_name: "Caja del fondo",
      opened_at: "2026-10-05T21:05:00.000Z",
      weighed_lines: 30,
      typed_lines: 1,
    },
  ],
  totals: {
    weighed_lines: 42,
    typed_lines: 9,
    most_typed: { cashier_id: BETO_ID, name: "Beto", typed_lines: 6 },
  },
};

export const singleTypedWeightReport: HandTypedWeightsBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  cashiers: [{ cashier_id: ANA_ID, name: "Ana", weighed_lines: 3, typed_lines: 1 }],
  sessions: [
    {
      session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      register_name: "Caja principal",
      opened_at: "2026-10-07T12:00:00.000Z",
      weighed_lines: 3,
      typed_lines: 1,
    },
  ],
  totals: {
    weighed_lines: 3,
    typed_lines: 1,
    most_typed: { cashier_id: ANA_ID, name: "Ana", typed_lines: 1 },
  },
};

export const noHandTypedWeightsReport: HandTypedWeightsBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  cashiers: [],
  sessions: [],
  totals: { weighed_lines: 0, typed_lines: 0, most_typed: null },
};

export const scaleWeightsReport: HandTypedWeightsBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  cashiers: [{ cashier_id: ANA_ID, name: "Ana", weighed_lines: 3, typed_lines: 0 }],
  sessions: [
    {
      session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      register_name: "Caja principal",
      opened_at: "2026-10-07T12:00:00.000Z",
      weighed_lines: 3,
      typed_lines: 0,
    },
  ],
  totals: { weighed_lines: 3, typed_lines: 0, most_typed: null },
};
