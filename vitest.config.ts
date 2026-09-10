import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Les sondes sont des simulations CPU-bound portant leurs propres timeouts.
    // En CI (2 vCPU), les exécuter en parallèle les faisait échouer sous la
    // charge — flakiness documentée dans .superpowers/sdd/progress.md. Série en CI.
    fileParallelism: !process.env.CI,
    // Marge pour les tests sans timeout explicite quand la machine est chargée.
    testTimeout: 120_000,
  },
});
