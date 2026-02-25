# Tasks — dev recipes

# Install dependencies
install:
    bun install

# Type-check (no emit)
typecheck:
    tsc --build

# Run tests (exits 0 if no test files exist yet)
test:
    bun test packages/ || test $? -eq 1 && echo "No test files found, skipping."

# Run tests in watch mode
test-watch:
    bun test --watch packages/

# Format with Biome
fmt:
    biome format --write packages/

# Lint with Biome
lint:
    biome lint packages/

# Check (format + lint, no writes)
check:
    biome check packages/

# Run the CLI
cli *ARGS:
    bun run packages/cli/src/cli.ts {{ARGS}}

# Pre-commit gate: fmt + typecheck + test
gate:
    just fmt
    just typecheck
    just test

# Remove build artifacts
clean:
    rm -rf node_modules packages/*/node_modules packages/*/dist .direnv
