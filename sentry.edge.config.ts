// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://00351180a6ab7807aa87ad775e62e410@o4511222056222720.ingest.us.sentry.io/4511222059565056",

  // Sample 20% of transactions to stay within free quota limits
  tracesSampleRate: 0.2,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Don't send PII (member names, emails, IP addresses) to Sentry
  sendDefaultPii: false,
});
