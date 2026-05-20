import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef } from "react";
import QRCode from "react-qr-code";
import { authClient } from "./lib/auth-client";
import type { AuthSession, PasskeySummary, SessionData } from "./types";

const formatDateValue = (value: string | number | null | undefined) => {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
};

const describeSession = (session: AuthSession) => {
  const parts = [session.userAgent, session.ipAddress].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Browser session";
};

type ActionRunner = (action: string, work: () => Promise<void>) => Promise<void>;

type SharedSectionProps = {
  busyAction: string | null;
  setMessage: (message: { severity: "success" | "error" | "info"; text: string }) => void;
  refreshSessionState: () => Promise<void>;
  runAction: ActionRunner;
};

export function SectionCard(props: { title: string; description: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card sx={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.72)" }}>
      <CardContent sx={{ p: 3.5 }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            {props.icon ? <Box sx={{ color: "secondary.main", display: "grid", placeItems: "center" }}>{props.icon}</Box> : null}
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {props.title}
              </Typography>
              <Typography color="text.secondary">{props.description}</Typography>
            </Box>
          </Stack>
          {props.children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ProfileSection(
  props: SharedSectionProps & {
    profileName: string;
    session: SessionData;
    setProfileName: (value: string) => void;
  },
) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <SectionCard
      title="Profile"
      description="Update your display name and private profile image."
      icon={<AddPhotoAlternateOutlinedIcon />}
    >
      <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ alignItems: { md: "center" } }}>
        <Stack spacing={1.5} sx={{ alignItems: "center", minWidth: 160 }}>
          <Avatar src={props.session.user.image ?? undefined} sx={{ width: 88, height: 88, bgcolor: "primary.main", fontSize: 34 }}>
            {props.session.user.name[0]?.toUpperCase() ?? "U"}
          </Avatar>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => fileInputRef.current?.click()} disabled={props.busyAction === "upload-image"}>
              Upload photo
            </Button>
            <Button
              variant="text"
              color="inherit"
              disabled={!props.session.user.image || props.busyAction === "remove-image"}
              onClick={() =>
                void props.runAction("remove-image", async () => {
                  const response = await fetch("/api/me/profile-image", {
                    method: "DELETE",
                    credentials: "include",
                  });
                  if (!response.ok) {
                    props.setMessage({ severity: "error", text: "Unable to remove profile image." });
                    return;
                  }
                  await props.refreshSessionState();
                  props.setMessage({ severity: "success", text: "Profile image removed." });
                })
              }
            >
              Remove
            </Button>
          </Stack>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) {
                return;
              }

              void props.runAction("upload-image", async () => {
                const formData = new FormData();
                formData.append("file", file);
                const response = await fetch("/api/me/profile-image", {
                  method: "POST",
                  credentials: "include",
                  body: formData,
                });
                if (!response.ok) {
                  props.setMessage({ severity: "error", text: "Unable to upload profile image." });
                  return;
                }
                await props.refreshSessionState();
                props.setMessage({ severity: "success", text: "Profile image updated." });
              });
            }}
          />
        </Stack>

        <Stack spacing={2} sx={{ flex: 1 }}>
          <TextField
            label="Display name"
            value={props.profileName}
            onChange={(event) => props.setProfileName(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "settings-name-input" } }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
            <Chip label={props.session.user.emailVerified ? "Email verified" : "Email not verified"} color={props.session.user.emailVerified ? "success" : "warning"} />
            <Typography color="text.secondary">Current email: {props.session.user.email}</Typography>
          </Stack>
          <Button
            variant="contained"
            sx={{ alignSelf: "flex-start" }}
            disabled={!props.profileName.trim() || props.profileName.trim() === props.session.user.name || props.busyAction === "save-profile"}
            onClick={() =>
              void props.runAction("save-profile", async () => {
                const result = await authClient.updateUser({ name: props.profileName.trim() });
                if (result.error) {
                  props.setMessage({ severity: "error", text: result.error.message ?? "Unable to update your profile." });
                  return;
                }
                await props.refreshSessionState();
                props.setMessage({ severity: "success", text: "Profile updated." });
              })
            }
          >
            Save profile
          </Button>
        </Stack>
      </Stack>
    </SectionCard>
  );
}

export function EmailSection(
  props: SharedSectionProps & {
    newEmail: string;
    setNewEmail: (value: string) => void;
  },
) {
  return (
    <SectionCard title="Email" description="Request an email address change. Verification is sent to the new address only." icon={<KeyOutlinedIcon />}>
      <Stack spacing={2}>
        <TextField
          label="New email"
          type="email"
          value={props.newEmail}
          onChange={(event) => props.setNewEmail(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "settings-email-input" } }}
        />
        <Button
          variant="contained"
          sx={{ alignSelf: "flex-start" }}
          disabled={!props.newEmail.trim() || props.busyAction === "change-email"}
          onClick={() =>
            void props.runAction("change-email", async () => {
              const result = await authClient.changeEmail({
                newEmail: props.newEmail.trim(),
                callbackURL: `${window.location.origin}/app/settings`,
              });
              if (result.error) {
                props.setMessage({ severity: "error", text: result.error.message ?? "Unable to request email change." });
                return;
              }
              props.setNewEmail("");
              props.setMessage({ severity: "success", text: "Check the new email address to confirm the change." });
            })
          }
        >
          Send verification
        </Button>
      </Stack>
    </SectionCard>
  );
}

export function PasswordSection(
  props: SharedSectionProps & {
    currentPassword: string;
    newPassword: string;
    loadSessions: () => Promise<void>;
    setCurrentPassword: (value: string) => void;
    setNewPassword: (value: string) => void;
  },
) {
  return (
    <SectionCard title="Password" description="Change your account password and optionally revoke other active sessions." icon={<KeyOutlinedIcon />}>
      <Stack spacing={2}>
        <TextField
          label="Current password"
          type="password"
          value={props.currentPassword}
          onChange={(event) => props.setCurrentPassword(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "settings-current-password-input" } }}
        />
        <TextField
          label="New password"
          type="password"
          value={props.newPassword}
          onChange={(event) => props.setNewPassword(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "settings-new-password-input" } }}
        />
        <Button
          variant="contained"
          sx={{ alignSelf: "flex-start" }}
          disabled={!props.currentPassword || !props.newPassword || props.busyAction === "change-password"}
          onClick={() =>
            void props.runAction("change-password", async () => {
              const result = await authClient.changePassword({
                currentPassword: props.currentPassword,
                newPassword: props.newPassword,
                revokeOtherSessions: true,
              });
              if (result.error) {
                props.setMessage({ severity: "error", text: result.error.message ?? "Unable to change password." });
                return;
              }
              props.setCurrentPassword("");
              props.setNewPassword("");
              await props.loadSessions();
              props.setMessage({ severity: "success", text: "Password updated. Other active sessions were revoked." });
            })
          }
        >
          Change password
        </Button>
      </Stack>
    </SectionCard>
  );
}

export function SessionsSection(
  props: SharedSectionProps & {
    sessions: AuthSession[];
    sessionsLoading: boolean;
    currentSessionId: string;
    loadSessions: () => Promise<void>;
  },
) {
  return (
    <SectionCard title="Active sessions" description="Review current logins and revoke sessions that should no longer have access." icon={<ShieldOutlinedIcon />}>
      <Stack spacing={2}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
          <Typography color="text.secondary">Only active sessions are shown. Revoked sessions disappear from this list.</Typography>
          <Button
            variant="outlined"
            disabled={props.busyAction === "revoke-other-sessions"}
            onClick={() =>
              void props.runAction("revoke-other-sessions", async () => {
                const result = await authClient.revokeOtherSessions();
                if (result.error) {
                  props.setMessage({ severity: "error", text: result.error.message ?? "Unable to revoke other sessions." });
                  return;
                }
                await props.loadSessions();
                props.setMessage({ severity: "success", text: "Other sessions revoked." });
              })
            }
          >
            Revoke other sessions
          </Button>
        </Stack>
        {props.sessionsLoading ? <CircularProgress size={24} /> : null}
        <List sx={{ display: "grid", gap: 1, p: 0 }}>
          {props.sessions.map((authSession) => {
            const isCurrent = authSession.id === props.currentSessionId;
            return (
              <ListItem
                key={authSession.id}
                sx={{ px: 2, py: 1.5, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, display: "flex", gap: 2, alignItems: "center" }}
                secondaryAction={
                  <Button
                    color="inherit"
                    disabled={isCurrent || props.busyAction === `revoke-${authSession.id}`}
                    onClick={() =>
                      void props.runAction(`revoke-${authSession.id}`, async () => {
                        const result = await authClient.revokeSession({ token: authSession.token });
                        if (result.error) {
                          props.setMessage({ severity: "error", text: result.error.message ?? "Unable to revoke session." });
                          return;
                        }
                        await props.loadSessions();
                        props.setMessage({ severity: "success", text: "Session revoked." });
                      })
                    }
                  >
                    Revoke
                  </Button>
                }
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 700 }}>{describeSession(authSession)}</Typography>
                      {isCurrent ? <Chip label="Current session" size="small" color="secondary" /> : null}
                    </Stack>
                  }
                  secondary={`Created ${formatDateValue(authSession.createdAt)} · Expires ${formatDateValue(authSession.expiresAt)}`}
                />
              </ListItem>
            );
          })}
          {!props.sessionsLoading && !props.sessions.length ? <Alert severity="info">No active sessions found.</Alert> : null}
        </List>
      </Stack>
    </SectionCard>
  );
}

export function TwoFactorSection(
  props: SharedSectionProps & {
    session: SessionData;
    twoFactorPassword: string;
    twoFactorCode: string;
    totpUri: string | null;
    backupCodes: string[];
    loadSessions: () => Promise<void>;
    setBackupCodes: (codes: string[]) => void;
    setTotpUri: (value: string | null) => void;
    setTwoFactorCode: (value: string) => void;
    setTwoFactorPassword: (value: string) => void;
  },
) {
  return (
    <SectionCard title="Two-factor authentication" description="Enable TOTP, verify enrollment, and manage backup recovery codes." icon={<ShieldOutlinedIcon />}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
          <Chip label={props.session.user.twoFactorEnabled ? "Enabled" : "Not enabled"} color={props.session.user.twoFactorEnabled ? "success" : "default"} />
          <Typography color="text.secondary">
            {props.session.user.twoFactorEnabled
              ? "Use an authenticator app or backup codes to protect sign-in."
              : "Enable TOTP to require a second factor after password sign-in."}
          </Typography>
        </Stack>

        <TextField
          label="Current password"
          type="password"
          value={props.twoFactorPassword}
          onChange={(event) => props.setTwoFactorPassword(event.target.value)}
          helperText="Required for credential accounts."
        />

        {!props.session.user.twoFactorEnabled ? (
          <Button
            variant="contained"
            sx={{ alignSelf: "flex-start" }}
            disabled={props.busyAction === "enable-2fa"}
            onClick={() =>
              void props.runAction("enable-2fa", async () => {
                const result = await authClient.twoFactor.enable({ password: props.twoFactorPassword || undefined });
                if (result.error) {
                  props.setMessage({ severity: "error", text: result.error.message ?? "Unable to enable two-factor authentication." });
                  return;
                }
                props.setTotpUri(result.data?.totpURI ?? null);
                props.setBackupCodes(result.data?.backupCodes ?? []);
                props.setMessage({ severity: "info", text: "Scan the QR code and verify one authenticator code to finish enabling 2FA." });
              })
            }
          >
            Start 2FA setup
          </Button>
        ) : (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              variant="outlined"
              disabled={props.busyAction === "view-backup-codes"}
              onClick={() =>
                void props.runAction("view-backup-codes", async () => {
                  const result = await authClient.twoFactor.viewBackupCodes({});
                  if (result.error) {
                    props.setMessage({ severity: "error", text: result.error.message ?? "Unable to view backup codes." });
                    return;
                  }
                  props.setBackupCodes(result.data?.backupCodes ?? []);
                })
              }
            >
              View backup codes
            </Button>
            <Button
              variant="outlined"
              disabled={props.busyAction === "generate-backup-codes"}
              onClick={() =>
                void props.runAction("generate-backup-codes", async () => {
                  const result = await authClient.twoFactor.generateBackupCodes({ password: props.twoFactorPassword || undefined });
                  if (result.error) {
                    props.setMessage({ severity: "error", text: result.error.message ?? "Unable to regenerate backup codes." });
                    return;
                  }
                  props.setBackupCodes(result.data?.backupCodes ?? []);
                  props.setMessage({ severity: "success", text: "Backup codes regenerated." });
                })
              }
            >
              Regenerate backup codes
            </Button>
            <Button
              color="inherit"
              disabled={props.busyAction === "disable-2fa"}
              onClick={() =>
                void props.runAction("disable-2fa", async () => {
                  const result = await authClient.twoFactor.disable({ password: props.twoFactorPassword || undefined });
                  if (result.error) {
                    props.setMessage({ severity: "error", text: result.error.message ?? "Unable to disable two-factor authentication." });
                    return;
                  }
                  props.setTotpUri(null);
                  props.setBackupCodes([]);
                  props.setTwoFactorCode("");
                  await props.refreshSessionState();
                  props.setMessage({ severity: "success", text: "Two-factor authentication disabled." });
                })
              }
            >
              Disable 2FA
            </Button>
          </Stack>
        )}

        {props.totpUri ? (
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ alignItems: { md: "center" } }}>
            <Box sx={{ p: 2, borderRadius: 3, background: "white", width: "fit-content" }}>
              <QRCode value={props.totpUri} size={160} />
            </Box>
            <Stack spacing={2} sx={{ flex: 1 }}>
              <Typography color="text.secondary">Scan this QR code with your authenticator app, then verify the current code below.</Typography>
              <TextField
                label="Authenticator code"
                value={props.twoFactorCode}
                onChange={(event) => props.setTwoFactorCode(event.target.value)}
                slotProps={{ htmlInput: { "data-testid": "settings-2fa-code-input" } }}
              />
              <Button
                variant="contained"
                sx={{ alignSelf: "flex-start" }}
                disabled={!props.twoFactorCode || props.busyAction === "verify-2fa"}
                onClick={() =>
                  void props.runAction("verify-2fa", async () => {
                    const result = await authClient.twoFactor.verifyTotp({ code: props.twoFactorCode });
                    if (result.error) {
                      props.setMessage({ severity: "error", text: result.error.message ?? "Unable to verify authenticator code." });
                      return;
                    }
                    props.setTwoFactorCode("");
                    await props.refreshSessionState();
                    await props.loadSessions();
                    props.setMessage({ severity: "success", text: "Two-factor authentication enabled." });
                  })
                }
              >
                Verify and enable
              </Button>
            </Stack>
          </Stack>
        ) : null}

        {props.backupCodes.length ? (
          <Box sx={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, p: 2.5 }}>
            <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Backup codes</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Store these offline. Each code can only be used once.
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                gap: 1,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}
            >
              {props.backupCodes.map((code) => (
                <Box key={code} sx={{ px: 1.5, py: 1, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
                  {code}
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
      </Stack>
    </SectionCard>
  );
}

export function PasskeysSection(
  props: SharedSectionProps & {
    editingPasskeyId: string | null;
    editingPasskeyName: string;
    newPasskeyName: string;
    passkeys: PasskeySummary[];
    passkeysLoading: boolean;
    loadPasskeys: () => Promise<void>;
    setEditingPasskeyId: (value: string | null) => void;
    setEditingPasskeyName: (value: string) => void;
    setNewPasskeyName: (value: string) => void;
  },
) {
  return (
    <SectionCard title="Passkeys" description="Register biometric or hardware-backed sign-in methods and manage existing credentials." icon={<VpnKeyOutlinedIcon />}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField
            label="New passkey name"
            value={props.newPasskeyName}
            onChange={(event) => props.setNewPasskeyName(event.target.value)}
            placeholder="MacBook Touch ID"
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            disabled={props.busyAction === "add-passkey"}
            onClick={() =>
              void props.runAction("add-passkey", async () => {
                const result = await authClient.passkey.addPasskey({ name: props.newPasskeyName.trim() || undefined });
                if (result.error) {
                  props.setMessage({ severity: "error", text: result.error.message ?? "Unable to add passkey." });
                  return;
                }
                props.setNewPasskeyName("");
                await props.loadPasskeys();
                props.setMessage({ severity: "success", text: "Passkey added." });
              })
            }
          >
            Add passkey
          </Button>
        </Stack>

        {props.passkeysLoading ? <CircularProgress size={24} /> : null}
        <Stack spacing={1.5}>
          {props.passkeys.map((passkey) => (
            <Box key={passkey.id} sx={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, p: 2.5 }}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{passkey.name || "Unnamed passkey"}</Typography>
                    <Typography color="text.secondary">
                      {passkey.deviceType || "Unknown device"} · Created {formatDateValue(passkey.createdAt)} · {passkey.backedUp ? "Backed up" : "Not backed up"}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        props.setEditingPasskeyId(passkey.id);
                        props.setEditingPasskeyName(passkey.name ?? "");
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      color="inherit"
                      disabled={props.busyAction === `delete-passkey-${passkey.id}`}
                      onClick={() =>
                        void props.runAction(`delete-passkey-${passkey.id}`, async () => {
                          const result = await authClient.passkey.deletePasskey({ id: passkey.id });
                          if (result.error) {
                            props.setMessage({ severity: "error", text: result.error.message ?? "Unable to delete passkey." });
                            return;
                          }
                          await props.loadPasskeys();
                          props.setMessage({ severity: "success", text: "Passkey deleted." });
                        })
                      }
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
                {props.editingPasskeyId === passkey.id ? (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField value={props.editingPasskeyName} onChange={(event) => props.setEditingPasskeyName(event.target.value)} sx={{ flex: 1 }} />
                    <Button
                      variant="contained"
                      disabled={!props.editingPasskeyName.trim() || props.busyAction === `rename-passkey-${passkey.id}`}
                      onClick={() =>
                        void props.runAction(`rename-passkey-${passkey.id}`, async () => {
                          const result = await authClient.passkey.updatePasskey({ id: passkey.id, name: props.editingPasskeyName.trim() });
                          if (result.error) {
                            props.setMessage({ severity: "error", text: result.error.message ?? "Unable to rename passkey." });
                            return;
                          }
                          props.setEditingPasskeyId(null);
                          props.setEditingPasskeyName("");
                          await props.loadPasskeys();
                          props.setMessage({ severity: "success", text: "Passkey renamed." });
                        })
                      }
                    >
                      Save
                    </Button>
                    <Button color="inherit" onClick={() => props.setEditingPasskeyId(null)}>
                      Cancel
                    </Button>
                  </Stack>
                ) : null}
              </Stack>
            </Box>
          ))}
          {!props.passkeysLoading && !props.passkeys.length ? <Alert severity="info">No passkeys registered yet.</Alert> : null}
        </Stack>
      </Stack>
    </SectionCard>
  );
}
