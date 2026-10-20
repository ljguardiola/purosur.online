CREATE TABLE "tax_authority_owed_presentations" (
	"point_of_sale_number" integer NOT NULL,
	"fortnight_start" date NOT NULL,
	"listed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tax_authority_owed_presentations_pkey" PRIMARY KEY("point_of_sale_number","fortnight_start")
);
