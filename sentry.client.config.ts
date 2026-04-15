// This file configures the initialization of Sentry on the browser.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://00351180a6ab7807aa87ad775e62e410@o4511222056222720.ingest.us.sentry.io/4511222059565056",

  // Sample 20% of transactions to stay within free quota limits
  tracesSampleRate: 0.2,

  // Don't send PII (member names, emails, IP addresses) to Sentry
  sendDefaultPii: false,
});
