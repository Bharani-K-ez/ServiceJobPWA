import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
  type RefresherEventDetail,
} from '@ionic/react'
import { settingsOutline } from 'ionicons/icons'
import { getOpenJobs, getSiteById, getWipJob, startJob, type LocalJob } from '../db/localData'
import { syncDown } from '../api/syncV2'
import { upsertSyncData } from '../db/localData'

interface JobRow {
  job: LocalJob
  siteLabel: string
}

export default function JobListPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<JobRow[]>([])
  const [wipSerRecId, setWipSerRecId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [jobs, wipJob] = await Promise.all([getOpenJobs(), getWipJob()])
    const withSites = await Promise.all(
      jobs.map(async (job) => {
        const site = job.siteId != null ? await getSiteById(job.siteId) : null
        const siteLabel = site
          ? [site.occupant, site.address, site.town].filter(Boolean).join(', ')
          : 'No site on file'
        return { job, siteLabel }
      }),
    )
    setRows(withSites)
    setWipSerRecId(wipJob?.serRecId ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRefresh(event: CustomEvent<RefresherEventDetail>) {
    try {
      const result = await syncDown()
      if (result.hasData && result.data) {
        await upsertSyncData(result.data)
      }
      await load()
    } finally {
      event.detail.complete()
    }
  }

  async function handleStartJob(serRecId: number) {
    await startJob(serRecId)
    navigate(`/jobs/${serRecId}/wip`)
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>My Jobs</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink="/utilities">
              <IonIcon slot="icon-only" icon={settingsOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {!loading && rows.length === 0 && (
          <div className="ion-padding ion-text-center">
            <p>No open jobs. Pull down to sync.</p>
          </div>
        )}

        <IonList>
          {rows.map(({ job, siteLabel }) => {
            const isThisWip = wipSerRecId === job.serRecId
            const anotherJobIsWip = wipSerRecId != null && !isThisWip

            return (
              <IonItem key={job.serRecId}>
                <IonLabel className="ion-text-wrap">
                  <h2>{job.docketRef ?? `Job #${job.serRecId}`}</h2>
                  <p>{siteLabel}</p>
                  <p>{job.probDesc}</p>
                  {job.dispatchStatusDesc && (
                    <IonNote color="medium">{job.dispatchStatusDesc}</IonNote>
                  )}
                </IonLabel>
                {isThisWip && <IonBadge color="warning">In progress</IonBadge>}
                <IonButton
                  slot="end"
                  fill={isThisWip ? 'solid' : 'outline'}
                  disabled={anotherJobIsWip}
                  onClick={() =>
                    isThisWip ? navigate(`/jobs/${job.serRecId}/wip`) : handleStartJob(job.serRecId)
                  }
                >
                  {isThisWip ? 'Resume' : 'Start Job'}
                </IonButton>
              </IonItem>
            )
          })}
        </IonList>
      </IonContent>
    </IonPage>
  )
}
