import { IonActionSheet } from '@ionic/react'
import { callOutline, closeOutline, mailOutline, navigateOutline } from 'ionicons/icons'
import type { LocalCustomer, LocalSite } from '../db/localData'

interface Props {
  isOpen: boolean
  onDismiss: () => void
  site: LocalSite | null
  customer: LocalCustomer | null
}

function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}

/**
 * The "Contact" action on the job detail / WIP screens: every phone number
 * we hold for the site and its customer as tap-to-call rows, an email row
 * for the customer, and a "Directions" row that opens the site address (or
 * its coordinates, when the site has them) in the device's maps app.
 */
export default function JobContactSheet({ isOpen, onDismiss, site, customer }: Props) {
  const buttons: { text: string; icon: string; handler?: () => void; role?: string }[] = []

  const seen = new Set<string>()
  const addPhone = (label: string, number: string | null) => {
    const trimmed = number?.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    buttons.push({
      text: `${label}: ${trimmed}`,
      icon: callOutline,
      handler: () => {
        window.location.href = telHref(trimmed)
      },
    })
  }

  addPhone('Site', site?.telephone ?? null)
  addPhone('Customer mobile', customer?.mobilePhone ?? null)
  addPhone('Customer work', customer?.workPhone ?? null)
  addPhone('Customer home', customer?.homePhone ?? null)

  if (customer?.emailAddress) {
    buttons.push({
      text: `Email ${customer.emailAddress}`,
      icon: mailOutline,
      handler: () => {
        window.location.href = `mailto:${customer.emailAddress}`
      },
    })
  }

  const address = [site?.address, site?.town, site?.county, site?.postCode].filter(Boolean).join(', ')
  if (site && (address || (site.latitude != null && site.longitude != null))) {
    const query =
      site.latitude != null && site.longitude != null
        ? `${site.latitude},${site.longitude}`
        : encodeURIComponent(address)
    buttons.push({
      text: 'Directions to site',
      icon: navigateOutline,
      handler: () => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
      },
    })
  }

  if (buttons.length === 0) {
    buttons.push({ text: 'No contact details on file', icon: closeOutline, role: 'cancel' })
  } else {
    buttons.push({ text: 'Cancel', icon: closeOutline, role: 'cancel' })
  }

  return (
    <IonActionSheet
      isOpen={isOpen}
      header={site?.occupant ?? customer?.organizationName ?? 'Contact'}
      buttons={buttons}
      onDidDismiss={onDismiss}
    />
  )
}
