CREATE TABLE "saved_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"retailer" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"category" "item_category",
	"image_url" text,
	"product_url" text NOT NULL,
	"affiliate_url" text NOT NULL,
	"currency" text NOT NULL,
	"price_snapshot" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_products_user_id_product_id_key" UNIQUE("user_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "saved_products" ADD CONSTRAINT "saved_products_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_products_user_id_idx" ON "saved_products" USING btree ("user_id");