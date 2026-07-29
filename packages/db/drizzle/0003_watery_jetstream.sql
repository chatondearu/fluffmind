CREATE TABLE "github_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"github_login" text NOT NULL,
	"github_user_id" text,
	"resolved_email" text,
	"better_auth_invitation_id" text,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "github_invitation_organizationId_idx" ON "github_invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "github_invitation_githubLogin_idx" ON "github_invitation" USING btree ("github_login");--> statement-breakpoint
CREATE INDEX "github_invitation_betterAuthInvitationId_idx" ON "github_invitation" USING btree ("better_auth_invitation_id");