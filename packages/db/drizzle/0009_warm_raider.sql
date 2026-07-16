CREATE TYPE "public"."turnaround_angle" AS ENUM('three_quarter', 'side', 'back');--> statement-breakpoint
CREATE TYPE "public"."turnaround_job_status" AS ENUM('running', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "item_angle_renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"angle" "turnaround_angle" NOT NULL,
	"image_path" text,
	"accepted" boolean NOT NULL,
	"qa_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_angle_renders_item_id_angle_key" UNIQUE("item_id","angle")
);
--> statement-breakpoint
CREATE TABLE "item_turnaround_jobs" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "turnaround_job_status" DEFAULT 'running' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_angle_renders" ADD CONSTRAINT "item_angle_renders_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_angle_renders" ADD CONSTRAINT "item_angle_renders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_turnaround_jobs" ADD CONSTRAINT "item_turnaround_jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_turnaround_jobs" ADD CONSTRAINT "item_turnaround_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_angle_renders_item_id_idx" ON "item_angle_renders" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_turnaround_jobs_user_id_created_at_idx" ON "item_turnaround_jobs" USING btree ("user_id","created_at");