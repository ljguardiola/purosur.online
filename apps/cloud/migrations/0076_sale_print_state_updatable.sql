-- Unlike the rest of the sale, its receipt's print state moves forward as later events arrive.
GRANT UPDATE ("print_attempted_at", "printed_at") ON "sales" TO cloud_app;
