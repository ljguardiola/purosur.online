CREATE TABLE "register_contingency_intervals" (
	"interval_id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "register_contingency_intervals_ended_after_started" CHECK ("register_contingency_intervals"."ended_at" >= "register_contingency_intervals"."started_at")
);
--> statement-breakpoint
CREATE TABLE "register_contingency_reporting" (
	"register_id" uuid PRIMARY KEY NOT NULL,
	"since" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "register_contingency_intervals" ADD CONSTRAINT "register_contingency_intervals_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_contingency_reporting" ADD CONSTRAINT "register_contingency_reporting_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "register_contingency_reporting" FROM cloud_app;
