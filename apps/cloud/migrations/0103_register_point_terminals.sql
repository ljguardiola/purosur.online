CREATE TABLE "register_point_terminals" (
	"register_id" uuid PRIMARY KEY NOT NULL,
	"terminal_id" text,
	"version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "register_point_terminals" ADD CONSTRAINT "register_point_terminals_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "register_point_terminals_terminal_id_key" ON "register_point_terminals" USING btree ("terminal_id");