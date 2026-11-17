import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cada arquivo de teste sobe um PostgreSQL embutido (PGlite/WASM) no beforeAll;
    // com a máquina ocupada isso pode passar dos 10 s padrão e pular o arquivo inteiro.
    hookTimeout: 30_000,
  },
});
