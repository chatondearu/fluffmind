ALTER TABLE "workspace_config" RENAME COLUMN "mcp_enabled" TO "agent_enabled";--> statement-breakpoint
ALTER TABLE "workspace_mcp_token" RENAME TO "workspace_agent_token";--> statement-breakpoint
ALTER TABLE "workspace_agent_token" RENAME CONSTRAINT "workspace_mcp_token_token_hash_unique" TO "workspace_agent_token_token_hash_unique";--> statement-breakpoint
ALTER INDEX "workspace_mcp_token_organizationId_idx" RENAME TO "workspace_agent_token_organizationId_idx";--> statement-breakpoint
ALTER INDEX "workspace_mcp_token_tokenHash_idx" RENAME TO "workspace_agent_token_tokenHash_idx";
