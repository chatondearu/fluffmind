CREATE TYPE "public"."admin_audit_actor" AS ENUM('admin', 'owner');--> statement-breakpoint
CREATE TABLE "admin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor" "admin_audit_actor" NOT NULL,
	"action" text NOT NULL,
	"target_workspace_id" text NOT NULL,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_targetWorkspaceId_idx" ON "admin_audit" USING btree ("target_workspace_id");--> statement-breakpoint
CREATE INDEX "admin_audit_createdAt_idx" ON "admin_audit" USING btree ("created_at");