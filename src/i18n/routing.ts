export const locales = ["ko", "en", "zh-cn", "ja", "zh-tw", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";
