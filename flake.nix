{
  description = "A Nix flake for building the chatgpt-md Obsidian plugin.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/526945c5798687e32d4a6f8a93660fe2ca152ae2";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;

        # The hash for the vendored yarn dependencies.
        # To get the correct HASH, run `nix-prefetch-yarn-deps yarn.lock`
        # and paste the output here.
        yarnDepsHash = "sha256-DQaU+/uRmrw5sbS3PDhpNIPAmrOzu9ypyQp+0BjwIIw=";

        chatgpt-md = pkgs.stdenv.mkDerivation rec {
          pname = "obsidian-chatgpt-md";
          version = "2.5.0";

          src = lib.cleanSource self;

          nativeBuildInputs = with pkgs; [
            nodejs_20
            yarn
            yarnConfigHook
            yarnBuildHook
          ];

          yarnOfflineCache = pkgs.fetchYarnDeps {
            yarnLock = ./yarn.lock;
            hash = yarnDepsHash;
          };

          # The yarnBuildHook runs `yarn build` by default.
          # The package.json defines this as: "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"
          # This will generate main.js, which is what we need.

          installPhase = ''
            runHook preInstall
            mkdir -p $out
            install -m 644 main.js manifest.json styles.css $out/
            runHook postInstall
          '';

          meta = {
            description = "A seamless integration of ChatGPT, OpenRouter.ai and local LLMs via Ollama into Obsidian";
            homepage = "https://github.com/bramses/chatgpt-md";
            license = lib.licenses.mit;
            maintainers = with lib.maintainers; [ ]; # Add your handle here
            platforms = lib.platforms.all;
          };
        };
      in
      {
        packages.default = chatgpt-md;
        packages.chatgpt-md = chatgpt-md;

        apps.default = {
          type = "app";
          program = "${chatgpt-md}/bin/chatgpt-md"; # This won't exist but is required for 'nix run'
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_20
            yarn
            nodePackages.eslint # For linting
            nodePackages.prettier # For formatting
            # (pkgs.callPackage ./default.nix { }) # To test the nixpkgs build
          ];
          shellHook = ''
            echo "Entered chatgpt-md dev shell."
            echo "Run 'yarn install' then 'yarn dev' to start."
          '';
        };
      });
}
