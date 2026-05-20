import AddIcon from "@mui/icons-material/Add";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef, type GridEventListener, type GridRenderCellParams, type GridRowParams, Toolbar } from "@mui/x-data-grid";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "./components/app-shell";
import {
  CopyButton,
  CreateLinkDialog,
  CreateOrganizationDialog,
  CreateTeamDialog,
  EditLinkDialog,
  EmptyDashboard,
  InviteMemberDialog,
} from "./components/dialogs";
import { useWorkspace } from "./hooks/use-workspace-context";
import { roleLabel } from "./types";
import type { Invitation, OrganizationSummary, Team } from "./types";

function LandingPage() {
  const navigate = useNavigate();
  const { session, sessionPending, signIn, signUp, submitting } = useWorkspace();
  const [email, setEmail] = useState("owner@example.com");
  const [name, setName] = useState("Anders");
  const [password, setPassword] = useState("Password123!");

  if (sessionPending) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (session) {
    void navigate("/app/select-organization", { replace: true });
    return null;
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, rgba(139,92,246,0.24), transparent 35%), #070b16",
        display: "grid",
        placeItems: "center",
        p: 3,
      }}
    >
      <Stack direction={{ xs: "column", md: "row" }} spacing={4} sx={{ width: "100%", maxWidth: 1200 }}>
        <Paper
          sx={{
            flex: 1.3,
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
        <Card sx={{ flex: 1, border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={2}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Sign in or create your first workspace
              </Typography>
              <input hidden aria-hidden value={name} readOnly />
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>Name</Typography>
                <input data-testid="auth-name-input" value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>Email</Typography>
                <input data-testid="auth-email-input" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>Password</Typography>
                <input data-testid="auth-password-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} />
              </Box>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  disabled={submitting === "signin"}
                  onClick={() => void signIn({ email, password }).then((ok: boolean) => ok && navigate("/app/select-organization"))}
                >
                  Sign in
                </Button>
                <Button
                  variant="outlined"
                  disabled={submitting === "signup"}
                  data-testid="create-account-button"
                  onClick={() => void signUp({ name, email, password }).then((ok: boolean) => ok && navigate("/app/select-organization"))}
                >
                  Create account
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function OrganizationSelectionPage() {
  const navigate = useNavigate();
  const { activeOrganizationId, createOrganization, loadingOrganizations, organizations, session, submitting, switchOrganization } = useWorkspace();
  const [createOrganizationOpen, setCreateOrganizationOpen] = useState(false);

  if (!session) {
    void navigate("/", { replace: true });
    return null;
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, rgba(139,92,246,0.24), transparent 35%), #070b16",
        display: "grid",
        placeItems: "center",
        p: 3,
      }}
    >
      <Paper sx={{ width: "100%", maxWidth: 960, p: 4, border: "1px solid rgba(255,255,255,0.08)" }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
              Choose your organization
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Pick the workspace you want to manage. If you do not have one yet, create an organization now or wait for an invitation from an admin.
            </Typography>
          </Box>
          {loadingOrganizations ? <CircularProgress /> : null}
          {organizations.length ? (
            <Stack spacing={2}>
              {organizations.map((organization: OrganizationSummary) => (
                <Paper key={organization.id} sx={{ p: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {organization.name}
                      </Typography>
                      <Typography color="text.secondary">/{organization.slug ?? "organization"}</Typography>
                    </Box>
                    <Button
                      variant={activeOrganizationId === organization.id ? "contained" : "outlined"}
                      onClick={() => void switchOrganization(organization.id).then(() => navigate("/app/dashboard"))}
                    >
                      Open workspace
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Alert severity="info">
              No organizations are available yet. Create one now to get started, or wait for an invitation if an administrator plans to add you.
            </Alert>
          )}
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={() => setCreateOrganizationOpen(true)}>
              Create organization
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <CreateOrganizationDialog
        open={createOrganizationOpen}
        submitting={submitting === "create-organization"}
        onClose={() => setCreateOrganizationOpen(false)}
        onSubmit={async (values) => {
          const createdOrganizationId = await createOrganization(values);
          if (createdOrganizationId) {
            navigate("/app/dashboard");
            return true;
          }
          return false;
        }}
      />
    </Box>
  );
}

function DashboardPage() {
  return <EmptyDashboard />;
}

function LinksPage() {
  const navigate = useNavigate();
  const { activeTeam, activeTeamId, appOrigin, createLink, links, loadingLinks, submitting, teams } = useWorkspace();
  const [createLinkOpen, setCreateLinkOpen] = useState(false);

  const columns = useMemo<GridColDef[]>(
    () => [
      {
        field: "fullLink",
        headerName: "Full link",
        flex: 1.2,
        minWidth: 240,
        sortable: false,
        valueGetter: (_value, row) => `${appOrigin}/l/${row.slug}`,
        renderCell: (params: GridRenderCellParams) => (
          <CopyButton value={params.value as string} />
        ),
      },
      {
        field: "targetUrl",
        headerName: "Destination",
        flex: 1.2,
        minWidth: 260,
      },
      {
        field: "title",
        headerName: "Title",
        flex: 1,
        minWidth: 180,
        valueGetter: (value, row) => value || row.slug,
      },
      {
        field: "redirectStatus",
        headerName: "Status code",
        width: 140,
      },
    ],
    [appOrigin],
  );

  const handleRowClick = (params: GridRowParams) => {
    navigate(`/app/links/${params.id}`);
  };

  const handleRowKeyDown: GridEventListener<"rowClick"> = () => undefined;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Links
          </Typography>
          <Typography color="text.secondary">
            {activeTeam ? `Showing links for ${activeTeam.name}.` : "Create a team to start managing links."}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} disabled={!activeTeamId} onClick={() => setCreateLinkOpen(true)}>
            Create link
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ border: "1px solid rgba(255,255,255,0.08)", p: 1.5 }}>
        <Box sx={{ height: 640 }}>
          <DataGrid
            rows={links}
            columns={columns}
            loading={loadingLinks}
            disableRowSelectionOnClick
            showToolbar
            slots={{ toolbar: Toolbar }}
            onRowClick={handleRowClick}
            onRowDoubleClick={handleRowKeyDown}
            sx={{
              border: 0,
              '& .MuiDataGrid-cell': { cursor: "pointer" },
              '& .MuiDataGrid-columnHeaders': { backgroundColor: "rgba(255,255,255,0.02)" },
            }}
          />
        </Box>
      </Paper>

      <CreateLinkDialog
        open={createLinkOpen}
        teams={teams}
        activeTeamId={activeTeamId}
        submitting={submitting === "create-link"}
        onClose={() => setCreateLinkOpen(false)}
        onSubmit={async (values) => {
          const createdLink = await createLink(values);
          if (createdLink) {
            navigate(`/app/links/${createdLink.id}`);
            return true;
          }
          return false;
        }}
      />
    </Stack>
  );
}

function LinkDetailsPage() {
  const navigate = useNavigate();
  const params = useParams();
  const { analytics, appOrigin, deleteLink, getLinkById, history, loadingDetails, submitting, updateLink } = useWorkspace();
  const [editOpen, setEditOpen] = useState(false);

  const link = params.linkId ? getLinkById(params.linkId) : null;

  if (!link) {
    return (
      <Alert severity="info">
        The selected link is not available in the current team. Go back to the links grid and choose another row.
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Box>
          <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate("/app/links")} sx={{ mb: 1, px: 0 }}>
            Back to links
          </Button>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {link.title || link.slug}
          </Typography>
          <Typography color="text.secondary">{link.targetUrl}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<OpenInNewIcon />} href={`/l/${link.slug}`} target="_blank" rel="noreferrer">
            Open
          </Button>
          <Button variant="contained" onClick={() => setEditOpen(true)}>
            Edit link
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ p: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
        <Stack spacing={2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Link details
          </Typography>
          <Divider />
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <Typography color="text.secondary">Full link</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography sx={{ fontFamily: "monospace" }}>{`${appOrigin}/l/${link.slug}`}</Typography>
                  <IconButton size="small" onClick={() => void navigator.clipboard.writeText(`${appOrigin}/l/${link.slug}`)}>
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </Stack>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography color="text.secondary">Destination</Typography>
                <Typography>{link.targetUrl}</Typography>
              </Box>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <Typography color="text.secondary">Status code</Typography>
                <Typography>{link.redirectStatus}</Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography color="text.secondary">State</Typography>
                <Chip size="small" label={link.isActive ? "Active" : "Inactive"} color={link.isActive ? "success" : "default"} sx={{ mt: 0.5 }} />
              </Box>
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      <Stack direction={{ xs: "column", xl: "row" }} spacing={3}>
        <Card sx={{ flex: 1, border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              History
            </Typography>
            {loadingDetails ? <CircularProgress size={20} /> : null}
            <Stack spacing={1}>
              {history.length ? (
                history.map((item: { id: string; changedAt: string; newTargetUrl: string; oldTargetUrl: string | null }) => (
                  <Paper key={item.id} sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(item.changedAt).toLocaleString()}
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>{item.newTargetUrl}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Previous target: {item.oldTargetUrl ?? "Initial value"}
                    </Typography>
                  </Paper>
                ))
              ) : (
                <Alert severity="info">No target history for the selected link yet.</Alert>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Analytics
            </Typography>
            {loadingDetails ? <CircularProgress size={20} /> : null}
            <Stack spacing={2}>
              <Stack direction="row" spacing={2}>
                <Paper sx={{ flex: 1, p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <Typography color="text.secondary">Total clicks</Typography>
                  <Typography data-testid="analytics-total-clicks" variant="h4" sx={{ fontWeight: 800 }}>
                    {analytics.totalClicks}
                  </Typography>
                </Paper>
                <Paper sx={{ flex: 1, p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <Typography color="text.secondary">Unique visitors</Typography>
                  <Typography data-testid="analytics-unique-visitors" variant="h4" sx={{ fontWeight: 800 }}>
                    {analytics.uniqueVisitorApproximation}
                  </Typography>
                </Paper>
              </Stack>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Top countries</Typography>
                {analytics.topCountries.length ? (
                  analytics.topCountries.map((entry: { country: string | null; clicks: number }) => (
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
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <EditLinkDialog
        open={editOpen}
        link={link}
        submitting={submitting}
        onClose={() => setEditOpen(false)}
        onSubmit={async (values) => Boolean(await updateLink(link.id, values))}
        onDelete={async () => {
          const deleted = await deleteLink(link.id);
          if (deleted) {
            navigate("/app/links");
          }
          return deleted;
        }}
      />
    </Stack>
  );
}

function OrganizationPage() {
  const { createTeam, invitations, loadingInvitations, members, submitting, teams, inviteMember } = useWorkspace();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);

  const columns = useMemo<GridColDef[]>(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 200,
        valueGetter: (_value, row) => row.user.name,
      },
      {
        field: "email",
        headerName: "Email",
        flex: 1.1,
        minWidth: 240,
        valueGetter: (_value, row) => row.user.email,
      },
      {
        field: "role",
        headerName: "Role",
        width: 180,
        valueGetter: (value) => roleLabel(value),
      },
    ],
    [],
  );

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Organization
          </Typography>
          <Typography color="text.secondary">Manage members, invitations, and teams for the active organization.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateTeamOpen(true)}>
            Create team
          </Button>
          <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => setInviteOpen(true)}>
            Invite member
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ border: "1px solid rgba(255,255,255,0.08)", p: 1.5 }}>
        <Box sx={{ height: 540 }}>
          <DataGrid rows={members} columns={columns} showToolbar slots={{ toolbar: Toolbar }} sx={{ border: 0 }} />
        </Box>
      </Paper>

      <Stack direction={{ xs: "column", xl: "row" }} spacing={3}>
        <Card sx={{ flex: 1, border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Teams
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {teams.length ? teams.map((team: Team) => <Chip key={team.id} label={team.name} />) : <Alert severity="info">No teams in this organization yet.</Alert>}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, border: "1px solid rgba(255,255,255,0.08)" }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Pending invitations
            </Typography>
            {loadingInvitations ? <CircularProgress size={20} /> : null}
            <Stack spacing={1}>
              {invitations.length ? (
                invitations.map((invitation: Invitation) => (
                  <Paper key={invitation.id} sx={{ p: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <Typography sx={{ fontWeight: 700 }}>{invitation.email}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {roleLabel(invitation.role)} · {invitation.status}
                    </Typography>
                  </Paper>
                ))
              ) : (
                <Alert severity="info">No pending invitations.</Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <InviteMemberDialog
        open={inviteOpen}
        submitting={submitting === "invite-member"}
        onClose={() => setInviteOpen(false)}
        onSubmit={async (values) => inviteMember(values)}
      />
      <CreateTeamDialog
        open={createTeamOpen}
        submitting={submitting === "create-team"}
        onClose={() => setCreateTeamOpen(false)}
        onSubmit={async (values) => Boolean(await createTeam(values))}
      />
    </Stack>
  );
}

export { AppShell, DashboardPage, LandingPage, LinkDetailsPage, LinksPage, OrganizationPage, OrganizationSelectionPage };

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.02)",
  color: "white",
  font: "inherit",
  outline: "none",
} as const;
