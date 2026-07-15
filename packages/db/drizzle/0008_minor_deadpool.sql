CREATE TYPE "public"."feed_report_reason" AS ENUM('spam', 'inappropriate', 'impersonation', 'other');--> statement-breakpoint
CREATE TYPE "public"."feed_report_status" AS ENUM('pending', 'reviewed', 'dismissed');--> statement-breakpoint
CREATE TABLE "feed_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"outfit_id" uuid,
	"era_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_posts_one_subject" CHECK (num_nonnulls("feed_posts"."outfit_id", "feed_posts"."era_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "feed_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_user_id" text NOT NULL,
	"post_id" uuid,
	"reason" "feed_report_reason" NOT NULL,
	"detail" text,
	"status" "feed_report_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_saves" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_saves_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_era_id_eras_id_fk" FOREIGN KEY ("era_id") REFERENCES "public"."eras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_reports" ADD CONSTRAINT "feed_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_reports" ADD CONSTRAINT "feed_reports_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_reports" ADD CONSTRAINT "feed_reports_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_posts_outfit_id_key" ON "feed_posts" USING btree ("outfit_id") WHERE "feed_posts"."outfit_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_posts_era_id_key" ON "feed_posts" USING btree ("era_id") WHERE "feed_posts"."era_id" is not null;--> statement-breakpoint
CREATE INDEX "feed_posts_created_at_id_idx" ON "feed_posts" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "feed_posts_user_id_created_at_idx" ON "feed_posts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_reports_status_created_at_idx" ON "feed_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feed_reports_reporter_id_created_at_idx" ON "feed_reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "post_likes_user_id_created_at_idx" ON "post_likes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "post_saves_user_id_created_at_idx" ON "post_saves" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks" USING btree ("blocked_id");