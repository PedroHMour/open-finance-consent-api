CREATE TYPE "public"."account_type" AS ENUM('CONTA_DEPOSITO_A_VISTA', 'CONTA_POUPANCA', 'CONTA_PAGAMENTO_PRE_PAGA');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('CUSTOMER', 'CLIENT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('SUCCESS', 'DENIED');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('AWAITING_AUTHORISATION', 'AUTHORISED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."credit_debit_type" AS ENUM('CREDITO', 'DEBITO');--> statement-breakpoint
CREATE TYPE "public"."consent_rejected_by" AS ENUM('USER', 'TPP', 'ASPSP');--> statement-breakpoint
CREATE TYPE "public"."consent_rejection_reason" AS ENUM('CUSTOMER_MANUALLY_REJECTED', 'CUSTOMER_MANUALLY_REVOKED', 'CLIENT_REVOKED', 'CONSENT_EXPIRED', 'CONSENT_MAX_DATE_REACHED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('PIX', 'TED', 'BOLETO', 'CARTAO', 'PACOTE_TARIFA_SERVICOS', 'OUTROS');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"brand_name" varchar(80) NOT NULL,
	"branch_code" varchar(4) NOT NULL,
	"number" varchar(20) NOT NULL,
	"check_digit" varchar(1) NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"available_amount_cents" bigint DEFAULT 0 NOT NULL,
	"blocked_amount_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_branch_number_unique" UNIQUE("branch_code","number","check_digit")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interaction_id" uuid NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" varchar(64) NOT NULL,
	"action" varchar(64) NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"consent_id" uuid,
	"resource_type" varchar(32),
	"resource_id" varchar(64),
	"details" jsonb,
	"ip" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"client_secret_hash" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"cnpj" char(14) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "consent_accounts" (
	"consent_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "consent_accounts_consent_id_account_id_pk" PRIMARY KEY("consent_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"customer_cpf" char(11) NOT NULL,
	"customer_id" uuid,
	"status" "consent_status" DEFAULT 'AWAITING_AUTHORISATION' NOT NULL,
	"permissions" text[] NOT NULL,
	"expiration_date_time" timestamp with time zone NOT NULL,
	"status_update_date_time" timestamp with time zone DEFAULT now() NOT NULL,
	"rejected_by" "consent_rejected_by",
	"rejection_reason" "consent_rejection_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"cpf" char(11) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_cpf_unique" UNIQUE("cpf"),
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"client_id" uuid NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_client_id_key_pk" PRIMARY KEY("client_id","key")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"credit_debit_type" "credit_debit_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" varchar(140) NOT NULL,
	"counterparty_name" varchar(120),
	"booked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_accounts" ADD CONSTRAINT "consent_accounts_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_accounts" ADD CONSTRAINT "consent_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_customer_idx" ON "accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "audit_logs_consent_idx" ON "audit_logs" USING btree ("consent_id");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "consents_client_idx" ON "consents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "consents_customer_cpf_idx" ON "consents" USING btree ("customer_cpf");--> statement-breakpoint
CREATE INDEX "transactions_account_booked_idx" ON "transactions" USING btree ("account_id","booked_at");