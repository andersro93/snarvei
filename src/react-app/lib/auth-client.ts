import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

type ClientError = {
  message?: string | null;
} | null;

type ClientResult<T> = Promise<{
  data?: T | null;
  error?: ClientError;
}>;

type ClientQueryResult<T> = {
  data: T | null | undefined;
  error?: ClientError;
  isPending: boolean;
  isRefetching?: boolean;
  refetch: () => Promise<void>;
};

type OrganizationSummary = {
  id: string;
  name: string;
  slug?: string;
};

type SnarveiAuthClient = {
  useSession: () => ClientQueryResult<unknown>;
  useListOrganizations: () => ClientQueryResult<OrganizationSummary[]>;
  useActiveOrganization: () => ClientQueryResult<OrganizationSummary>;
  signIn: {
    email: (input: { email: string; password: string }) => ClientResult<unknown>;
  };
  signUp: {
    email: (input: { name: string; email: string; password: string }) => ClientResult<unknown>;
  };
  signOut: () => Promise<unknown>;
  organization: {
    create: (input: { name: string; slug: string }) => ClientResult<{ id?: string }>;
    list: (input: Record<string, never>) => ClientResult<OrganizationSummary[]>;
    setActive: (input: { organizationId?: string | null; organizationSlug?: string | null }) => ClientResult<unknown>;
    createTeam: (input: { name: string; organizationId: string }) => ClientResult<{ id?: string }>;
    listTeams: (input: { query: { organizationId: string } }) => ClientResult<unknown>;
    listMembers: (input: { query: { organizationId: string } }) => ClientResult<unknown>;
    listInvitations: (input: { query: { organizationId: string } }) => ClientResult<unknown>;
    inviteMember: (input: {
      email: string;
      role: string | string[];
      organizationId: string;
      teamId?: string;
    }) => ClientResult<unknown>;
    cancelInvitation: (input: { invitationId: string }) => ClientResult<unknown>;
  };
};

// Better Auth's organization plugin currently exposes non-portable inferred types under TS 6.
// Keep a narrow app-local surface here so the build stays green while preserving the methods
// this app actually uses and exercises in the E2E flow.
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      teams: { enabled: true },
    }),
  ],
}) as unknown as SnarveiAuthClient;
