CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"retailer" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"image_url" text,
	"product_url" text NOT NULL,
	"affiliate_url" text NOT NULL,
	"category" "item_category",
	"price_snapshot_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"size" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_user_id_product_id_key" UNIQUE("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"checkout_batch_id" uuid NOT NULL,
	"provider" text DEFAULT 'rye' NOT NULL,
	"environment" text NOT NULL,
	"intent_id" text,
	"product_id" text NOT NULL,
	"retailer" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"image_url" text,
	"product_url" text NOT NULL,
	"affiliate_url" text NOT NULL,
	"category" "item_category",
	"price_snapshot_cents" integer NOT NULL,
	"size" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"subtotal_cents" integer,
	"shipping_cents" integer,
	"tax_cents" integer,
	"total_cents" integer,
	"currency" text NOT NULL,
	"vendor_order_id" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_addresses" (
	"user_id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"address1" text NOT NULL,
	"address2" text,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sizes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"apparel_size" text,
	"denim_size" text,
	"shoe_size" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_addresses" ADD CONSTRAINT "shipping_addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sizes" ADD CONSTRAINT "user_sizes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_user_id_idx" ON "cart_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_intent_id_key" ON "orders" USING btree ("intent_id") WHERE "orders"."intent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_id_product_id_active_key" ON "orders" USING btree ("user_id","product_id") WHERE "orders"."status" in ('creating', 'retrieving_offer', 'awaiting_confirmation', 'requires_action', 'placing_order');--> statement-breakpoint
CREATE INDEX "orders_user_id_created_at_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_checkout_batch_id_idx" ON "orders" USING btree ("checkout_batch_id");