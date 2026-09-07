import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  IonBackButton,
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
import { getAssetsBySite, getJobById, type LocalAsset } from '../db/localData'

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
  const [assets, setAssets] = useState<LocalAsset[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void (async () => {
      const job = await getJobById(id)
      if (job?.siteId != null) {
        setAssets(await getAssetsBySite(job.siteId))
      }
    })()
  }, [id])

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
          {filteredAssets.map((asset) => (
            <IonItem key={asset.assetGuid}>
              <IonLabel className="ion-text-wrap">
                <h2>{asset.assetName ?? asset.assetModel ?? 'Asset'}</h2>
                <p>{asset.location}</p>
                <p>{asset.serialNo ? `S/N ${asset.serialNo}` : null}</p>
              </IonLabel>
              <IonButton
                slot="end"
                routerLink={`/jobs/${id}/assets/${asset.assetGuid}`}
              >
                Service
              </IonButton>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonPage>
  )
}
