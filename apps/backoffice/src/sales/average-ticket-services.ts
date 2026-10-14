import { fetchAverageTicket } from "./sales-report-api";

export type AverageTicketScreenServices = {
  fetchAverageTicket: typeof fetchAverageTicket;
};

export const defaultAverageTicketScreenServices: AverageTicketScreenServices = {
  fetchAverageTicket,
};
