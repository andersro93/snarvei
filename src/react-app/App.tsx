import { CircularProgress, CssBaseline, ThemeProvider, Box, createTheme } from "@mui/material";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useParams } from "react-router-dom";
import { AppShell, DashboardPage, LandingPage, LinkDetailsPage, LinksPage, OrganizationPage, OrganizationSelectionPage } from "./pages";
import { buildOrganizationPath, settingsPath } from "./lib/routes";
import { WorkspaceProvider } from "./hooks/use-workspace";
import { useWorkspace } from "./hooks/use-workspace-context";
import { SettingsPage } from "./settings-page";

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
              element: <SettingsPage />,
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
