import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import { toast } from "sonner";
import type { AppRouter } from "../../api/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fresh enough for a wholesaler at their desk without thrash.
      staleTime: 30_000,
      // Don't refetch every time the user alt-tabs back.
      refetchOnWindowFocus: false,
      // 3 retries with backoff, but never retry auth failures.
      retry: (failureCount, error) => {
        const code = (error as { data?: { code?: string } } | null)?.data?.code;
        if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
    },
    mutations: {
      // Don't retry mutations — a webhook-driven write could double-apply.
      retry: false,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Global error surface — one toast per failure, deduped by message so a burst
// of parallel failures (e.g. the dashboard queries) doesn't stack dupes.
// The full stack stays in the dev console.
const errorToastIds = new Set<string>();
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== "updated") return;
  const query = event.query;
  if (query.state.status !== "error") return;
  const error = query.state.error as { data?: { code?: string }; message?: string } | null;
  if (error?.data?.code === "UNAUTHORIZED") {
    // Auth redirect handled elsewhere — don't double-toast.
    return;
  }
  const message =
    error?.message && error.message.length < 200
      ? error.message
      : "Something went wrong. Please try again.";
  if (errorToastIds.has(message)) return;
  errorToastIds.add(message);
  setTimeout(() => errorToastIds.delete(message), 5_000);
  toast.error(message);
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
