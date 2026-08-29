CREATE TYPE "public"."inventory_movement_type" AS ENUM('initial', 'adjustment', 'purchase', 'sale', 'return', 'damage', 'reservation_release');--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_status" AS ENUM('active', 'consumed', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'awaiting_payment', 'paid', 'processing', 'ready_to_ship', 'shipped', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_environment" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('zarinpal');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_commerce_mode" AS ENUM('direct-purchase', 'price-inquiry', 'sourcing-request');--> statement-breakpoint
CREATE TYPE "public"."product_condition" AS ENUM('new', 'used', 'refurbished', 'tested');--> statement-breakpoint
CREATE TYPE "public"."product_price_visibility" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."shipping_class" AS ENUM('standard', 'fragile', 'heavy', 'pickup-only', 'custom');--> statement-breakpoint
CREATE TYPE "public"."shipping_method" AS ENUM('tehran-courier', 'tipax', 'iran-post', 'freight', 'pickup');--> statement-breakpoint
CREATE TABLE "inventory" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_on_hand_nonnegative" CHECK ("inventory"."on_hand" >= 0),
	CONSTRAINT "inventory_reserved_nonnegative" CHECK ("inventory"."reserved" >= 0),
	CONSTRAINT "inventory_reserved_not_above_on_hand" CHECK (
          "inventory"."reserved"
          <=
          "inventory"."on_hand"
        )
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "inventory_reservation_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "inventory_reservations_quantity_range" CHECK (
          "inventory_reservations"."quantity" >= 1
          and
          "inventory_reservations"."quantity" <= 999
        )
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"brand" text NOT NULL,
	"part_number" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_rial" bigint NOT NULL,
	"line_total_rial" bigint NOT NULL,
	"shipping_class" "shipping_class" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_range" CHECK (
          "order_items"."quantity" >= 1
          and
          "order_items"."quantity" <= 999
        ),
	CONSTRAINT "order_items_unit_price_nonnegative" CHECK ("order_items"."unit_price_rial" >= 0),
	CONSTRAINT "order_items_line_total_nonnegative" CHECK ("order_items"."line_total_rial" >= 0),
	CONSTRAINT "order_items_line_total_consistent" CHECK (
          "order_items"."line_total_rial"
          =
          "order_items"."unit_price_rial"
          *
          "order_items"."quantity"
        )
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_city" text NOT NULL,
	"customer_address" text NOT NULL,
	"customer_notes" text NOT NULL,
	"shipping_method_id" "shipping_method" NOT NULL,
	"shipping_method_label" text NOT NULL,
	"subtotal_rial" bigint NOT NULL,
	"shipping_fee_rial" bigint,
	"total_rial" bigint,
	"currency" text DEFAULT 'IRR' NOT NULL,
	"payment_ready" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "orders_subtotal_nonnegative" CHECK ("orders"."subtotal_rial" >= 0),
	CONSTRAINT "orders_shipping_fee_nonnegative" CHECK (
          "orders"."shipping_fee_rial" is null
          or
          "orders"."shipping_fee_rial" >= 0
        ),
	CONSTRAINT "orders_total_nonnegative" CHECK (
          "orders"."total_rial" is null
          or
          "orders"."total_rial" >= 0
        ),
	CONSTRAINT "orders_currency_irr" CHECK ("orders"."currency" = 'IRR')
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"environment" "payment_environment" NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"amount_rial" bigint NOT NULL,
	"currency" text DEFAULT 'IRR' NOT NULL,
	"authority" text,
	"ref_id" text,
	"provider_code" integer,
	"provider_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_rial" > 0),
	CONSTRAINT "payments_currency_irr" CHECK ("payments"."currency" = 'IRR')
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"amount_rial" bigint NOT NULL,
	"currency" text DEFAULT 'IRR' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_amount_nonnegative" CHECK ("product_prices"."amount_rial" >= 0),
	CONSTRAINT "product_prices_currency_irr" CHECK ("product_prices"."currency" = 'IRR'),
	CONSTRAINT "product_prices_valid_range" CHECK (
          "product_prices"."valid_to" is null
          or
          "product_prices"."valid_to" > "product_prices"."valid_from"
        )
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" text NOT NULL,
	"sku" text,
	"part_number" text NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"manufacturer" text,
	"condition" "product_condition" NOT NULL,
	"commerce_mode" "product_commerce_mode" NOT NULL,
	"price_visibility" "product_price_visibility" NOT NULL,
	"shipping_class" "shipping_class" DEFAULT 'standard' NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_movements_product_created_idx" ON "inventory_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_active_product_order_unique" ON "inventory_reservations" USING btree ("product_id","order_id") WHERE "inventory_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_idx" ON "inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_active_expiry_idx" ON "inventory_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_phone_idx" ON "orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_authority_unique" ON "payments" USING btree ("authority") WHERE "payments"."authority" is not null;--> statement-breakpoint
CREATE INDEX "payments_order_created_idx" ON "payments" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_current_unique" ON "product_prices" USING btree ("product_id") WHERE "product_prices"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "product_prices_product_history_idx" ON "product_prices" USING btree ("product_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "products_content_id_unique" ON "products" USING btree ("content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku") WHERE "products"."sku" is not null;--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_commerce_mode_idx" ON "products" USING btree ("commerce_mode");