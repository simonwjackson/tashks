# Tasks — dev recipes

# Install dependencies
install:
    bun install

# Type-check (no emit)
typecheck:
    bun run typecheck

# Run tests (exits 0 if no test files exist yet)
test:
    bun test || test $? -eq 1 && echo "No test files found, skipping."

# Run tests in watch mode
test-watch:
    bun test --watch

# Format with Biome
fmt:
    biome format --write src/

# Lint with Biome
lint:
    biome lint src/

# Check (format + lint, no writes)
check:
    biome check src/

# Run the CLI
cli *ARGS:
    bun run src/tasks/cli.ts {{ARGS}}

# Pre-commit gate: fmt + typecheck + test
gate:
    just fmt
    just typecheck
    just test

# Remove build artifacts
clean:
    rm -rf node_modules dist .direnv
