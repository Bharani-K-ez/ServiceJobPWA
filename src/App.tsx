import type { ReactNode } from 'react'
import { IonApp, IonPage, IonContent, IonSpinner, IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Navigate, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './screens/LoginPage'
import JobListPage from './screens/JobListPage'
import WipPage from './screens/WipPage'
import AssetServiceListPage from './screens/AssetServiceListPage'
import AssetServiceInfoPage from './screens/AssetServiceInfoPage'
import UtilitiesPage from './screens/UtilitiesPage'

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

function AppRoutes() {
  return (
    <IonReactRouter>
      <IonRouterOutlet>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/jobs"
          element={
            <RequireAuth>
              <JobListPage />
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
          path="/utilities"
          element={
            <RequireAuth>
              <UtilitiesPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/jobs" replace />} />
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
