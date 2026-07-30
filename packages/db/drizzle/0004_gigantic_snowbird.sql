CREATE TYPE "public"."mcp_token_scope" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "workspace_mcp_token" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"scope" "mcp_token_scope" NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "workspace_mcp_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "workspace_config" ADD COLUMN "mcp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "workspace_mcp_token_organizationId_idx" ON "workspace_mcp_token" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workspace_mcp_token_tokenHash_idx" ON "workspace_mcp_token" USING btree ("token_hash");