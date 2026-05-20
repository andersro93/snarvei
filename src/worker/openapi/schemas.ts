import { createRoute, z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

export const LinkSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    teamId: z.string(),
    teamName: z.string().nullable().optional(),
    slug: z.string(),
    targetUrl: z.string().url(),
    redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307)]),
    isActive: z.boolean(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    createdBy: z.string(),
    updatedBy: z.string(),
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
  targetUrl: z.string().url(),
  redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307)]).default(302),
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(280).optional(),
});

export const UpdateLinkBodySchema = z.object({
  targetUrl: z.string().url().optional(),
  redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307)]).optional(),
  isActive: z.boolean().optional(),
  title: z.string().min(1).max(120).nullable().optional(),
  description: z.string().max(280).nullable().optional(),
});

export const HistoryItemSchema = z
  .object({
    id: z.string(),
    oldTargetUrl: z.string().nullable(),
    newTargetUrl: z.string(),
    changedBy: z.string(),
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

export const linkListRoute = createRoute({
  method: "get",
  path: "/api/teams/{teamId}/links",
  request: {
    params: z.object({
      teamId: z.string().openapi({ param: { name: "teamId", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "List links in a team",
      content: { "application/json": { schema: z.array(LinkSchema) } },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export const organizationLinkListRoute = createRoute({
  method: "get",
  path: "/api/organizations/{organizationId}/links",
  request: {
    params: OrganizationLinksParamsSchema,
  },
  responses: {
    200: {
      description: "List links visible in an organization",
      content: { "application/json": { schema: z.array(LinkSchema) } },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: ErrorSchema } },
    },
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
  responses: {
    201: {
      description: "Link created",
      content: { "application/json": { schema: LinkSchema } },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ErrorSchema } },
    },
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
  responses: {
    200: {
      description: "Link detail",
      content: { "application/json": { schema: LinkSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
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
  responses: {
    200: {
      description: "Link updated",
      content: { "application/json": { schema: LinkSchema } },
    },
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
  responses: {
    200: {
      description: "Link deleted",
      content: {
        "application/json": {
          schema: z.object({ success: z.literal(true) }),
        },
      },
    },
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
  responses: {
    200: {
      description: "Link history",
      content: { "application/json": { schema: z.array(HistoryItemSchema) } },
    },
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
  responses: {
    200: {
      description: "Analytics summary",
      content: { "application/json": { schema: AnalyticsSummarySchema } },
    },
  },
});
