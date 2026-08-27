CREATE TABLE "idea_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_messages" ADD CONSTRAINT "idea_messages_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idea_messages_idea_created_idx" ON "idea_messages" USING btree ("idea_id","created_at");
