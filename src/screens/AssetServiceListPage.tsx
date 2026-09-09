import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import {
  getAssetsBySite,
  getJobById,
  getServicedAssetGuidsForJob,
  getWipAssetGuidsForJob,
  type LocalAsset,
} from '../db/localData'

/** Fields a "wild" (contains, case/accent-insensitive) asset search matches against. */
function assetSearchText(asset: LocalAsset): string {
  return [asset.assetName, asset.assetModel, asset.location, asset.serialNo, asset.number]
    .filter((v): v is string => !!v)
    .join(' ')
    .toLowerCase()
}

export default function AssetServiceListPage() {
  const { serRecId } = useParams<{ serRecId: string }>()
  const id = Number(serRecId)
  const location = useLocation()
  const [assets, setAssets] = useState<LocalAsset[]>([])
  const [servicedGuids, setServicedGuids] = useState<Set<string>>(new Set())
  const [wipGuids, setWipGuids] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    const job = await getJobById(id)
    if (job?.siteId != null) {
      setAssets(await getAssetsBySite(job.siteId))
    }
    setServicedGuids(await getServicedAssetGuidsForJob(id))
    setWipGuids(await getWipAssetGuidsForJob(id))
  }, [id])

  // AssetServiceInfoPage's Save button (see its handleSave) navigates back
  // here with a REPLACE, not a genuine back-navigation - same situation
  // JobListPage's own doc comment explains: IonRouterOutlet keeps this
  // page's earlier mount around from the initial forward navigation, so a
  // plain useEffect keyed on `id` (unchanged across the replace) would never
  // re-run and the just-saved "Serviced" badge wouldn't show up. Reacting to
  // react-router's own `location` - which gets a new key on every
  // navigation, replace included - is what makes it refresh. The same
  // applies to the silent background autosave's "WIP" badge: an autosave
  // that lands while the technician is on this list (e.g. the unmount-flush
  // on the way back here) needs the same refresh.
  useEffect(() => {
    if (location.pathname === `/jobs/${id}/assets`) {
      void load()
    }
  }, [location, id, load])

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assets
    return assets.filter((asset) => assetSearchText(asset).includes(q))
  }, [assets, query])

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/jobs/${id}/wip`} />
          </IonButtons>
          <IonTitle>Asset Service</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            value={query}
            debounce={150}
            placeholder="Search assets (name, model, location, serial no.)"
            onIonInput={(e) => setQuery(e.detail.value ?? '')}
          />
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {assets.length === 0 && (
          <div className="ion-padding ion-text-center">
            <p>No assets on file for this site.</p>
          </div>
        )}
        {assets.length > 0 && filteredAssets.length === 0 && (
          <div className="ion-padding ion-text-center">
            <p>No assets match "{query}".</p>
          </div>
        )}
        <IonList>
          {filteredAssets.map((asset) => {
            const isServiced = servicedGuids.has(asset.assetGuid)
            // Mutually exclusive with isServiced - saveAssetServiceVisit keeps
            // exactly one asset_service_history row per (assetGuid, serRecId),
            // so it's never status 0 and 1 at once (see getWipAssetGuidsForJob).
            const isWip = wipGuids.has(asset.assetGuid)
            return (
              <IonItem key={asset.assetGuid}>
                <IonLabel className="ion-text-wrap">
                  <h2>{asset.assetName ?? asset.assetModel ?? 'Asset'}</h2>
                  <p>{asset.location}</p>
                  <p>{asset.serialNo ? `S/N ${asset.serialNo}` : null}</p>
                </IonLabel>
                {isServiced && <IonBadge color="success">Serviced</IonBadge>}
                {isWip && <IonBadge color="warning">WIP</IonBadge>}
                <IonButton
                  slot="end"
                  fill={isServiced || isWip ? 'outline' : 'solid'}
                  routerLink={`/jobs/${id}/assets/${asset.assetGuid}`}
                >
                  {isServiced || isWip ? 'Update' : 'Service'}
                </IonButton>
              </IonItem>
            )
          })}
        </IonList>
      </IonContent>
    </IonPage>
  )
}
