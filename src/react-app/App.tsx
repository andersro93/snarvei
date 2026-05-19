import AddLinkIcon from "@mui/icons-material/AddLink";
import Groups2Icon from "@mui/icons-material/Groups2";
import InsightsIcon from "@mui/icons-material/Insights";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import TimelineIcon from "@mui/icons-material/Timeline";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "./lib/auth-client";

type Team = {
  id: string;
  name: string;
};

type OrganizationSummary = {
  id: string;
  name: string;
  slug?: string;
};

type Link = {
  id: string;
  slug: string;
  targetUrl: string;
  redirectStatus: 301 | 302 | 307;
  isActive: boolean;
  title: string | null;
  description: string | null;
};

type Member = {
  id: string;
  role: string | string[];
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type Invitation = {
  id: string;
  email: string;
  role: string | string[];
  status: string;
  teamId?: string | null;
};

type InvitationRole = "member" | "admin" | "owner";

const readCollection = <T,>(value: unknown, keys: string[]): T[] => {
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

type HistoryItem = {
  id: string;
  oldTargetUrl: string | null;
  newTargetUrl: string;
  changedBy: string;
  changedAt: string;
};

type AnalyticsSummary = {
  totalClicks: number;
  uniqueVisitorApproximation: number;
  topCountries: Array<{ country: string | null; clicks: number }>;
  topReferrers: Array<{ referer: string | null; clicks: number }>;
  clicksByDay: Array<{ day: string; clicks: number }>;
};

type SelectedLinkFormValues = {
  targetUrl: string;
  title: string;
  description: string;
  redirectStatus: 301 | 302 | 307;
  isActive: boolean;
};

const initialAnalytics: AnalyticsSummary = {
  totalClicks: 0,
  uniqueVisitorApproximation: 0,
  topCountries: [],
  topReferrers: [],
  clicksByDay: [],
};

const roleLabel = (role: string | string[]) => (Array.isArray(role) ? role.join(", ") : role);

function SelectedLinkEditor({
  link,
  submitting,
  onSave,
  onDelete,
}: {
  link: Link;
  submitting: string | null;
  onSave: (linkId: string, values: SelectedLinkFormValues) => Promise<void>;
  onDelete: (linkId: string) => Promise<void>;
}) {
  const [targetUrl, setTargetUrl] = useState(link.targetUrl);
  const [title, setTitle] = useState(link.title ?? "");
  const [description, setDescription] = useState(link.description ?? "");
  const [redirectStatus, setRedirectStatus] = useState<301 | 302 | 307>(link.redirectStatus);
  const [isActive, setIsActive] = useState(link.isActive);

  return (
    <Stack spacing={2}>
      <TextField
        label="Target URL"
        value={targetUrl}
        onChange={(event) => setTargetUrl(event.target.value)}
        slotProps={{ htmlInput: { "data-testid": "selected-link-target-input" } }}
      />
      <TextField
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        slotProps={{ htmlInput: { "data-testid": "selected-link-title-input" } }}
      />
      <TextField
        label="Description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { "data-testid": "selected-link-description-input" } }}
      />
      <FormControl>
        <InputLabel id="selected-link-status-label">Redirect status</InputLabel>
        <Select
          labelId="selected-link-status-label"
          label="Redirect status"
          value={redirectStatus}
          onChange={(event) => setRedirectStatus(event.target.value as 301 | 302 | 307)}
        >
          <MenuItem value={301}>301</MenuItem>
          <MenuItem value={302}>302</MenuItem>
          <MenuItem value={307}>307</MenuItem>
        </Select>
      </FormControl>
      <FormControl>
        <InputLabel id="selected-link-active-label">Active state</InputLabel>
        <Select
          labelId="selected-link-active-label"
          label="Active state"
          value={isActive ? "active" : "inactive"}
          onChange={(event) => setIsActive(event.target.value === "active")}
        >
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="inactive">Inactive</MenuItem>
        </Select>
      </FormControl>
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          onClick={() =>
            void onSave(link.id, {
              targetUrl,
              title,
              description,
              redirectStatus,
              isActive,
            })
          }
          disabled={submitting === "update-link"}
          data-testid="save-link-button"
        >
          Save changes
        </Button>
        <Button
          color="error"
          variant="outlined"
          onClick={() => void onDelete(link.id)}
          disabled={submitting === "delete-link"}
          data-testid="delete-link-button"
        >
          Delete link
        </Button>
      </Stack>
    </Stack>
  );
}

export function App() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: organizations, refetch: refetchOrganizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();

  const [email, setEmail] = useState("owner@example.com");
  const [name, setName] = useState("Anders");
  const [password, setPassword] = useState("Password123!");
  const [organizationName, setOrganizationName] = useState("Snarvei Labs");
  const [organizationSlug, setOrganizationSlug] = useState("snarvei-labs");
  const [teamName, setTeamName] = useState("Growth");
  const [linkTarget, setLinkTarget] = useState("https://example.com");
  const [linkTitle, setLinkTitle] = useState("Campaign landing page");
  const [linkDescription, setLinkDescription] = useState("Primary CTA link for the launch campaign");
  const [linkRedirectStatus, setLinkRedirectStatus] = useState<301 | 302 | 307>(302);
  const [inviteEmail, setInviteEmail] = useState("member@example.com");
  const [inviteRole, setInviteRole] = useState<InvitationRole>("member");
  const [message, setMessage] = useState<{ severity: "success" | "error" | "info"; text: string } | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(initialAnalytics);
  const [loadedOrganizationId, setLoadedOrganizationId] = useState<string | null>(null);
  const [loadedTeamId, setLoadedTeamId] = useState<string | null>(null);
  const [loadedDetailsLinkId, setLoadedDetailsLinkId] = useState<string | null>(null);

  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const appOrigin = typeof window === "undefined" ? "http://localhost:8787" : window.location.origin;

  const availableOrganizations = useMemo(() => (organizations ?? []) as OrganizationSummary[], [organizations]);

  const effectiveOrganizationId = useMemo(() => {
    if (!session) {
      return null;
    }

    if (selectedOrganizationId && availableOrganizations.some((org) => org.id === selectedOrganizationId)) {
      return selectedOrganizationId;
    }

    if (activeOrganization?.id && availableOrganizations.some((org) => org.id === activeOrganization.id)) {
      return activeOrganization.id;
    }

    return availableOrganizations[0]?.id ?? null;
  }, [activeOrganization, availableOrganizations, selectedOrganizationId, session]);

  const visibleTeams = useMemo(
    () => (effectiveOrganizationId && loadedOrganizationId === effectiveOrganizationId ? teams : []),
    [effectiveOrganizationId, loadedOrganizationId, teams],
  );
  const visibleMembers = useMemo(
    () => (effectiveOrganizationId && loadedOrganizationId === effectiveOrganizationId ? members : []),
    [effectiveOrganizationId, loadedOrganizationId, members],
  );
  const visibleInvitations = useMemo(
    () => (effectiveOrganizationId && loadedOrganizationId === effectiveOrganizationId ? invitations : []),
    [effectiveOrganizationId, invitations, loadedOrganizationId],
  );

  const effectiveTeamId = useMemo(() => {
    if (!session || !effectiveOrganizationId) {
      return null;
    }

    if (activeTeamId && visibleTeams.some((team) => team.id === activeTeamId)) {
      return activeTeamId;
    }

    return visibleTeams[0]?.id ?? null;
  }, [activeTeamId, effectiveOrganizationId, session, visibleTeams]);

  const visibleLinks = useMemo(
    () => (effectiveTeamId && loadedTeamId === effectiveTeamId ? links : []),
    [effectiveTeamId, links, loadedTeamId],
  );

  const effectiveSelectedLinkId = useMemo(() => {
    if (!session || !effectiveTeamId) {
      return null;
    }

    if (selectedLinkId && visibleLinks.some((link) => link.id === selectedLinkId)) {
      return selectedLinkId;
    }

    return visibleLinks[0]?.id ?? null;
  }, [effectiveTeamId, selectedLinkId, session, visibleLinks]);

  const selectedLink = useMemo(
    () => visibleLinks.find((link) => link.id === effectiveSelectedLinkId) ?? null,
    [effectiveSelectedLinkId, visibleLinks],
  );

  const visibleHistory = selectedLink && loadedDetailsLinkId === selectedLink.id ? history : [];
  const visibleAnalytics = selectedLink && loadedDetailsLinkId === selectedLink.id ? analytics : initialAnalytics;

  const refreshOrganizationData = async (organizationId: string, options?: { silent?: boolean }) => {
    setLoadingTeams(true);
    setLoadingMembers(true);
    setLoadingInvitations(true);

    const [teamsResult, membersResult, invitationsResult] = await Promise.allSettled([
      authClient.organization.listTeams({ query: { organizationId } }),
      authClient.organization.listMembers({ query: { organizationId } }),
      authClient.organization.listInvitations({ query: { organizationId } }),
    ]);

    if (teamsResult.status === "fulfilled") {
      const nextTeams = readCollection<Team>(teamsResult.value.data, ["teams", "data"]);
      setTeams(nextTeams);
    } else {
      setTeams([]);
      if (!options?.silent) {
        setMessage({ severity: "error", text: "Failed to load teams for the active organization." });
      }
    }

    if (membersResult.status === "fulfilled") {
      setMembers(readCollection<Member>(membersResult.value.data, ["members", "data"]));
    } else {
      setMembers([]);
      if (!options?.silent) {
        setMessage({ severity: "error", text: "Failed to load organization members." });
      }
    }

    if (invitationsResult.status === "fulfilled") {
      setInvitations(readCollection<Invitation>(invitationsResult.value.data, ["invitations", "data"]));
    } else {
      setInvitations([]);
      if (!options?.silent) {
        setMessage({ severity: "error", text: "Failed to load invitations." });
      }
    }

    setLoadedOrganizationId(organizationId);
    setLoadingTeams(false);
    setLoadingMembers(false);
    setLoadingInvitations(false);
  };

  const refreshLinks = async (teamId: string, options?: { silent?: boolean }) => {
    setLoadingLinks(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/links`, { credentials: "include" });
      if (!response.ok) {
        setLinks([]);
        setLoadedTeamId(teamId);
        if (!options?.silent) {
          setMessage({ severity: "error", text: "Failed to load team links." });
        }
        return;
      }

      const data = (await response.json()) as Link[];
      setLinks(data);
      setLoadedTeamId(teamId);
    } catch {
      setLinks([]);
      setLoadedTeamId(teamId);
      if (!options?.silent) {
        setMessage({ severity: "error", text: "Failed to load team links." });
      }
    } finally {
      setLoadingLinks(false);
    }
  };

  const refreshSelectedLinkData = async (linkId: string, options?: { silent?: boolean }) => {
    setLoadingDetails(true);
    try {
      const [historyResponse, analyticsResponse] = await Promise.all([
        fetch(`/api/links/${linkId}/history`, { credentials: "include" }),
        fetch(`/api/links/${linkId}/analytics`, { credentials: "include" }),
      ]);

      if (!historyResponse.ok || !analyticsResponse.ok) {
        setHistory([]);
        setAnalytics(initialAnalytics);
        setLoadedDetailsLinkId(linkId);
        if (!options?.silent) {
          setMessage({ severity: "error", text: "Failed to load link history or analytics." });
        }
        return;
      }

      setHistory((await historyResponse.json()) as HistoryItem[]);
      setAnalytics((await analyticsResponse.json()) as AnalyticsSummary);
      setLoadedDetailsLinkId(linkId);
    } catch {
      setHistory([]);
      setAnalytics(initialAnalytics);
      setLoadedDetailsLinkId(linkId);
      if (!options?.silent) {
        setMessage({ severity: "error", text: "Failed to load link history or analytics." });
      }
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (!effectiveOrganizationId || !session) {
      return;
    }

    queueMicrotask(() => {
      void refreshOrganizationData(effectiveOrganizationId);
    });
  }, [effectiveOrganizationId, session]);

  useEffect(() => {
    if (!effectiveTeamId || !session) {
      return;
    }

    queueMicrotask(() => {
      void refreshLinks(effectiveTeamId);
    });
  }, [effectiveTeamId, session]);

  useEffect(() => {
    if (!selectedLink?.id) {
      return;
    }

    queueMicrotask(() => {
      void refreshSelectedLinkData(selectedLink.id);
    });
  }, [selectedLink?.id]);

  const quickStats = useMemo(
    () => [
      {
        label: "Organizations",
        value: availableOrganizations.length,
        icon: <Groups2Icon color="primary" />,
      },
      {
        label: "Members",
        value: visibleMembers.length,
        icon: <MailOutlineIcon color="secondary" />,
      },
      {
        label: "Links",
        value: visibleLinks.length,
        icon: <InsightsIcon sx={{ color: "#f59e0b" }} />,
      },
    ],
    [availableOrganizations.length, visibleLinks.length, visibleMembers.length],
  );

  const signUp = async () => {
    setSubmitting("signup");
    setMessage(null);
    const result = await authClient.signUp.email({ name, email, password });
    if (result.error) {
      setMessage({ severity: "error", text: result.error.message ?? "Unable to sign up." });
    } else {
      setMessage({ severity: "success", text: "Account created." });
    }
    setSubmitting(null);
  };

  const signIn = async () => {
    setSubmitting("signin");
    setMessage(null);
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setMessage({ severity: "error", text: result.error.message ?? "Unable to sign in." });
    } else {
      setMessage({ severity: "success", text: "Signed in." });
    }
    setSubmitting(null);
  };

  const createOrganization = async () => {
    setSubmitting("create-organization");
    setMessage(null);
    const result = await authClient.organization.create({
      name: organizationName,
      slug: organizationSlug,
    });

    if (result.error) {
      setMessage({ severity: "error", text: result.error.message ?? "Unable to create organization." });
      setSubmitting(null);
      return;
    }

    const organizationListResult = await authClient.organization.list({});
    const nextOrganizations = (organizationListResult.data ?? []) as OrganizationSummary[];
    const createdOrganizationId =
      result.data?.id ??
      nextOrganizations.find((org) => org.slug === organizationSlug || org.name === organizationName)?.id ??
      null;

    await refetchOrganizations();
    if (createdOrganizationId) {
      setSelectedOrganizationId(createdOrganizationId);
      await authClient.organization.setActive({ organizationId: createdOrganizationId });
      await refreshOrganizationData(createdOrganizationId, { silent: true });
    }
    setMessage({ severity: "success", text: "Organization created." });
    setSubmitting(null);
  };

  const createTeam = async () => {
    if (!effectiveOrganizationId) return;
    setSubmitting("create-team");
    setMessage(null);
    const result = await authClient.organization.createTeam({
      name: teamName,
      organizationId: effectiveOrganizationId,
    });

    if (result.error) {
      setMessage({ severity: "error", text: result.error.message ?? "Unable to create team." });
      setSubmitting(null);
      return;
    }

    await refreshOrganizationData(effectiveOrganizationId, { silent: true });
    if (result.data?.id) {
      setActiveTeamId(result.data.id);
    }
    setMessage({ severity: "success", text: "Team created." });
    setSubmitting(null);
  };

  const createLink = async () => {
    if (!effectiveTeamId) return;
    setSubmitting("create-link");
    setMessage(null);
    const response = await fetch("/api/links", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: effectiveTeamId,
        targetUrl: linkTarget,
        redirectStatus: linkRedirectStatus,
        title: linkTitle || undefined,
        description: linkDescription || undefined,
      }),
    });

    if (!response.ok) {
      setMessage({ severity: "error", text: "Unable to create link." });
      setSubmitting(null);
      return;
    }

    const createdLink = (await response.json()) as Link;
    setLoadedTeamId(effectiveTeamId);
    setLinks((current) => [createdLink, ...current]);
    setSelectedLinkId(createdLink.id);
    setLinkTarget("https://example.com/next-destination");
    setLinkTitle("Campaign follow-up page");
    setLinkDescription("Short link created through the admin workspace");
    setMessage({ severity: "success", text: "Short link created." });
    setSubmitting(null);
  };

  const updateSelectedLink = async (linkId: string, values: SelectedLinkFormValues) => {
    setSubmitting("update-link");
    setMessage(null);
    const response = await fetch(`/api/links/${linkId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: values.targetUrl,
        title: values.title || null,
        description: values.description || null,
        redirectStatus: values.redirectStatus,
        isActive: values.isActive,
      }),
    });

    if (!response.ok) {
      setMessage({ severity: "error", text: "Unable to update the selected link." });
      setSubmitting(null);
      return;
    }

    const updatedLink = (await response.json()) as Link;
    setLinks((current) => current.map((link) => (link.id === updatedLink.id ? updatedLink : link)));
    await refreshSelectedLinkData(updatedLink.id, { silent: true });
    setMessage({ severity: "success", text: "Link updated." });
    setSubmitting(null);
  };

  const deleteSelectedLink = async (linkId: string) => {
    setSubmitting("delete-link");
    setMessage(null);
    const response = await fetch(`/api/links/${linkId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      setMessage({ severity: "error", text: "Unable to delete the selected link." });
      setSubmitting(null);
      return;
    }

    setLinks((current) => current.filter((link) => link.id !== linkId));
    setSelectedLinkId((current) => (current === linkId ? null : current));
    setMessage({ severity: "success", text: "Link deleted." });
    setSubmitting(null);
  };

  const inviteMember = async () => {
    if (!effectiveOrganizationId) return;
    setSubmitting("invite-member");
    setMessage(null);
    const result = await authClient.organization.inviteMember({
      email: inviteEmail,
      role: inviteRole,
      organizationId: effectiveOrganizationId,
      teamId: effectiveTeamId ?? undefined,
    });

    if (result.error) {
      setMessage({ severity: "error", text: result.error.message ?? "Unable to send invitation." });
      setSubmitting(null);
      return;
    }

    await refreshOrganizationData(effectiveOrganizationId, { silent: true });
    setMessage({ severity: "success", text: `Invitation sent to ${inviteEmail}.` });
    setSubmitting(null);
  };

  const cancelInvitation = async (invitationId: string) => {
    if (!effectiveOrganizationId) return;
    setSubmitting(`cancel-${invitationId}`);
    setMessage(null);
    const result = await authClient.organization.cancelInvitation({ invitationId });
    if (result.error) {
      setMessage({ severity: "error", text: result.error.message ?? "Unable to cancel invitation." });
      setSubmitting(null);
      return;
    }

    await refreshOrganizationData(effectiveOrganizationId, { silent: true });
    setMessage({ severity: "success", text: "Invitation cancelled." });
    setSubmitting(null);
  };

  const refreshWorkspace = async () => {
    setMessage(null);
    if (effectiveOrganizationId) {
      await refreshOrganizationData(effectiveOrganizationId);
    }
    if (effectiveTeamId) {
      await refreshLinks(effectiveTeamId);
    }
    if (selectedLink?.id) {
      await refreshSelectedLinkData(selectedLink.id);
    }
  };

  if (sessionPending) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, rgba(139,92,246,0.24), transparent 35%), #070b16",
      }}
    >
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 3,
                background: "linear-gradient(135deg, #8b5cf6, #22d3ee)",
              }}
            />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Snarvei
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Shortcut control for modern teams
              </Typography>
            </Box>
          </Stack>
          {session ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Button color="inherit" startIcon={<RefreshIcon />} onClick={() => void refreshWorkspace()}>
                Refresh
              </Button>
              <Button color="inherit" startIcon={<LogoutIcon />} onClick={() => authClient.signOut()}>
                Sign out
              </Button>
            </Stack>
          ) : null}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 6 }}>
        {message ? (
          <Alert severity={message.severity} sx={{ mb: 3 }}>
            {message.text}
          </Alert>
        ) : null}

        {!session ? (
          <Grid container spacing={4} sx={{ alignItems: "stretch" }}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper
                sx={{
                  p: 5,
                  minHeight: 420,
                  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(15,23,42,0.84))",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Chip label="V1 foundation" color="secondary" sx={{ mb: 2 }} />
                <Typography variant="h2" sx={{ fontWeight: 800, lineHeight: 1.05, maxWidth: 720 }}>
                  Short links you can trust long after they are shared.
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ mt: 2, maxWidth: 680 }}>
                  Manage links by organization and team, update destinations safely, and track every click through a single Cloudflare-native control plane.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 4 }}>
                  <Chip label="Cloudflare Workers" />
                  <Chip label="Better Auth organizations + teams" />
                  <Chip label="OpenAPI + Scalar" />
                </Stack>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Card sx={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <CardContent sx={{ p: 4 }}>
                  <Stack spacing={2}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      Sign in or create your first workspace
                    </Typography>
                    <TextField
                      label="Name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      slotProps={{ htmlInput: { "data-testid": "auth-name-input" } }}
                    />
                    <TextField
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      slotProps={{ htmlInput: { "data-testid": "auth-email-input" } }}
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      slotProps={{ htmlInput: { "data-testid": "auth-password-input" } }}
                    />
                    <Stack direction="row" spacing={2}>
                      <Button
                        variant="contained"
                        startIcon={<LoginIcon />}
                        onClick={() => void signIn()}
                        disabled={submitting === "signin"}
                        data-testid="sign-in-button"
                      >
                        Sign in
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => void signUp()}
                        disabled={submitting === "signup"}
                        data-testid="create-account-button"
                      >
                        Create account
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        ) : (
          <Stack spacing={4}>
            <Grid container spacing={3}>
              {quickStats.map((item) => (
                <Grid key={item.label} size={{ xs: 12, md: 4 }}>
                  <Paper sx={{ p: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Box>
                        <Typography color="text.secondary">{item.label}</Typography>
                        <Typography variant="h3" sx={{ fontWeight: 800 }}>
                          {item.value}
                        </Typography>
                      </Box>
                      {item.icon}
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Organization
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Create a workspace, switch organizations, and control who can access team-owned links.
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        label="Organization name"
                        value={organizationName}
                        onChange={(event) => setOrganizationName(event.target.value)}
                        slotProps={{ htmlInput: { "data-testid": "organization-name-input" } }}
                      />
                      <TextField
                        label="Organization slug"
                        value={organizationSlug}
                        onChange={(event) => setOrganizationSlug(event.target.value)}
                        slotProps={{ htmlInput: { "data-testid": "organization-slug-input" } }}
                      />
                      <Button
                        variant="contained"
                        onClick={() => void createOrganization()}
                        disabled={submitting === "create-organization"}
                        data-testid="create-organization-button"
                      >
                        Create organization
                      </Button>
                      <Divider />
                      <Typography variant="subtitle2">Available organizations</Typography>
                      <Stack spacing={1}>
                        {availableOrganizations.map((org) => (
                          <Button
                            key={org.id}
                            variant={effectiveOrganizationId === org.id ? "contained" : "text"}
                            onClick={() => {
                              setSelectedOrganizationId(org.id);
                              void authClient.organization.setActive({ organizationId: org.id });
                            }}
                          >
                            {org.name}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Teams
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Every link belongs to one team. Team membership is the V1 permission boundary.
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        label="Team name"
                        value={teamName}
                        onChange={(event) => setTeamName(event.target.value)}
                        slotProps={{ htmlInput: { "data-testid": "team-name-input" } }}
                      />
                      <Button
                        variant="contained"
                        onClick={() => void createTeam()}
                        disabled={!effectiveOrganizationId || submitting === "create-team"}
                        data-testid="create-team-button"
                      >
                        Create team
                      </Button>
                      <Divider />
                      <Typography variant="subtitle2">Organization teams</Typography>
                      {loadingTeams ? <CircularProgress size={20} /> : null}
                      <Stack spacing={1}>
                        {visibleTeams.map((team) => (
                          <Button
                            key={team.id}
                            variant={effectiveTeamId === team.id ? "contained" : "text"}
                            onClick={() => setActiveTeamId(team.id)}
                          >
                            {team.name}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Create link
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Slugs stay stable while targets, status, and active state can change over time.
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        label="Target URL"
                        value={linkTarget}
                        onChange={(event) => setLinkTarget(event.target.value)}
                        slotProps={{ htmlInput: { "data-testid": "create-link-target-input" } }}
                      />
                      <TextField
                        label="Title"
                        value={linkTitle}
                        onChange={(event) => setLinkTitle(event.target.value)}
                        slotProps={{ htmlInput: { "data-testid": "create-link-title-input" } }}
                      />
                      <TextField
                        label="Description"
                        value={linkDescription}
                        onChange={(event) => setLinkDescription(event.target.value)}
                        multiline
                        minRows={2}
                        slotProps={{ htmlInput: { "data-testid": "create-link-description-input" } }}
                      />
                      <FormControl>
                        <InputLabel id="create-redirect-status-label">Redirect status</InputLabel>
                        <Select
                          labelId="create-redirect-status-label"
                          label="Redirect status"
                          value={linkRedirectStatus}
                          onChange={(event) => setLinkRedirectStatus(event.target.value as 301 | 302 | 307)}
                        >
                          <MenuItem value={301}>301</MenuItem>
                          <MenuItem value={302}>302</MenuItem>
                          <MenuItem value={307}>307</MenuItem>
                        </Select>
                      </FormControl>
                      <Button
                        variant="contained"
                        startIcon={<AddLinkIcon />}
                        onClick={() => void createLink()}
                        disabled={!effectiveTeamId || submitting === "create-link"}
                        data-testid="create-link-button"
                      >
                        Generate link
                      </Button>
                      <Alert severity="info">
                        API docs are available at <strong>/scalar</strong>. Public redirects live at <strong>/l/:slug</strong>.
                      </Alert>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, lg: 5 }}>
                <Card sx={{ height: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <CardContent>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          Members and invitations
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Invite collaborators into the active organization and optionally scope the invite to the selected team.
                        </Typography>
                      </Box>
                      <MailOutlineIcon color="secondary" />
                    </Stack>
                    <Stack spacing={2}>
                      <TextField label="Invite email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
                      <FormControl>
                        <InputLabel id="invite-role-label">Role</InputLabel>
                        <Select
                          labelId="invite-role-label"
                          label="Role"
                          value={inviteRole}
                          onChange={(event) => setInviteRole(event.target.value as InvitationRole)}
                        >
                          <MenuItem value="member">member</MenuItem>
                          <MenuItem value="admin">admin</MenuItem>
                          <MenuItem value="owner">owner</MenuItem>
                        </Select>
                      </FormControl>
                      <Button
                        variant="contained"
                        onClick={() => void inviteMember()}
                        disabled={!effectiveOrganizationId || submitting === "invite-member"}
                      >
                        Send invitation
                      </Button>
                      <Divider />
                      <Typography variant="subtitle2">Members</Typography>
                      {loadingMembers ? <CircularProgress size={20} /> : null}
                      <Stack spacing={1}>
                        {visibleMembers.map((member) => (
                          <Paper key={member.id} sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                            <Typography sx={{ fontWeight: 700 }}>{member.user.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {member.user.email}
                            </Typography>
                            <Chip size="small" label={roleLabel(member.role)} sx={{ mt: 1 }} />
                          </Paper>
                        ))}
                        {!visibleMembers.length && !loadingMembers ? (
                          <Alert severity="info">No members loaded for the active organization yet.</Alert>
                        ) : null}
                      </Stack>
                      <Divider />
                      <Typography variant="subtitle2">Pending invitations</Typography>
                      {loadingInvitations ? <CircularProgress size={20} /> : null}
                      <Stack spacing={1}>
                        {visibleInvitations.map((invitation) => (
                          <Paper key={invitation.id} sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                            <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
                              <Box>
                                <Typography sx={{ fontWeight: 700 }}>{invitation.email}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {roleLabel(invitation.role)} · {invitation.status}
                                </Typography>
                              </Box>
                              <Button
                                size="small"
                                onClick={() => void cancelInvitation(invitation.id)}
                                disabled={submitting === `cancel-${invitation.id}`}
                              >
                                Cancel
                              </Button>
                            </Stack>
                          </Paper>
                        ))}
                        {!visibleInvitations.length && !loadingInvitations ? (
                          <Alert severity="info">No pending invitations.</Alert>
                        ) : null}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, lg: 7 }}>
                <Stack spacing={3}>
                  <Card sx={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <CardContent>
                      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                        Team links
                      </Typography>
                      {loadingLinks ? <CircularProgress size={20} /> : null}
                      <Stack spacing={2}>
                        {visibleLinks.map((link) => (
                          <Paper key={link.id} sx={{ p: 3, border: "1px solid rgba(255,255,255,0.06)" }}>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
                              <Box>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1, flexWrap: "wrap" }}>
                                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    {link.title || link.slug}
                                  </Typography>
                                  <Chip size="small" label={link.isActive ? "Active" : "Inactive"} color={link.isActive ? "success" : "default"} />
                                  <Chip size="small" label={link.redirectStatus} />
                                </Stack>
                                <Typography variant="body2" color="text.secondary">
                                  {link.targetUrl}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {appOrigin}/l/{link.slug}
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                <Button
                                  variant={effectiveSelectedLinkId === link.id ? "contained" : "outlined"}
                                  onClick={() => setSelectedLinkId(link.id)}
                                >
                                  Manage
                                </Button>
                                <Button href={`/l/${link.slug}`} target="_blank" rel="noreferrer">
                                  Open
                                </Button>
                              </Stack>
                            </Stack>
                          </Paper>
                        ))}
                        {!visibleLinks.length && !loadingLinks ? (
                          <Alert severity="info">Create your first link to start collecting analytics.</Alert>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, xl: 6 }}>
                      <Card sx={{ height: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <CardContent>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Selected link
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Update the target, metadata, and status without changing the public slug.
                          </Typography>
                          {selectedLink ? (
                            <SelectedLinkEditor
                              key={selectedLink.id}
                              link={selectedLink}
                              submitting={submitting}
                              onSave={updateSelectedLink}
                              onDelete={deleteSelectedLink}
                            />
                          ) : (
                            <Alert severity="info">Select a link to inspect and update it.</Alert>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid size={{ xs: 12, xl: 6 }}>
                      <Stack spacing={3}>
                        <Card sx={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                          <CardContent>
                            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                              <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                  History
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Every target update is recorded for auditability.
                                </Typography>
                              </Box>
                              <TimelineIcon color="secondary" />
                            </Stack>
                            {loadingDetails ? <CircularProgress size={20} /> : null}
                            <Stack spacing={1}>
                              {visibleHistory.map((item) => (
                                <Paper key={item.id} sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {new Date(item.changedAt).toLocaleString()}
                                  </Typography>
                                  <Typography sx={{ fontWeight: 700 }}>{item.newTargetUrl}</Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    Previous target: {item.oldTargetUrl ?? "Initial value"}
                                  </Typography>
                                </Paper>
                              ))}
                              {!visibleHistory.length && !loadingDetails ? (
                                <Alert severity="info">No target history for the selected link yet.</Alert>
                              ) : null}
                            </Stack>
                          </CardContent>
                        </Card>

                        <Card sx={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                          <CardContent>
                            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                              <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                  Analytics
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  D1-backed click summaries for the selected short link.
                                </Typography>
                              </Box>
                              <InsightsIcon sx={{ color: "#f59e0b" }} />
                            </Stack>
                            {loadingDetails ? <CircularProgress size={20} /> : null}
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                              <Grid size={{ xs: 6 }}>
                                <Paper sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <Typography color="text.secondary">Total clicks</Typography>
                                  <Typography data-testid="analytics-total-clicks" variant="h4" sx={{ fontWeight: 800 }}>
                                    {visibleAnalytics.totalClicks}
                                  </Typography>
                                </Paper>
                              </Grid>
                              <Grid size={{ xs: 6 }}>
                                <Paper sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <Typography color="text.secondary">Unique visitors</Typography>
                                  <Typography data-testid="analytics-unique-visitors" variant="h4" sx={{ fontWeight: 800 }}>
                                    {visibleAnalytics.uniqueVisitorApproximation}
                                  </Typography>
                                </Paper>
                              </Grid>
                            </Grid>
                            <Stack spacing={1}>
                              <Typography variant="subtitle2">Top countries</Typography>
                              {visibleAnalytics.topCountries.length ? (
                                visibleAnalytics.topCountries.map((entry) => (
                                  <Paper key={`${entry.country}-${entry.clicks}`} sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                                    <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                                      <Typography>{entry.country ?? "Unknown"}</Typography>
                                      <Typography color="text.secondary">{entry.clicks}</Typography>
                                    </Stack>
                                  </Paper>
                                ))
                              ) : (
                                <Alert severity="info">No click analytics recorded yet.</Alert>
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                      </Stack>
                    </Grid>
                  </Grid>
                </Stack>
              </Grid>
            </Grid>
          </Stack>
        )}
      </Container>
    </Box>
  );
}
