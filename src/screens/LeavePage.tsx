import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  IonAlert,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonLoading,
  IonModal,
  IonNote,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonText,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToolbar,
  type RefresherEventDetail,
} from '@ionic/react'
import { addOutline, chevronBackOutline, chevronForwardOutline, cloudOfflineOutline, trashOutline } from 'ionicons/icons'
import { deleteLeave, getLeave, saveLeave, type LeaveEntryDto, type LeaveTypeDto } from '../api/leave'
import { formatDate, formatDateTime } from '../utils/format'
import { addDays, fromDayKey, startOfWeek, toDayKey } from './jobs/jobFilters'

/**
 * Leave application (Utilities > Leave). ONLINE ONLY - nothing here touches
 * local SQLite; it reads and writes HolidayTracker through the SyncV2
 * controller, the same table the cloud Leave Planner uses, so the office
 * sees the application immediately and any change made in the planner
 * shows here on the next refresh.
 *
 * Layout: a year strip of months, the month grid with leave days coloured
 * by type (the HolidayType ColorCode the planner uses), the month's entries
 * below (swipe to cancel), and an Apply button that opens the same fields as
 * the planner's dialog: type, include time, from, to, reason.
 */

type Draft = {
  id?: number
  holidayTypeId: number | null
  includeTime: boolean
  from: string // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  to: string
  reason: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dayKeyOf(iso: string): string {
  return iso.slice(0, 10)
}

function toRequestDates(draft: Draft): { leaveFrom: string; leaveTo: string } {
  if (draft.includeTime) {
    const f = draft.from.length > 16 ? draft.from.slice(0, 19) : `${draft.from}:00`
    const t = draft.to.length > 16 ? draft.to.slice(0, 19) : `${draft.to}:00`
    return { leaveFrom: f, leaveTo: t }
  }
  return { leaveFrom: `${dayKeyOf(draft.from)}T00:00:00`, leaveTo: `${dayKeyOf(draft.to)}T23:59:59` }
}

function hasTime(entry: LeaveEntryDto): boolean {
  return !(entry.leaveFrom.slice(11, 19) === '00:00:00' && (entry.leaveTo.slice(11, 19) === '23:59:59' || entry.leaveTo.slice(11, 19) === '00:00:00'))
}

export default function LeavePage() {
  const location = useLocation()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth()) // 0-11
  const [types, setTypes] = useState<LeaveTypeDto[]>([])
  const [entries, setEntries] = useState<LeaveEntryDto[]>([])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<LeaveEntryDto | null>(null)

  const load = useCallback(async () => {
    setError(null)
    if (!navigator.onLine) {
      setOffline(true)
      return
    }
    setOffline(false)
    setLoading(true)
    try {
      const result = await getLeave(`${year}-01-01`, `${year}-12-31`)
      if (!result.hasData || !result.data) {
        setError(result.failMessage ?? 'Could not load your leave.')
        return
      }
      setTypes(result.data.types)
      setEntries(result.data.entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    if (location.pathname === '/leave') void load()
  }, [location.pathname, load])

  useEffect(() => {
    const on = () => {
      setOffline(false)
      void load()
    }
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [load])

  // day -> entry, for colouring the grid
  const byDay = useMemo(() => {
    const map = new Map<string, LeaveEntryDto>()
    for (const e of entries) {
      let d = fromDayKey(dayKeyOf(e.leaveFrom))
      const end = fromDayKey(dayKeyOf(e.leaveTo))
      while (d <= end) {
        map.set(toDayKey(d), e)
        d = addDays(d, 1)
      }
    }
    return map
  }, [entries])

  const monthEntries = useMemo(() => {
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    return entries
      .filter((e) => fromDayKey(dayKeyOf(e.leaveTo)) >= first && fromDayKey(dayKeyOf(e.leaveFrom)) <= last)
      .sort((a, b) => a.leaveFrom.localeCompare(b.leaveFrom))
  }, [entries, year, month])

  const applicableTypes = types.filter((t) => !t.isOrgLeave)
  const todayKey = toDayKey(new Date())

  function openNew(day?: string) {
    const d = day ?? todayKey
    const defaultType = applicableTypes.find((t) => /planned/i.test(t.type)) ?? applicableTypes[0]
    setDraft({ holidayTypeId: defaultType?.id ?? null, includeTime: false, from: d, to: d, reason: '' })
  }

  function openEdit(entry: LeaveEntryDto) {
    const timed = hasTime(entry)
    setDraft({
      id: entry.id,
      holidayTypeId: entry.holidayTypeId,
      includeTime: timed,
      from: timed ? entry.leaveFrom.slice(0, 16) : dayKeyOf(entry.leaveFrom),
      to: timed ? entry.leaveTo.slice(0, 16) : dayKeyOf(entry.leaveTo),
      reason: entry.reason ?? '',
    })
  }

  async function submit() {
    if (!draft || !draft.holidayTypeId) return
    const { leaveFrom, leaveTo } = toRequestDates(draft)
    if (leaveTo < leaveFrom) {
      setError('The end of the leave is before its start.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await saveLeave({
        id: draft.id,
        holidayTypeId: draft.holidayTypeId,
        leaveFrom,
        leaveTo,
        reason: draft.reason.trim() || null,
      })
      if (!result.hasData || !result.data) {
        setError(result.failMessage ?? 'Could not save the leave.')
        return
      }
      setToast(result.okMessage ?? 'Leave applied.')
      setDraft(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(entry: LeaveEntryDto) {
    setSaving(true)
    setError(null)
    try {
      const result = await deleteLeave(entry.id)
      if (!result.hasData) {
        setError(result.failMessage ?? 'Could not cancel the leave.')
        return
      }
      setToast('Leave cancelled.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.')
    } finally {
      setSaving(false)
      setConfirmDelete(null)
    }
  }

  function stepMonth(dir: 1 | -1) {
    const d = new Date(year, month + dir, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const gridStart = startOfWeek(new Date(year, month, 1))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const selectedTypeColor = (id: number | null) => types.find((t) => t.id === id)?.colorCode

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/utilities" />
          </IonButtons>
          <IonTitle>Leave</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => openNew()} disabled={offline || applicableTypes.length === 0}>
              <IonIcon slot="start" icon={addOutline} />
              Apply
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={(e: CustomEvent<RefresherEventDetail>) => void load().finally(() => e.detail.complete())}>
          <IonRefresherContent />
        </IonRefresher>

        {offline && (
          <IonItem color="warning" lines="none">
            <IonIcon icon={cloudOfflineOutline} slot="start" />
            <IonLabel className="ion-text-wrap">Leave needs a connection - it is read from and saved to the office directly.</IonLabel>
          </IonItem>
        )}

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
          <IonButton fill="clear" onClick={() => stepMonth(-1)}>
            <IonIcon slot="icon-only" icon={chevronBackOutline} />
          </IonButton>
          <div style={{ fontWeight: 600 }}>{new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
          <IonButton fill="clear" onClick={() => stepMonth(1)}>
            <IonIcon slot="icon-only" icon={chevronForwardOutline} />
          </IonButton>
        </div>

        {/* Month grid */}
        <div style={{ padding: '0 8px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ion-color-medium)' }}>
                {w}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d) => {
              const key = toDayKey(d)
              const entry = byDay.get(key)
              const inMonth = d.getMonth() === month
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => (entry ? openEdit(entry) : openNew(key))}
                  disabled={offline}
                  title={entry ? `${entry.type}${entry.reason ? ` - ${entry.reason}` : ''}` : undefined}
                  style={{
                    border: key === todayKey ? '2px solid var(--ion-color-primary)' : '1px solid transparent',
                    background: entry ? entry.colorCode : 'transparent',
                    color: entry ? '#fff' : inMonth ? 'inherit' : 'var(--ion-color-medium)',
                    borderRadius: 8,
                    minHeight: 40,
                    fontSize: 14,
                    fontWeight: entry ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          {types.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {types.map((t) => (
                <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: t.colorCode, display: 'inline-block' }} />
                  {t.type}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <IonText color="danger">
            <p className="ion-padding-horizontal">{error}</p>
          </IonText>
        )}

        {/* This month's entries */}
        <IonList>
          <IonListHeader>
            <IonLabel>Leave this month</IonLabel>
            <IonNote style={{ paddingRight: 16 }}>{monthEntries.length}</IonNote>
          </IonListHeader>
          {!loading && monthEntries.length === 0 && (
            <IonItem lines="none">
              <IonLabel color="medium">No leave this month. Tap a day or Apply to add some.</IonLabel>
            </IonItem>
          )}
          {monthEntries.map((e) => {
            const timed = hasTime(e)
            const future = dayKeyOf(e.leaveTo) >= todayKey
            return (
              <IonItemSliding key={e.id}>
                <IonItem button onClick={() => openEdit(e)} disabled={offline}>
                  <span slot="start" style={{ width: 12, height: 12, borderRadius: 6, background: e.colorCode, marginRight: 4 }} />
                  <IonLabel className="ion-text-wrap">
                    <h2>
                      {e.type}
                      {!future && (
                        <IonBadge color="light" style={{ marginLeft: 8 }}>
                          past
                        </IonBadge>
                      )}
                    </h2>
                    <p>
                      {timed
                        ? `${formatDateTime(e.leaveFrom)} – ${formatDateTime(e.leaveTo)}`
                        : dayKeyOf(e.leaveFrom) === dayKeyOf(e.leaveTo)
                          ? formatDate(e.leaveFrom)
                          : `${formatDate(e.leaveFrom)} – ${formatDate(e.leaveTo)}`}
                    </p>
                    {e.reason && <p>{e.reason}</p>}
                  </IonLabel>
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => setConfirmDelete(e)} disabled={offline}>
                    <IonIcon slot="start" icon={trashOutline} />
                    Cancel
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            )
          })}
        </IonList>

        {/* Apply / edit dialog */}
        <IonModal isOpen={draft !== null} onDidDismiss={() => setDraft(null)} initialBreakpoint={0.9} breakpoints={[0, 0.9, 1]}>
          {draft && (
            <>
              <IonHeader>
                <IonToolbar>
                  <IonButtons slot="start">
                    <IonButton onClick={() => setDraft(null)}>Cancel</IonButton>
                  </IonButtons>
                  <IonTitle>{draft.id ? 'Edit leave' : 'Apply for leave'}</IonTitle>
                  <IonButtons slot="end">
                    <IonButton strong onClick={() => void submit()} disabled={saving || !draft.holidayTypeId}>
                      Apply
                    </IonButton>
                  </IonButtons>
                </IonToolbar>
              </IonHeader>
              <IonContent>
                {/* Leave type - one coloured option per HolidayType, using the
                  * planner's ColorCode: outlined when available, solid when picked. */}
                <div className="ion-padding-horizontal" style={{ paddingTop: 12 }}>
                  <IonNote color="medium" style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
                    Leave type
                  </IonNote>
                  <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {applicableTypes.map((t) => {
                      const selected = draft.holidayTypeId === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setDraft({ ...draft, holidayTypeId: t.id })}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '12px 14px',
                            borderRadius: 12,
                            border: `2px solid ${t.colorCode}`,
                            background: selected ? t.colorCode : 'transparent',
                            color: selected ? '#fff' : 'var(--ion-text-color, #222)',
                            fontSize: 15,
                            fontWeight: selected ? 600 : 500,
                            textAlign: 'left',
                            cursor: 'pointer',
                            boxShadow: selected ? '0 3px 10px rgba(0,0,0,0.18)' : 'none',
                            transition: 'background 120ms, box-shadow 120ms',
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 9,
                              border: `2px solid ${selected ? '#fff' : t.colorCode}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flex: '0 0 auto',
                            }}
                          >
                            {selected && <span style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />}
                          </span>
                          <span style={{ lineHeight: 1.2 }}>{t.type}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <IonList inset>
                  <IonItem>
                    <IonCheckbox
                      checked={draft.includeTime}
                      onIonChange={(e) => {
                        const includeTime = e.detail.checked
                        setDraft({
                          ...draft,
                          includeTime,
                          from: includeTime ? `${dayKeyOf(draft.from)}T09:00` : dayKeyOf(draft.from),
                          to: includeTime ? `${dayKeyOf(draft.to)}T17:00` : dayKeyOf(draft.to),
                        })
                      }}
                    >
                      Include time
                    </IonCheckbox>
                  </IonItem>
                  <IonItem>
                    <IonLabel>From</IonLabel>
                    <IonDatetimeButton datetime="leave-from" />
                  </IonItem>
                  <IonItem>
                    <IonLabel>To</IonLabel>
                    <IonDatetimeButton datetime="leave-to" />
                  </IonItem>
                  <IonItem>
                    <IonTextarea
                      label="Reason"
                      labelPlacement="stacked"
                      autoGrow
                      maxlength={200}
                      value={draft.reason}
                      onIonInput={(e) => setDraft({ ...draft, reason: e.detail.value ?? '' })}
                      placeholder="Optional"
                    />
                  </IonItem>
                </IonList>
                <IonModal keepContentsMounted>
                  <IonDatetime
                    id="leave-from"
                    presentation={draft.includeTime ? 'date-time' : 'date'}
                    value={draft.from}
                    onIonChange={(e) => {
                      const v = typeof e.detail.value === 'string' ? e.detail.value : draft.from
                      const from = draft.includeTime ? v.slice(0, 16) : dayKeyOf(v)
                      setDraft({ ...draft, from, to: draft.to < from ? from : draft.to })
                    }}
                  />
                </IonModal>
                <IonModal keepContentsMounted>
                  <IonDatetime
                    id="leave-to"
                    presentation={draft.includeTime ? 'date-time' : 'date'}
                    value={draft.to}
                    min={draft.from}
                    onIonChange={(e) => {
                      const v = typeof e.detail.value === 'string' ? e.detail.value : draft.to
                      setDraft({ ...draft, to: draft.includeTime ? v.slice(0, 16) : dayKeyOf(v) })
                    }}
                  />
                </IonModal>
                {selectedTypeColor(draft.holidayTypeId) && (
                  <IonNote className="ion-padding-horizontal" color="medium" style={{ display: 'block', fontSize: 13 }}>
                    Shown in the office planner as{' '}
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: selectedTypeColor(draft.holidayTypeId) }} />{' '}
                    {types.find((t) => t.id === draft.holidayTypeId)?.type}.
                  </IonNote>
                )}
              </IonContent>
            </>
          )}
        </IonModal>

        <IonAlert
          isOpen={confirmDelete !== null}
          header="Cancel this leave?"
          message={confirmDelete ? `${confirmDelete.type}, ${formatDate(confirmDelete.leaveFrom)} – ${formatDate(confirmDelete.leaveTo)} will be removed from the office planner.` : ''}
          buttons={[
            { text: 'Keep', role: 'cancel', handler: () => setConfirmDelete(null) },
            {
              text: 'Cancel leave',
              role: 'destructive',
              handler: () => {
                if (confirmDelete) void remove(confirmDelete)
              },
            },
          ]}
          onDidDismiss={() => setConfirmDelete(null)}
        />

        <IonToast isOpen={toast !== null} message={toast ?? ''} duration={3000} onDidDismiss={() => setToast(null)} />
        <IonLoading isOpen={loading || saving} message={saving ? 'Saving…' : 'Loading…'} />
      </IonContent>
    </IonPage>
  )
}
