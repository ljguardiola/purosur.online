import {
  scrubErrorReport,
  scrubErrorReportBreadcrumb,
  scrubErrorReportLog,
} from "./error-report-scrubbing.js";

type HttpBodyTarget =
  | "incomingRequest"
  | "outgoingRequest"
  | "incomingResponse"
  | "outgoingResponse";

export function errorReportingOptions() {
  const httpBodies: HttpBodyTarget[] = [];

  return {
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies,
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      // Local variable values can carry a PIN or a token that the scrubbing does not redact.
      stackFrameVariables: false,
    },
    beforeSend: scrubErrorReport,
    beforeBreadcrumb: scrubErrorReportBreadcrumb,
    beforeSendLog: scrubErrorReportLog,
  };
}
