import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import type { InvitationRole, Link, SelectedLinkFormValues, Team } from "../types";

export function CreateOrganizationDialog({
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; slug: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("Snarvei Labs");
  const [slug, setSlug] = useState("snarvei-labs");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create organization</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Organization name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "organization-name-input" } }}
          />
          <TextField
            label="Organization slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "organization-slug-input" } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={submitting}
          data-testid="create-organization-button"
          onClick={() => {
            void onSubmit({ name, slug }).then((created) => {
              if (created) {
                onClose();
              }
            });
          }}
        >
          Create organization
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CreateTeamDialog({
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("Growth");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create team</DialogTitle>
      <DialogContent>
        <TextField
          sx={{ mt: 1 }}
          label="Team name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "team-name-input" } }}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={submitting}
          data-testid="create-team-button"
          onClick={() => {
            void onSubmit({ name }).then((created) => {
              if (created) {
                onClose();
              }
            });
          }}
        >
          Create team
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CreateLinkDialog({
  open,
  teams,
  activeTeamId,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  teams: Team[];
  activeTeamId: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: {
    teamId: string;
    targetUrl: string;
    redirectStatus: 301 | 302 | 307;
    title?: string;
    description?: string;
  }) => Promise<boolean>;
}) {
  const defaultTeamId = activeTeamId ?? teams[0]?.id ?? "";

  return (
    <CreateLinkDialogForm
      key={`${open}-${defaultTeamId}`}
      open={open}
      defaultTeamId={defaultTeamId}
      submitting={submitting}
      teams={teams}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function CreateLinkDialogForm({
  open,
  defaultTeamId,
  submitting,
  teams,
  onClose,
  onSubmit,
}: {
  open: boolean;
  defaultTeamId: string;
  submitting: boolean;
  teams: Team[];
  onClose: () => void;
  onSubmit: (values: {
    teamId: string;
    targetUrl: string;
    redirectStatus: 301 | 302 | 307;
    title?: string;
    description?: string;
  }) => Promise<boolean>;
}) {
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [title, setTitle] = useState("Campaign landing page");
  const [description, setDescription] = useState("Primary CTA link for the launch campaign");
  const [redirectStatus, setRedirectStatus] = useState<301 | 302 | 307>(302);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create link</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormControl>
            <InputLabel id="create-link-team-label">Team</InputLabel>
            <Select labelId="create-link-team-label" label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Target URL"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "create-link-target-input" } }}
          />
          <TextField
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "create-link-title-input" } }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { "data-testid": "create-link-description-input" } }}
          />
          <FormControl>
            <InputLabel id="create-link-status-label">Redirect status</InputLabel>
            <Select
              labelId="create-link-status-label"
              label="Redirect status"
              value={redirectStatus}
              onChange={(event) => setRedirectStatus(event.target.value as 301 | 302 | 307)}
            >
              <MenuItem value={301}>301</MenuItem>
              <MenuItem value={302}>302</MenuItem>
              <MenuItem value={307}>307</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!teamId || submitting}
          data-testid="create-link-button"
          onClick={() => {
            void onSubmit({ teamId, targetUrl, redirectStatus, title, description }).then((created) => {
              if (created) {
                onClose();
              }
            });
          }}
        >
          Generate link
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function InviteMemberDialog({
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { email: string; role: InvitationRole }) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("member@example.com");
  const [role, setRole] = useState<InvitationRole>("member");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Invite member</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Invite email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <FormControl>
            <InputLabel id="invite-role-label">Role</InputLabel>
            <Select labelId="invite-role-label" label="Role" value={role} onChange={(event) => setRole(event.target.value as InvitationRole)}>
              <MenuItem value="member">member</MenuItem>
              <MenuItem value="admin">admin</MenuItem>
              <MenuItem value="owner">owner</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={submitting}
          onClick={() => {
            void onSubmit({ email, role }).then((created) => {
              if (created) {
                onClose();
              }
            });
          }}
        >
          Send invitation
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function EditLinkDialog({
  open,
  link,
  submitting,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  link: Link;
  submitting: string | null;
  onClose: () => void;
  onSubmit: (values: SelectedLinkFormValues) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  return <EditLinkDialogForm key={`${link.id}-${link.updatedAt}-${open}`} open={open} link={link} submitting={submitting} onClose={onClose} onSubmit={onSubmit} onDelete={onDelete} />;
}

function EditLinkDialogForm({
  open,
  link,
  submitting,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  link: Link;
  submitting: string | null;
  onClose: () => void;
  onSubmit: (values: SelectedLinkFormValues) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [targetUrl, setTargetUrl] = useState(link.targetUrl);
  const [title, setTitle] = useState(link.title ?? "");
  const [description, setDescription] = useState(link.description ?? "");
  const [redirectStatus, setRedirectStatus] = useState<301 | 302 | 307>(link.redirectStatus);
  const [isActive, setIsActive] = useState(link.isActive);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit link</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
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
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
        <Button
          color="error"
          startIcon={<DeleteOutlineIcon />}
          disabled={submitting === "delete-link"}
          data-testid="delete-link-button"
          onClick={() => {
            void onDelete().then((deleted) => {
              if (deleted) {
                onClose();
              }
            });
          }}
        >
          Delete link
        </Button>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<EditOutlinedIcon />}
            disabled={submitting === "update-link"}
            data-testid="save-link-button"
            onClick={() => {
              void onSubmit({ targetUrl, title, description, redirectStatus, isActive }).then((saved) => {
                if (saved) {
                  onClose();
                }
              });
            }}
          >
            Save changes
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copiedLabel = useMemo(
    () =>
      copied ? (
        <Alert severity="success" sx={{ py: 0 }}>
          Copied
        </Alert>
      ) : null,
    [copied],
  );

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </Typography>
      <IconButton
        size="small"
        aria-label={`Copy ${value}`}
        onClick={async (event) => {
          event.stopPropagation();
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        <ContentCopyIcon fontSize="inherit" />
      </IconButton>
      {copiedLabel}
    </Stack>
  );
}

export function EmptyDashboard() {
  return (
    <Box
      sx={{
        minHeight: 360,
        borderRadius: 4,
        border: "1px dashed rgba(255,255,255,0.12)",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(15,23,42,0.72))",
      }}
    >
      <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center", maxWidth: 420 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Dashboard coming next
        </Typography>
        <Typography color="text.secondary">
          The overview page is intentionally empty for now while the links and organization workspace settle into their new structure.
        </Typography>
      </Stack>
    </Box>
  );
}
