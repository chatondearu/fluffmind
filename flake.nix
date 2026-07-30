{
  description = "Fluffmind — Nuxt monorepo development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        fluffmind-cli = pkgs.writeShellApplication {
          name = "fluffmind";
          runtimeInputs = with pkgs; [ nodejs_22 pnpm ];
          text = ''
            FLUFFMIND_ROOT="''${FLUFFMIND_ROOT:-${./.}}"
            exec pnpm --dir "$FLUFFMIND_ROOT" --filter @fluffmind/cli start "$@"
          '';
        };
      in {
        # Wrapper around the monorepo CLI (writeShellApplication until buildNpmPackage).
        # Override FLUFFMIND_ROOT to your working tree when developing; default is flake source.
        packages = {
          default = fluffmind-cli;
          inherit fluffmind-cli;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
            git
            jq
            docker-compose
          ];

          shellHook = ''
            # Prefer nixpkgs pnpm over a project-local corepack shim.
            export PATH="${pkgs.pnpm}/bin:${pkgs.nodejs_22}/bin:$PATH"
            export PNPM_HOME="$PWD/.pnpm"
            export PATH="$PNPM_HOME:$PATH"
            echo "[nix develop] node=$(node --version) pnpm=$(pnpm --version)"
            echo "  pnpm install && pnpm dev"
            echo "  cp .env.example .env  # set VAULT_PATH for apps/web"
          '';
        };
      });
}
