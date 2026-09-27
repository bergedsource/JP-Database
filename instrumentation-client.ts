// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
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

  // In-app browsers (Snapchat, Instagram, Facebook) inject their own scripts into
  // the page. When that injected code throws, window.onerror catches it and the SDK
  // reports it as ours — it isn't, and there's nothing we can fix. Drop it so it
  // doesn't burn quota or trip the high-priority alert rule.
  //
  // Matched against the exception message, so these stay narrow on purpose: a
  // pattern broad enough to catch "any ReferenceError" would hide our own bugs.
  // Add a new entry when a new in-app browser shows up rather than widening these.
  ignoreErrors: [
    // Snapchat iOS webview's JS bridge, e.g. "Can't find variable: SCDynimacBridge"
    /SCDynimacBridge/,
    // Meta (Instagram/Facebook) webview autofill hook
    /_AutofillCallbackHandler/,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
