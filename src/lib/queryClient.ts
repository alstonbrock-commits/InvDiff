import { QueryClient } from '@tanstack/react-query';

// Single react-query client, exported so sign-out / user-switch can clear it:
// cached feeds (insights, team, transcripts) belong to the account that
// fetched them and must not survive into the next account on a shared device.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});
