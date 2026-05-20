import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client";
import type { AuthSession, PasskeySummary, SessionData } from "../../../types";

type AppMessage = {
  severity: "success" | "error" | "info";
  text: string;
};

export function useSettingsState(options: {
  session: SessionData | null;
  setMessage: (message: AppMessage) => void;
}) {
  const [profileName, setProfileName] = useState(options.session?.user.name ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    setProfileName(options.session?.user.name ?? "");
  }, [options.session?.user.name]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    const result = await authClient.listSessions();
    if (result.error) {
      options.setMessage({ severity: "error", text: result.error.message ?? "Unable to load active sessions." });
      setSessionsLoading(false);
      return;
    }

    setSessions((result.data ?? []) as AuthSession[]);
    setSessionsLoading(false);
  };

  const loadPasskeys = async () => {
    setPasskeysLoading(true);
    const result = await authClient.passkey.listUserPasskeys({});
    if (result.error) {
      options.setMessage({ severity: "error", text: result.error.message ?? "Unable to load passkeys." });
      setPasskeysLoading(false);
      return;
    }

    setPasskeys((result.data ?? []) as PasskeySummary[]);
    setPasskeysLoading(false);
  };

  useEffect(() => {
    if (!options.session?.user.id) {
      return;
    }

    void Promise.all([loadSessions(), loadPasskeys()]);
  }, [options.session?.user.id]);

  const runAction = async (action: string, work: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await work();
    } finally {
      setBusyAction(null);
    }
  };

  return {
    backupCodes,
    busyAction,
    currentPassword,
    editingPasskeyId,
    editingPasskeyName,
    loadPasskeys,
    loadSessions,
    newEmail,
    newPassword,
    newPasskeyName,
    passkeys,
    passkeysLoading,
    profileName,
    runAction,
    sessions,
    sessionsLoading,
    setBackupCodes,
    setCurrentPassword,
    setEditingPasskeyId,
    setEditingPasskeyName,
    setNewEmail,
    setNewPasskeyName,
    setNewPassword,
    setProfileName,
    setTotpUri,
    setTwoFactorCode,
    setTwoFactorPassword,
    totpUri,
    twoFactorCode,
    twoFactorPassword,
  };
}
