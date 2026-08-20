import { createRoute, z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.string(),
    issues: z.array(z.unknown()).optional(),
  })
  .openapi("Error");

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorSchema } },
});

/** Error responses every authenticated route can produce. */
export const authErrorResponses = {
  401: errorResponse("Authentication required"),
  403: errorResponse("Forbidden"),
};

export const notFoundResponse = { 404: errorResponse("Not found") };
export const badRequestResponse = { 400: errorResponse("Validation failed") };

/** All protected routes authenticate with the Better Auth session cookie. */
export const cookieSecurity = [{ cookieAuth: [] }];

const MAX_TARGET_URL_LENGTH = 2048;

/**
 * Redirect targets must be absolute http(s) URLs without embedded credentials.
 * zod's `.url()` only checks WHATWG parseability, which would accept
 * javascript:, data:, file:, intent: etc. and turn the shortener into an
 * arbitrary-scheme redirector.
 */
export const TargetUrlSchema = z
  .string()
  .trim()
  .min(1, "Target URL is required")
  .max(MAX_TARGET_URL_LENGTH, `Target URL must be at most ${MAX_TARGET_URL_LENGTH} characters`)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
      } catch {
        return false;
      }
    },
    { message: "Target URL must be an absolute http(s) URL without credentials" },
  )
  .openapi({ example: "https://example.com/landing" });

/** Optional free text; blank strings are treated as "not provided". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/** Optional-or-clearable free text for updates: undefined = keep, blank/null = clear. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

export const LinkSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    teamId: z.string(),
    teamName: z.string().nullable().optional(),
    slug: z.string(),
    targetUrl: z.string(),
    redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307)]),
    isActive: z.boolean(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    createdBy: z.string().nullable(),
    updatedBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Link");

export type LinkDto = z.infer<typeof LinkSchema>;

export const OrganizationLinksParamsSchema = z.object({
  organizationId: z.string().openapi({ param: { name: "organizationId", in: "path" } }),
});

export const CreateLinkBodySchema = z.object({
  teamId: z.string(),
  targetUrl: TargetUrlSchema,
  redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307)]).default(302),
  title: optionalText(120),
  description: optionalText(280),
});

export const UpdateLinkBodySchema = z.object({
  targetUrl: TargetUrlSchema.optional(),
  redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307)]).optional(),
  isActive: z.boolean().optional(),
  title: nullableText(120),
  description: nullableText(280),
});

export const HistoryItemSchema = z
  .object({
    id: z.string(),
    oldTargetUrl: z.string().nullable(),
    newTargetUrl: z.string(),
    changedBy: z.string().nullable(),
    changedAt: z.string(),
  })
  .openapi("LinkTargetHistoryItem");

export const AnalyticsSummarySchema = z
  .object({
    totalClicks: z.number(),
    uniqueVisitorApproximation: z.number(),
    topCountries: z.array(z.object({ country: z.string().nullable(), clicks: z.number() })),
    topReferrers: z.array(z.object({ referer: z.string().nullable(), clicks: z.number() })),
    clicksByDay: z.array(z.object({ day: z.string(), clicks: z.number() })),
  })
  .openapi("AnalyticsSummary");

export const TeamMemberSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    createdAt: z.string().nullable(),
  })
  .openapi("TeamMember");

export const teamMembersRoute = createRoute({
  method: "get",
  path: "/api/teams/{teamId}/members",
  summary: "List the members of a team (org owners/admins and team members)",
  request: {
    params: z.object({
      teamId: z.string().openapi({ param: { name: "teamId", in: "path" } }),
    }),
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "Team members",
      content: { "application/json": { schema: z.array(TeamMemberSchema) } },
    },
    ...authErrorResponses,
    ...notFoundResponse,
  },
});

export const linkListRoute = createRoute({
  method: "get",
  path: "/api/teams/{teamId}/links",
  request: {
    params: z.object({
      teamId: z.string().openapi({ param: { name: "teamId", in: "path" } }),
    }),
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "List links in a team",
      content: { "application/json": { schema: z.array(LinkSchema) } },
    },
    ...authErrorResponses,
    ...notFoundResponse,
  },
});

export const organizationLinkListRoute = createRoute({
  method: "get",
  path: "/api/organizations/{organizationId}/links",
  request: {
    params: OrganizationLinksParamsSchema,
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "List links visible in an organization",
      content: { "application/json": { schema: z.array(LinkSchema) } },
    },
    ...authErrorResponses,
  },
});

export const createLinkRoute = createRoute({
  method: "post",
  path: "/api/links",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateLinkBodySchema,
        },
      },
    },
  },
  security: cookieSecurity,
  responses: {
    201: {
      description: "Link created",
      content: { "application/json": { schema: LinkSchema } },
    },
    ...badRequestResponse,
    ...authErrorResponses,
    ...notFoundResponse,
  },
});

export const getLinkRoute = createRoute({
  method: "get",
  path: "/api/links/{linkId}",
  request: {
    params: z.object({
      linkId: z.string().openapi({ param: { name: "linkId", in: "path" } }),
    }),
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "Link detail",
      content: { "application/json": { schema: LinkSchema } },
    },
    ...authErrorResponses,
    ...notFoundResponse,
  },
});

export const updateLinkRoute = createRoute({
  method: "patch",
  path: "/api/links/{linkId}",
  request: {
    params: z.object({
      linkId: z.string().openapi({ param: { name: "linkId", in: "path" } }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateLinkBodySchema,
        },
      },
    },
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "Link updated",
      content: { "application/json": { schema: LinkSchema } },
    },
    ...badRequestResponse,
    ...authErrorResponses,
    ...notFoundResponse,
  },
});

export const deleteLinkRoute = createRoute({
  method: "delete",
  path: "/api/links/{linkId}",
  request: {
    params: z.object({
      linkId: z.string().openapi({ param: { name: "linkId", in: "path" } }),
    }),
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "Link deleted",
      content: {
        "application/json": {
          schema: z.object({ success: z.literal(true) }),
        },
      },
    },
    ...authErrorResponses,
    ...notFoundResponse,
  },
});

export const historyRoute = createRoute({
  method: "get",
  path: "/api/links/{linkId}/history",
  request: {
    params: z.object({
      linkId: z.string().openapi({ param: { name: "linkId", in: "path" } }),
    }),
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "Link history",
      content: { "application/json": { schema: z.array(HistoryItemSchema) } },
    },
    ...authErrorResponses,
    ...notFoundResponse,
  },
});

export const analyticsRoute = createRoute({
  method: "get",
  path: "/api/links/{linkId}/analytics",
  request: {
    params: z.object({
      linkId: z.string().openapi({ param: { name: "linkId", in: "path" } }),
    }),
  },
  security: cookieSecurity,
  responses: {
    200: {
      description: "Analytics summary",
      content: { "application/json": { schema: AnalyticsSummarySchema } },
    },
    ...authErrorResponses,
    ...notFoundResponse,
  },
});
