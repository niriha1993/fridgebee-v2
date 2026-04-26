import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fridgeBee — Your kitchen, always fresh",
  description: "Track your fridge, reduce waste, discover meals.",
  manifest: "/manifest.json",
  // Apple-specific PWA tags so iOS Safari "Add to Home Screen" works nicely.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FridgeBee",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon.svg" },
    ],
  },
  // Google Search Console verification — drop the meta tag value into env once
  // you've claimed the property. Meta tag method is the simplest verification.
  other: process.env.NEXT_PUBLIC_GSC_VERIFICATION
    ? { "google-site-verification": process.env.NEXT_PUBLIC_GSC_VERIFICATION }
    : {},
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#F5A623",
};

const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", margin: 0 }}>
        {children}
        {/* Vercel Web Analytics — page views, unique visitors, top pages,
            referrers, country/device breakdown. Free, privacy-friendly,
            no cookies. Data appears in vercel.com → project → Analytics tab. */}
        <Analytics />
        {/* Vercel Speed Insights — Core Web Vitals (LCP, INP, CLS) per page,
            so we can see real-user performance, not synthetic Lighthouse. */}
        <SpeedInsights />
        {/* Microsoft Clarity — session replay + heatmaps. Loads asynchronously
            after interactive so it doesn't block first paint. */}
        {CLARITY_PROJECT_ID && (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
          </Script>
        )}
        {/* Service-worker registration — required for both PWA install prompt
            and Web Push. Registers eagerly: the previous version waited for
            `window.load` which had usually already fired by the time
            afterInteractive ran, so the registration never happened on most
            visits. Now we just call `register()` directly. */}
        <Script id="sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
              .then(function(reg) { if (typeof console !== 'undefined') console.log('SW registered', reg.scope); })
              .catch(function(err) { if (typeof console !== 'undefined') console.warn('SW register failed', err); });
          }`}
        </Script>
      </body>
    </html>
  );
}
