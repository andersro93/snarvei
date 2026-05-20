import AddIcon from "@mui/icons-material/Add";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { DataGrid, type GridColDef, Toolbar } from "@mui/x-data-grid";
import { useMemo, useState } from "react";
import { CreateTeamDialog, InviteMemberDialog } from "../../components/dialogs";
import { useWorkspace } from "../../hooks/use-workspace-context";
import { roleLabel } from "../../types";
import type { Invitation, Team } from "../../types";

export function OrganizationPage() {
  const { activeOrganization, createTeam, invitations, loadingInvitations, members, submitting, teams, inviteMember } = useWorkspace();
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
          <Typography color="text.secondary">Manage members, invitations, and teams for {activeOrganization?.name ?? "the active organization"}.</Typography>
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
