import type { ReactNode } from 'react'
import { IonApp, IonPage, IonContent, IonSpinner, IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Navigate, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './screens/LoginPage'
import JobListPage from './screens/JobListPage'
import JobDetailPage from './screens/JobDetailPage'
import TeamPage from './screens/TeamPage'
import WipPage from './screens/WipPage'
import AssetServiceListPage from './screens/AssetServiceListPage'
import AssetServiceInfoPage from './screens/AssetServiceInfoPage'
import DocumentFormPage from './screens/DocumentFormPage'
import UtilitiesPage from './screens/UtilitiesPage'
import DevDbPage from './screens/DevDbPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <IonPage>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner name="crescent" />
        </IonContent>
      </IonPage>
    )
  }

  if (status === 'anon') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

const devRoutes = import.meta.env.DEV
  ? [
      <Route
        key="dev-db"
        path="/dev/db"
        element={
          <RequireAuth>
            <DevDbPage />
          </RequireAuth>
        }
      />,
    ]
  : []

function AppRoutes() {
  return (
    <IonReactRouter>
      <IonRouterOutlet>
        <Route path="/login" element={<LoginPage />} />
        {/* "/" renders the SAME guarded element directly, rather than a
         * <Navigate to="/jobs"> - repro'd bug: when the app's cold-start
         * route (e.g. the installed PWA's start_url, or a bookmarked "/")
         * is itself a Route whose element immediately redirects, that
         * redirect fires as IonRouterOutlet is still setting up its very
         * first page transition. The outlet ends up leaving the REAL page
         * that lands (here, /jobs) with its "ion-page-invisible" class
         * never removed - a permanently blank screen that only a full
         * manual refresh clears (confirmed by reproducing it live: loading
         * "/" landed on /jobs but stuck invisible, while loading "/jobs"
         * directly - the exact same guarded content - rendered fine).
         * Rendering the destination page directly for both paths, with no
         * route-to-route redirect involved, sidesteps the race entirely.
         * (Production also gets a belt-and-suspenders fix at the Azure
         * Static Web Apps routing layer - see staticwebapp.config.json's
         * "/" redirect rule - so "/" never reaches the client router at
         * all there; this client-side fix is what protects local dev,
         * where that config file isn't in effect.) */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <JobListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs"
          element={
            <RequireAuth>
              <JobListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs/:serRecId"
          element={
            <RequireAuth>
              <JobDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs/:serRecId/team"
          element={
            <RequireAuth>
              <TeamPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs/:serRecId/wip"
          element={
            <RequireAuth>
              <WipPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs/:serRecId/assets"
          element={
            <RequireAuth>
              <AssetServiceListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs/:serRecId/assets/:assetGuid"
          element={
            <RequireAuth>
              <AssetServiceInfoPage />
            </RequireAuth>
          }
        />
        <Route
          path="/jobs/:serRecId/documents/:templateKey"
          element={
            <RequireAuth>
              <DocumentFormPage />
            </RequireAuth>
          }
        />
        <Route
          path="/utilities"
          element={
            <RequireAuth>
              <UtilitiesPage />
            </RequireAuth>
          }
        />
        {/* Dev-only local SQLite browser. `import.meta.env.DEV` is a
         * compile-time constant, so in a production build this whole route
         * (and DevDbPage's code) is eliminated by Vite. Rendered as an array
         * rather than `{DEV && <Route/>}`: a `false` child becomes `null`
         * inside IonRouterOutlet's child walk (React.Children.forEach), and
         * @ionic/react-router crashes on it with "Cannot read properties of
         * null (reading 'type')" - which broke the production build's very
         * first render. An empty array contributes no children at all. */}
        {devRoutes}
      </IonRouterOutlet>
    </IonReactRouter>
  )
}

function App() {
  return (
    <IonApp>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </IonApp>
  )
}

export default App
