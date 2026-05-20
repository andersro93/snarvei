import { CircularProgress, CssBaseline, ThemeProvider, Box, createTheme } from "@mui/material";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useParams } from "react-router-dom";
import { AppShell, DashboardPage, LandingPage, LinkDetailsPage, LinksPage, OrganizationPage, OrganizationSelectionPage } from "./pages";
import { buildOrganizationPath, settingsPath } from "./lib/routes";
import { WorkspaceProvider } from "./hooks/use-workspace";
import { useWorkspace } from "./hooks/use-workspace-context";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#8b5cf6",
    },
    secondary: {
      main: "#22d3ee",
    },
    background: {
      default: "#070b16",
      paper: "#0f172a",
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
  },
});

function RequireSession() {
  const { session, sessionPending } = useWorkspace();

  if (sessionPending) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function OrganizationIndexRedirect() {
  const { org } = useParams();
  const { activeOrganization, organizations, organizationsPending } = useWorkspace();

  if (org) {
    const routeOrganization = organizations.find((organization) => organization.slug === org || organization.id === org);
    if (routeOrganization) {
      return <Navigate to={buildOrganizationPath(routeOrganization)} replace />;
    }

    if (organizationsPending) {
      return null;
    }
  }

  if (!activeOrganization) {
    return <Navigate to="/app/select-organization" replace />;
  }

  return <Navigate to={buildOrganizationPath(activeOrganization)} replace />;
}

function UserSettingsPage() {
  const { session } = useWorkspace();

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Box sx={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, p: 4, background: "rgba(15,23,42,0.72)" }}>
        <Box sx={{ mb: 2 }}>
          <Box component="h1" sx={{ fontSize: 34, fontWeight: 800, m: 0 }}>
            Settings
          </Box>
          <Box component="p" sx={{ color: "text.secondary", mt: 1, mb: 0 }}>
            Current user settings and profile controls will live here.
          </Box>
        </Box>
        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 1.5, columnGap: 2, m: 0 }}>
          <Box component="dt" sx={{ color: "text.secondary" }}>Name</Box>
          <Box component="dd" sx={{ m: 0 }}>{session?.user.name ?? "Unknown user"}</Box>
          <Box component="dt" sx={{ color: "text.secondary" }}>Email</Box>
          <Box component="dd" sx={{ m: 0 }}>{session?.user.email ?? ""}</Box>
        </Box>
      </Box>
    </Box>
  );
}

function AppRoutes() {
  const router = createBrowserRouter([
    {
      path: "/",
      element: <LandingPage />,
    },
    {
      element: <RequireSession />,
      children: [
        {
          path: "/app/select-organization",
          element: <OrganizationSelectionPage />,
        },
        {
          path: settingsPath,
          element: <AppShell />,
          children: [
            {
              index: true,
              element: <UserSettingsPage />,
            },
          ],
        },
        {
          path: "/app",
          element: <AppShell />,
          children: [
            {
              index: true,
              element: <OrganizationIndexRedirect />,
            },
            {
              path: ":org",
              children: [
                {
                  index: true,
                  element: <OrganizationIndexRedirect />,
                },
                {
                  path: "dashboard",
                  element: <DashboardPage />,
                },
                {
                  path: "links",
                  element: <LinksPage />,
                },
                {
                  path: "links/:linkId",
                  element: <LinkDetailsPage />,
                },
                {
                  path: "organization",
                  element: <OrganizationPage />,
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <WorkspaceProvider>
        <AppRoutes />
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
