ALTER TABLE "expenses" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "deleted_at" timestamp with time zone;