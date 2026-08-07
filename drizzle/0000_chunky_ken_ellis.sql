CREATE TABLE "ai_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"idea_id" text,
	"draft_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"reasoning" text,
	"prompt_version" text NOT NULL,
	"input_snapshot_json" jsonb NOT NULL,
	"fragment_ids_json" jsonb NOT NULL,
	"output_json" jsonb,
	"output_text" text,
	"execution_status" text NOT NULL,
	"resolution" text DEFAULT 'pending' NOT NULL,
	"retry_of_id" text,
	"error_code" text,
	"error_message" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"slug" text,
	"tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outline_json" jsonb DEFAULT '{"schemaVersion":1,"title":"","approach":"","sections":[]}'::jsonb NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'drafting' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_stale_at" timestamp with time zone,
	"source_stale_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "drafts_idea_id_unique" UNIQUE("idea_id")
);
--> statement-breakpoint
CREATE TABLE "fragments" (
	"id" text PRIMARY KEY NOT NULL,
	"capture_request_id" text,
	"content" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_fragments" (
	"idea_id" text NOT NULL,
	"fragment_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idea_fragments_idea_id_fragment_id_pk" PRIMARY KEY("idea_id","fragment_id")
);
--> statement-breakpoint
CREATE TABLE "idea_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text NOT NULL,
	"generation_id" text NOT NULL,
	"question" text NOT NULL,
	"target_gap" text,
	"why_it_matters" text,
	"answered_fragment_id" text,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"confirmed_claim" text,
	"claim_source_generation_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_fragments" ADD CONSTRAINT "idea_fragments_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_fragments" ADD CONSTRAINT "idea_fragments_fragment_id_fragments_id_fk" FOREIGN KEY ("fragment_id") REFERENCES "public"."fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_questions" ADD CONSTRAINT "idea_questions_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_questions" ADD CONSTRAINT "idea_questions_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_questions" ADD CONSTRAINT "idea_questions_answered_fragment_id_fragments_id_fk" FOREIGN KEY ("answered_fragment_id") REFERENCES "public"."fragments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_idea_started_idx" ON "ai_generations" USING btree ("idea_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_generations_draft_started_idx" ON "ai_generations" USING btree ("draft_id","started_at");--> statement-breakpoint
CREATE INDEX "drafts_idea_id_idx" ON "drafts" USING btree ("idea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fragments_capture_request_id_uidx" ON "fragments" USING btree ("capture_request_id");--> statement-breakpoint
CREATE INDEX "fragments_created_at_idx" ON "fragments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idea_fragments_fragment_id_idx" ON "idea_fragments" USING btree ("fragment_id");--> statement-breakpoint
CREATE INDEX "idea_questions_idea_dismissed_idx" ON "idea_questions" USING btree ("idea_id","dismissed_at");