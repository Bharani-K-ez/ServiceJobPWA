import { IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonNote } from '@ionic/react'
import { playOutline } from 'ionicons/icons'
import type { JobState } from '../../db/jobState'
import { formatDate, formatTime } from '../../utils/format'
import type { JobRow } from './jobFilters'

const STATE_BADGE: Record<JobState, string> = {
  TravelTo: 'Travelling to',
  'On Work': 'On site',
  TravelFrom: 'Travelling from',
  Unknown: 'Current',
}

interface Props {
  row: JobRow
  isCurrent: boolean
  currentState: JobState
  /** Hide the date line (the calendar views already group by day). */
  compact?: boolean
  onOpen: (serRecId: number) => void
  onResume: (serRecId: number) => void
}

/** One job in the list / day agenda - tap for details, Resume on the current job. */
export default function JobRowItem({ row, isCurrent, currentState, compact, onOpen, onResume }: Props) {
  const { job } = row
  const isPaused = job.localStatus === 'paused'

  return (
    <IonItem button detail={!isCurrent} onClick={() => onOpen(job.serRecId)} color={isCurrent ? 'light' : undefined}>
      <IonLabel className="ion-text-wrap">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {job.docketRef ?? `Job #${job.serRecId}`}
          {isCurrent && <IonBadge color="warning">{STATE_BADGE[currentState as JobState]}</IonBadge>}
          {isPaused && !isCurrent && <IonBadge color="medium">Paused</IonBadge>}
          {job.priority != null && job.priority > 0 && <IonBadge color="danger">P{job.priority}</IonBadge>}
        </h2>
        <p>{[row.siteName, row.siteAddress].filter(Boolean).join(', ') || 'No site on file'}</p>
        {row.customerName && row.customerName !== row.siteName && <p>{row.customerName}</p>}
        <p>{job.probDesc}</p>
        <IonNote color="medium">
          {compact
            ? job.scheduledDate
              ? formatTime(job.scheduledDate)
              : 'No time'
            : formatDate(job.scheduledDate ?? job.datePromisedDt)}
          {job.timeFrame ? ` · ${job.timeFrame}` : ''}
          {job.dispatchStatusDesc ? ` · ${job.dispatchStatusDesc}` : ''}
        </IonNote>
      </IonLabel>
      {isCurrent && (
        <IonButton
          slot="end"
          color="warning"
          onClick={(e) => {
            e.stopPropagation()
            onResume(job.serRecId)
          }}
        >
          <IonIcon slot="start" icon={playOutline} />
          Resume
        </IonButton>
      )}
    </IonItem>
  )
}
