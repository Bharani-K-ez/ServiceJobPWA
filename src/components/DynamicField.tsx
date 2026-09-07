import { useState } from 'react'
import {
  IonCheckbox,
  IonDatetime,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonSelect,
  IonSelectOption,
} from '@ionic/react'
import { calendarOutline } from 'ionicons/icons'
import type { LocalCommonCategoryProp } from '../db/localData'
import { dmyToIso, isoToDmy, parseSelectOptions } from '../db/dynamicFields'

interface DynamicFieldProps {
  field: LocalCommonCategoryProp
  value: string | null
  missing?: boolean
  onChange: (value: string | null) => void
}

/**
 * Renders one dynamic form control, chosen entirely by
 * CommonCategoryProps.CtrlType - Text / Date (DD/MM/YYYY) / Number / Select
 * (options from CtrlProps JSON) / bool. Every other page (header fields
 * inline, detail-row edit popup) shares this one component so the two
 * places a field can appear always behave identically.
 */
export default function DynamicField({ field, value, missing, onChange }: DynamicFieldProps) {
  const [dateOpen, setDateOpen] = useState(false)
  const label = field.name ?? ''
  const ctrlType = (field.ctrlType ?? '').toLowerCase()

  const labelNode = (
    <IonLabel position="stacked" color={missing ? 'danger' : undefined}>
      {label}
      {field.ctrlIsMandatory && ' *'}
    </IonLabel>
  )

  if (ctrlType === 'number') {
    return (
      <IonItem>
        {labelNode}
        <IonInput
          type="number"
          inputmode="decimal"
          value={value ?? ''}
          onIonInput={(e) => onChange(e.detail.value === '' ? null : (e.detail.value ?? null))}
        />
      </IonItem>
    )
  }

  if (ctrlType === 'date') {
    const iso = dmyToIso(value)
    return (
      <>
        <IonItem button detail={false} onClick={() => setDateOpen(true)}>
          {labelNode}
          <IonLabel slot="end">{value || 'Tap to set'}</IonLabel>
          <IonIcon icon={calendarOutline} slot="end" color="medium" />
        </IonItem>
        <IonModal
          isOpen={dateOpen}
          onDidDismiss={() => setDateOpen(false)}
          initialBreakpoint={0.55}
          breakpoints={[0, 0.55]}
        >
          <IonDatetime
            presentation="date"
            value={iso ?? undefined}
            onIonChange={(e) => {
              const raw = e.detail.value
              const single = Array.isArray(raw) ? raw[0] : raw
              onChange(isoToDmy(single ?? null))
              setDateOpen(false)
            }}
          />
        </IonModal>
      </>
    )
  }

  if (ctrlType === 'select') {
    const options = parseSelectOptions(field.ctrlProps)
    return (
      <IonItem>
        {labelNode}
        <IonSelect
          value={value ?? ''}
          interface="action-sheet"
          onIonChange={(e) => onChange(e.detail.value === '' ? null : e.detail.value)}
        >
          {options.map((opt) => (
            <IonSelectOption key={opt.value} value={opt.value}>
              {opt.value === '' ? '—' : opt.value}
            </IonSelectOption>
          ))}
        </IonSelect>
      </IonItem>
    )
  }

  if (ctrlType === 'bool') {
    return (
      <IonItem>
        <IonCheckbox checked={value === '1'} onIonChange={(e) => onChange(e.detail.checked ? '1' : '0')}>
          {label}
        </IonCheckbox>
      </IonItem>
    )
  }

  // 'text' and anything unrecognized - a plain text input is the safest fallback.
  return (
    <IonItem>
      {labelNode}
      <IonInput
        type="text"
        value={value ?? ''}
        onIonInput={(e) => onChange(e.detail.value === '' ? null : (e.detail.value ?? null))}
      />
    </IonItem>
  )
}
