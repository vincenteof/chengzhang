CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor" text NOT NULL,
	"api_key_cipher" text,
	"api_key_last4" text,
	"model_draft" text NOT NULL,
	"model_fast" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
