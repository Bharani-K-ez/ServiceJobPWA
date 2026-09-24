import { useEffect, useState } from 'react'
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/react'
import {
  DAY_LABELS,
  describeSchedule,
  getScheduleOverride,
  getServerSchedule,
  saveScheduleOverride,
  type SyncSchedule,
} from '../sync/syncSettings'

interface Props {
  isOpen: boolean
  onDismiss: (changed: boolean) => void
}

const INTERVALS = [10, 15, 20, 30, 45, 60]

/**
 * Edits the device's automatic-sync schedule. The office's settings (or the
 * defaults) are shown as the baseline; anything the engineer changes here is
 * saved as a device override, and "Use office settings" removes it.
 */
export default function AutoSyncSettingsModal({ isOpen, onDismiss }: Props) {
  const [server, setServer] = useState<SyncSchedule | null>(null)
  const [draft, setDraft] = useState<SyncSchedule | null>(null)
  const [hasOverride, setHasOverride] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    void (async () => {
      const [s, o] = await Promise.all([getServerSchedule(), getScheduleOverride()])
      setServer(s)
      setHasOverride(!!o)
      setDraft({ ...s, ...(o ?? {}) })
    })()
  }, [isOpen])

  function toggleDay(day: number) {
    if (!draft) return
    const days = draft.workDays.includes(day) ? draft.workDays.filter((d) => d !== day) : [...draft.workDays, day].sort()
    setDraft({ ...draft, workDays: days })
  }

  async function save() {
    if (!draft || !server) return
    // Store only what differs from the office's settings.
    const override: Partial<SyncSchedule> = {}
    if (draft.enabled !== server.enabled) override.enabled = draft.enabled
    if (draft.intervalMinutes !== server.intervalMinutes) override.intervalMinutes = draft.intervalMinutes
    if (draft.workStart !== server.workStart) override.workStart = draft.workStart
    if (draft.workEnd !== server.workEnd) override.workEnd = draft.workEnd
    if (draft.workDays.join() !== server.workDays.join()) override.workDays = draft.workDays
    await saveScheduleOverride(Object.keys(override).length > 0 ? override : null)
    onDismiss(true)
  }

  async function useOffice() {
    await saveScheduleOverride(null)
    onDismiss(true)
  }

  return (
    <IonModal isOpen={isOpen} onDidDismiss={() => onDismiss(false)}>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => onDismiss(false)}>Cancel</IonButton>
          </IonButtons>
          <IonTitle>Automatic sync</IonTitle>
          <IonButtons slot="end">
            <IonButton strong onClick={() => void save()} disabled={!draft || draft.workDays.length === 0}>
              Save
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {draft && (
          <IonList inset>
            <IonItem>
              <IonToggle checked={draft.enabled} onIonChange={(e) => setDraft({ ...draft, enabled: e.detail.checked })}>
                Sync automatically
              </IonToggle>
            </IonItem>
            <IonItem>
              <IonSelect
                label="Every"
                value={draft.intervalMinutes}
                onIonChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.detail.value) })}
                disabled={!draft.enabled}
              >
                {INTERVALS.map((m) => (
                  <IonSelectOption key={m} value={m}>
                    {m} minutes
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonInput
                label="From"
                type="time"
                value={draft.workStart}
                onIonChange={(e) => setDraft({ ...draft, workStart: String(e.detail.value ?? draft.workStart) })}
                disabled={!draft.enabled}
              />
              <IonInput
                label="To"
                type="time"
                value={draft.workEnd}
                onIonChange={(e) => setDraft({ ...draft, workEnd: String(e.detail.value ?? draft.workEnd) })}
                disabled={!draft.enabled}
              />
            </IonItem>
            <IonItem lines="none">
              <IonLabel>
                <h3>Working days</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {DAY_LABELS.map((label, i) => {
                    const day = i + 1
                    const on = draft.workDays.includes(day)
                    return (
                      <IonChip
                        key={day}
                        color={on ? 'primary' : 'medium'}
                        outline={!on}
                        disabled={!draft.enabled}
                        onClick={() => toggleDay(day)}
                      >
                        {label}
                      </IonChip>
                    )
                  })}
                </div>
                {draft.workDays.length === 0 && (
                  <IonText color="danger">
                    <p>Pick at least one day.</p>
                  </IonText>
                )}
              </IonLabel>
            </IonItem>
          </IonList>
        )}

        {server && (
          <div className="ion-padding-horizontal">
            <IonNote color="medium" style={{ display: 'block', fontSize: 13 }}>
              Office setting: {describeSchedule(server)}.
              {hasOverride ? ' You have changed this on this device.' : ''}
            </IonNote>
            {hasOverride && (
              <IonButton fill="clear" size="small" onClick={() => void useOffice()}>
                Use office settings
              </IonButton>
            )}
            <IonNote color="medium" style={{ display: 'block', fontSize: 13, marginTop: 8 }}>
              While the app is open it syncs on this schedule. In the background, Android runs it roughly on time
              (never more often than every 15 minutes); iOS runs it when the system allows. Outside these hours nothing
              syncs automatically - use Sync in Utilities.
            </IonNote>
          </div>
        )}
      </IonContent>
    </IonModal>
  )
}
