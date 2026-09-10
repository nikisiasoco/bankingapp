CREATE TYPE "public"."account_kind" AS ENUM('customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('deposit', 'withdrawal', 'transfer');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"account_number" text NOT NULL,
	"kind" "account_kind" NOT NULL,
	"balance_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_account_number_unique" UNIQUE("account_number"),
	CONSTRAINT "accounts_customer_has_user" CHECK ((kind = 'customer') = (user_id IS NOT NULL)),
	CONSTRAINT "accounts_nonnegative_balance" CHECK (kind = 'system' OR balance_minor >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_nonzero" CHECK (amount_minor <> 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "transaction_kind" NOT NULL,
	"initiated_by" uuid NOT NULL,
	"idempotency_key" text,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_one_system_account" ON "accounts" USING btree ("kind") WHERE kind = 'system';--> statement-breakpoint
CREATE INDEX "ledger_entries_account_id_id_idx" ON "ledger_entries" USING btree ("account_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_initiated_by_idempotency_key_key" ON "transactions" USING btree ("initiated_by","idempotency_key") WHERE idempotency_key IS NOT NULL;