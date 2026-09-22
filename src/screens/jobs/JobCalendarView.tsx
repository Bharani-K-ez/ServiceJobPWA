import { useMemo, useState } from 'react'
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSegment, IonSegmentButton } from '@ionic/react'
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons'
import type { JobState } from '../../db/jobState'
import JobRowItem from './JobRowItem'
import { addDays, fromDayKey, startOfWeek, toDayKey, type JobRow } from './jobFilters'

export type CalendarMode = 'day' | 'week' | 'month'

interface Props {
  rows: JobRow[]
  currentJob: number | null
  currentState: JobState
  onOpen: (serRecId: number) => void
  onResume: (serRecId: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

function shortDay(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * Calendar view of the (already filtered) jobs: Day, Week or Month.
 * Unscheduled jobs have no day to sit on, so they are listed in their own
 * section under the calendar in every mode.
 *
 *  Day   - agenda of that day, previous/next day.
 *  Week  - Mon..Sun strip with a count per day; tap a day to see its agenda.
 *  Month - classic grid with a count bubble per day; tap a day for its agenda.
 */
export default function JobCalendarView({ rows, currentJob, currentState, onOpen, onResume }: Props) {
  const [mode, setMode] = useState<CalendarMode>(() => {
    try {
      const saved = localStorage.getItem('jobs.calendarMode')
      return saved === 'day' || saved === 'week' || saved === 'month' ? saved : 'week'
    } catch {
      return 'week'
    }
  })
  const [selectedDay, setSelectedDay] = useState<string>(() => toDayKey(new Date()))

  const byDay = useMemo(() => {
    const map = new Map<string, JobRow[]>()
    for (const r of rows) {
      if (!r.scheduledDay) continue
      const list = map.get(r.scheduledDay) ?? []
      list.push(r)
      map.set(r.scheduledDay, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.job.scheduledDate ?? '').localeCompare(b.job.scheduledDate ?? ''))
    }
    return map
  }, [rows])
  const unscheduled = useMemo(() => rows.filter((r) => !r.scheduledDay), [rows])

  const selected = fromDayKey(selectedDay)
  const todayKey = toDayKey(new Date())

  function changeMode(next: CalendarMode) {
    setMode(next)
    try {
      localStorage.setItem('jobs.calendarMode', next)
    } catch {
      // per-viewer convenience only
    }
  }

  function step(direction: 1 | -1) {
    if (mode === 'day') setSelectedDay(toDayKey(addDays(selected, direction)))
    else if (mode === 'week') setSelectedDay(toDayKey(addDays(selected, 7 * direction)))
    else setSelectedDay(toDayKey(new Date(selected.getFullYear(), selected.getMonth() + direction, 1)))
  }

  const title =
    mode === 'day'
      ? dayLabel(selected)
      : mode === 'week'
        ? `${shortDay(startOfWeek(selected))} – ${shortDay(addDays(startOfWeek(selected), 6))}`
        : monthLabel(selected)

  const agenda = byDay.get(selectedDay) ?? []

  return (
    <div>
      <div className="ion-padding-horizontal" style={{ paddingTop: 8 }}>
        <IonSegment value={mode} onIonChange={(e) => changeMode(e.detail.value as CalendarMode)}>
          <IonSegmentButton value="day">
            <IonLabel>Day</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="week">
            <IonLabel>Week</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="month">
            <IonLabel>Month</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
        <IonButton fill="clear" onClick={() => step(-1)}>
          <IonIcon slot="icon-only" icon={chevronBackOutline} />
        </IonButton>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          {selectedDay !== todayKey && (
            <IonButton fill="clear" size="small" onClick={() => setSelectedDay(todayKey)}>
              Today
            </IonButton>
          )}
        </div>
        <IonButton fill="clear" onClick={() => step(1)}>
          <IonIcon slot="icon-only" icon={chevronForwardOutline} />
        </IonButton>
      </div>

      {mode === 'week' && (
        <WeekStrip start={startOfWeek(selected)} byDay={byDay} selectedDay={selectedDay} todayKey={todayKey} onSelect={setSelectedDay} />
      )}

      {mode === 'month' && (
        <MonthGrid month={selected} byDay={byDay} selectedDay={selectedDay} todayKey={todayKey} onSelect={setSelectedDay} />
      )}

      <IonList>
        {mode !== 'day' && (
          <IonItem lines="full">
            <IonLabel>
              <h3>{dayLabel(selected)}</h3>
            </IonLabel>
            <IonNote slot="end">{agenda.length} job{agenda.length === 1 ? '' : 's'}</IonNote>
          </IonItem>
        )}
        {agenda.length === 0 && (
          <IonItem lines="none">
            <IonLabel color="medium">No jobs on this day.</IonLabel>
          </IonItem>
        )}
        {agenda.map((row) => (
          <JobRowItem
            key={row.job.serRecId}
            row={row}
            compact
            isCurrent={currentJob === row.job.serRecId}
            currentState={currentState}
            onOpen={onOpen}
            onResume={onResume}
          />
        ))}
      </IonList>

      {unscheduled.length > 0 && (
        <IonList>
          <IonItem lines="full">
            <IonLabel>
              <h3>Unscheduled</h3>
            </IonLabel>
            <IonNote slot="end">{unscheduled.length}</IonNote>
          </IonItem>
          {unscheduled.map((row) => (
            <JobRowItem
              key={row.job.serRecId}
              row={row}
              isCurrent={currentJob === row.job.serRecId}
              currentState={currentState}
              onOpen={onOpen}
              onResume={onResume}
            />
          ))}
        </IonList>
      )}
    </div>
  )
}

interface StripProps {
  byDay: Map<string, JobRow[]>
  selectedDay: string
  todayKey: string
  onSelect: (day: string) => void
}

function DayCell({
  date,
  count,
  selected,
  isToday,
  muted,
  onSelect,
}: {
  date: Date
  count: number
  selected: boolean
  isToday: boolean
  muted?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        border: 'none',
        background: selected ? 'var(--ion-color-primary)' : 'transparent',
        color: selected ? 'var(--ion-color-primary-contrast)' : muted ? 'var(--ion-color-medium)' : 'inherit',
        borderRadius: 10,
        padding: '6px 0 4px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        minHeight: 48,
        fontWeight: isToday ? 700 : 400,
        textDecoration: isToday && !selected ? 'underline' : 'none',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 15 }}>{date.getDate()}</span>
      {count > 0 ? (
        <span
          style={{
            fontSize: 11,
            lineHeight: '16px',
            minWidth: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: selected ? 'var(--ion-color-primary-contrast)' : 'var(--ion-color-primary)',
            color: selected ? 'var(--ion-color-primary)' : 'var(--ion-color-primary-contrast)',
          }}
        >
          {count}
        </span>
      ) : (
        <span style={{ height: 16 }} />
      )}
    </button>
  )
}

function WeekStrip({ start, byDay, selectedDay, todayKey, onSelect }: StripProps & { start: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px 8px', gap: 2 }}>
      {days.map((d, i) => {
        const key = toDayKey(d)
        return (
          <div key={key} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--ion-color-medium)', marginBottom: 2 }}>{WEEKDAYS[i]}</div>
            <DayCell
              date={d}
              count={byDay.get(key)?.length ?? 0}
              selected={key === selectedDay}
              isToday={key === todayKey}
              onSelect={() => onSelect(key)}
            />
          </div>
        )
      })}
    </div>
  )
}

function MonthGrid({ month, byDay, selectedDay, todayKey, onSelect }: StripProps & { month: Date }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const gridStart = startOfWeek(first)
  // 6 rows covers every month layout.
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  return (
    <div style={{ padding: '0 8px 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ion-color-medium)' }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {days.map((d) => {
          const key = toDayKey(d)
          return (
            <DayCell
              key={key}
              date={d}
              count={byDay.get(key)?.length ?? 0}
              selected={key === selectedDay}
              isToday={key === todayKey}
              muted={d.getMonth() !== month.getMonth()}
              onSelect={() => onSelect(key)}
            />
          )
        })}
      </div>
    </div>
  )
}
