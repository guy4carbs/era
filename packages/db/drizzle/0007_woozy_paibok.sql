CREATE TABLE "subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"rc_app_user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"store" text NOT NULL,
	"environment" text NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"will_renew" boolean DEFAULT false NOT NULL,
	"unsubscribe_detected_at" timestamp with time zone,
	"billing_issues_detected_at" timestamp with time zone,
	"stripe_customer_id" text,
	"last_event_id" text NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;