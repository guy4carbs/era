CREATE TYPE "public"."avatar_status" AS ENUM('creating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tryon_status" AS ENUM('running', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "avatars" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "avatar_status" DEFAULT 'creating' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"base_image_path" text,
	"source_photo_paths" jsonb,
	"vendor" text DEFAULT 'fashn' NOT NULL,
	"vendor_model_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfit_tryons" (
	"outfit_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "tryon_status" DEFAULT 'running' NOT NULL,
	"items_signature" text NOT NULL,
	"image_path" text,
	"garments_rendered" integer DEFAULT 0 NOT NULL,
	"garments_total" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_tryons" ADD CONSTRAINT "outfit_tryons_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_tryons" ADD CONSTRAINT "outfit_tryons_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_tryons_user_id_idx" ON "outfit_tryons" USING btree ("user_id");