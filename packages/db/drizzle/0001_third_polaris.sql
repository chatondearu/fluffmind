CREATE TYPE "public"."github_link_auth_mode" AS ENUM('app', 'pat');--> statement-breakpoint
CREATE TABLE "github_app_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_app_installation_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_github_link" ALTER COLUMN "sync_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_github_link" ADD COLUMN "auth_mode" "github_link_auth_mode" DEFAULT 'pat' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_github_link" ADD COLUMN "installation_id" text;