import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../../lib/auth-client";
import { useWorkspace } from "../../hooks/use-workspace-context";

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

export function LandingPage() {
  const navigate = useNavigate();
  const { refreshOrganizations, refreshSessionState, session, sessionPending, signIn, signUp, submitting } = useWorkspace();
  const [email, setEmail] = useState("owner@example.com");
  const [name, setName] = useState("Anders");
  const [password, setPassword] = useState("Password123!");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorMethod, setTwoFactorMethod] = useState<"totp" | "backup">("totp");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);

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
                  onClick={() =>
                    void signIn({ email, password }).then((result) => {
                      setTwoFactorRequired(Boolean(result.requiresTwoFactor));
                      if (result.ok) {
                        navigate("/app/select-organization");
                      }
                    })
                  }
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
              <Button
                variant="text"
                onClick={() =>
                  void authClient.signIn.passkey({ autoFill: false }).then(async (result) => {
                    if (result.error) {
                      return;
                    }
                    await refreshSessionState();
                    await refreshOrganizations({ silent: true });
                    navigate("/app/select-organization");
                  })
                }
              >
                Sign in with passkey
              </Button>
              {twoFactorRequired ? (
                <Stack spacing={1.5} sx={{ pt: 1 }}>
                  <Typography variant="subtitle2">Two-factor verification</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button variant={twoFactorMethod === "totp" ? "contained" : "outlined"} onClick={() => setTwoFactorMethod("totp")}>
                      Authenticator code
                    </Button>
                    <Button variant={twoFactorMethod === "backup" ? "contained" : "outlined"} onClick={() => setTwoFactorMethod("backup")}>
                      Backup code
                    </Button>
                  </Stack>
                  <input
                    data-testid="two-factor-code-input"
                    value={twoFactorCode}
                    onChange={(event) => setTwoFactorCode(event.target.value)}
                    placeholder={twoFactorMethod === "totp" ? "123456" : "Backup code"}
                    style={inputStyle}
                  />
                  <Button
                    variant="outlined"
                    onClick={() =>
                      void (twoFactorMethod === "totp"
                        ? authClient.twoFactor.verifyTotp({ code: twoFactorCode })
                        : authClient.twoFactor.verifyBackupCode({ code: twoFactorCode }))
                        .then(async (result) => {
                          if (result.error) {
                            return;
                          }
                          setTwoFactorRequired(false);
                          setTwoFactorCode("");
                          await refreshSessionState();
                          await refreshOrganizations({ silent: true });
                          navigate("/app/select-organization");
                        })
                    }
                  >
                    Verify code
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
