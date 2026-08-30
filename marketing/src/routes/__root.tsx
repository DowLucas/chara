import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import "@/i18n/config";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-indigo px-6">
      <div className="max-w-md text-center">
        <div className="label text-xs uppercase tracking-[0.22em] text-ochre">404 · Not bound</div>
        <h1 className="mt-6 text-7xl font-semibold tracking-[-0.035em] text-bone">Off the block.</h1>
        <p className="mt-4 text-sm text-bone-mute">
          This page isn't part of the print. The registration didn't catch.
        </p>
        <div className="mt-10">
          <Link
            to="/"
            className="label text-xs uppercase tracking-[0.2em] border border-bone px-5 py-3 text-bone hover:bg-bone hover:text-indigo transition-colors"
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-indigo px-6">
      <div className="max-w-md text-center">
        <div className="label text-xs uppercase tracking-[0.22em] text-ochre">Misprint</div>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.035em] text-bone">This page didn't load.</h1>
        <p className="mt-4 text-sm text-bone-mute">Something slipped between the blocks.</p>
        <div className="mt-10 flex justify-center gap-3">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="label text-xs uppercase tracking-[0.2em] border border-bone px-5 py-3 text-bone hover:bg-bone hover:text-indigo transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="label text-xs uppercase tracking-[0.2em] border border-bone/30 px-5 py-3 text-bone-mute hover:text-bone transition-colors"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Chara — Split bills. Keep your data." },
      { name: "description", content: "Open-source, self-hostable bill splitting. No ads, no daily cap, no bank linking. Built in Stockholm." },
      { name: "author", content: "Chara" },
      { property: "og:site_name", content: "Chara" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Chara — Split bills. Keep your data." },
      { name: "twitter:title", content: "Chara — Split bills. Keep your data." },
      { property: "og:description", content: "Open-source, self-hostable bill splitting. No ads, no daily cap, no bank linking. Built in Stockholm." },
      { name: "twitter:description", content: "Open-source, self-hostable bill splitting. No ads, no daily cap, no bank linking. Built in Stockholm." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/fa38429a-24eb-4ff3-aa05-c82a6fbf6687" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/fa38429a-24eb-4ff3-aa05-c82a6fbf6687" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Chara",
              url: "https://getchara.lovable.app",
              description:
                "Open-source, self-hostable bill splitting. Built in Stockholm.",
            },
            {
              "@type": "WebSite",
              name: "Chara",
              url: "https://getchara.lovable.app",
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
