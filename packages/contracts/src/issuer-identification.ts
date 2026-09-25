// Long enough for a ticket header line, short enough to guard against an unbounded payload: the
// same bound the cloud gives `branch_settings.address`.
export const ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH = 200;

// Ingresos Brutos registration numbers are free text: their shape varies by province (a single
// jurisdiction's plain number, or a multilateral-agreement "Convenio Multilateral" number with its
// own prefix), so this is a generous bound rather than a pattern, wide enough for any of them plus
// some surrounding notation.
export const ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH = 100;
