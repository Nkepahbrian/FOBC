export const PRODUCTION_SITE_URL = "https://fobc.netlify.app";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";
  if (!configured || /localhost|127\.0\.0\.1/i.test(configured)) return PRODUCTION_SITE_URL;
  return configured;
}
