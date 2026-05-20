export type Team = {
  id: string;
  name: string;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  slug?: string;
};

export type Link = {
  id: string;
  organizationId: string;
  teamId: string;
  teamName?: string | null;
  slug: string;
  targetUrl: string;
  redirectStatus: 301 | 302 | 307;
  isActive: boolean;
  title: string | null;
  description: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  role: string | string[];
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export type Invitation = {
  id: string;
  email: string;
  role: string | string[];
  status: string;
  teamId?: string | null;
};

export type InvitationRole = "member" | "admin" | "owner";

export type HistoryItem = {
  id: string;
  oldTargetUrl: string | null;
  newTargetUrl: string;
  changedBy: string;
  changedAt: string;
};

export type AnalyticsSummary = {
  totalClicks: number;
  uniqueVisitorApproximation: number;
  topCountries: Array<{ country: string | null; clicks: number }>;
  topReferrers: Array<{ referer: string | null; clicks: number }>;
  clicksByDay: Array<{ day: string; clicks: number }>;
};

export type SelectedLinkFormValues = {
  targetUrl: string;
  title: string;
  description: string;
  redirectStatus: 301 | 302 | 307;
  isActive: boolean;
};

export type AppMessage = {
  severity: "success" | "error" | "info";
  text: string;
};

export type AuthSession = {
  id: string;
  token: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  expiresAt?: string | number;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type PasskeySummary = {
  id: string;
  name?: string | null;
  createdAt?: string | number | null;
  deviceType?: string | null;
  backedUp?: boolean;
};

export type UserSettingsFormValues = {
  name: string;
};

export type SessionData = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified?: boolean;
    image?: string | null;
    twoFactorEnabled?: boolean;
  };
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
    activeTeamId?: string | null;
  };
};

export const initialAnalytics: AnalyticsSummary = {
  totalClicks: 0,
  uniqueVisitorApproximation: 0,
  topCountries: [],
  topReferrers: [],
  clicksByDay: [],
};

export const readCollection = <T,>(value: unknown, keys: string[]): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) {
      return candidate as T[];
    }
  }

  return [];
};

export const roleLabel = (role: string | string[]) => (Array.isArray(role) ? role.join(", ") : role);
