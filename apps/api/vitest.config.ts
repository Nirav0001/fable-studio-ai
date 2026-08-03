import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests must exercise the deterministic engines, never the network:
    // force the mock AI provider regardless of keys in apps/api/.env.
    env: {
      AI_PROVIDER: "mock",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "",
      ELEVENLABS_API_KEY: "",
    },
  },
});
