export type ActionRunner = (action: string, work: () => Promise<void>) => Promise<void>;

export type SharedSectionProps = {
  busyAction: string | null;
  setMessage: (message: { severity: "success" | "error" | "info"; text: string }) => void;
  refreshSessionState: () => Promise<void>;
  runAction: ActionRunner;
};
