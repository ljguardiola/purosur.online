CREATE TABLE "register_contingency_ticket_keys" (
	"register_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "register_contingency_ticket_keys_register_id_version_pk" PRIMARY KEY("register_id","version")
);
--> statement-breakpoint
CREATE TABLE "register_snapshot_keys" (
	"register_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "register_snapshot_keys_register_id_version_pk" PRIMARY KEY("register_id","version")
);
--> statement-breakpoint
ALTER TABLE "register_installations" ADD COLUMN "outbox_chain_key" text;--> statement-breakpoint
ALTER TABLE "register_contingency_ticket_keys" ADD CONSTRAINT "register_contingency_ticket_keys_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_snapshot_keys" ADD CONSTRAINT "register_snapshot_keys_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;