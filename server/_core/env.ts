export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  openAiGpt5MiniKey: process.env.OPENAI_API_KEY_GPT5_MINI ?? "",
  openAiGpt5Key: process.env.OPENAI_API_KEY_GPT5 ?? "",
  openAiGpt55Key: process.env.OPENAI_API_KEY_GPT5_5 ?? "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterGpt5MiniKey:
    process.env.OPENROUTER_API_KEY_GPT5_MINI || process.env["elunariq_free_gpt-5-mini"] || "",
  openRouterGpt5Key:
    process.env.OPENROUTER_API_KEY_GPT5 || process.env.elunariq_gpt || "",
  openRouterGpt55Key:
    process.env.OPENROUTER_API_KEY_GPT5_5 || process.env.elunariq_premium || "",
  openRouterGpt5MiniModel: process.env.OPENROUTER_MODEL_GPT5_MINI ?? "openai/gpt-5-mini",
  openRouterGpt5Model: process.env.OPENROUTER_MODEL_GPT5 ?? "openai/gpt-5",
  openRouterGpt55Model: process.env.OPENROUTER_MODEL_GPT5_5 ?? "openai/gpt-5.5",
};
