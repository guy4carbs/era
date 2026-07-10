CREATE TABLE "inbound_email_events" (
	"email_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_inbox_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "receipt_inbox_tokens_token_key" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "inbound_email_events" ADD CONSTRAINT "inbound_email_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_inbox_tokens" ADD CONSTRAINT "receipt_inbox_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_inbox_tokens_active_user_idx" ON "receipt_inbox_tokens" USING btree ("user_id") WHERE "receipt_inbox_tokens"."revoked_at" is null;