import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IonAccordion,
  IonAccordionGroup,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { addOutline, closeOutline, createOutline, scanOutline } from 'ionicons/icons'
import { Html5Qrcode } from 'html5-qrcode'
import {
  createBlankAssetServicePropertyRow,
  fromMasterProperty,
  getAssetByGuid,
  getAssetPropertiesByAssetGuid,
  getCommonCategoryByTemplateId,
  getCommonCategoryProps,
  getCustomerById,
  getJobById,
  getServiceVisit,
  getSiteById,
  saveAssetServiceVisit,
  type LocalAsset,
  type LocalAssetServiceProperty,
  type LocalCommonCategory,
  type LocalCommonCategoryProp,
  type LocalCustomer,
  type LocalSite,
} from '../db/localData'
import { getFieldValue, isFieldMissing, setFieldValue } from '../db/dynamicFields'
import DynamicField from '../components/DynamicField'

/**
 * The dynamic "Asset Service information" screen. Header fields
 * (CategoryType 0) are edited directly on the page; detail/grid fields
 * (CategoryType 1) are shown as a compact table of existing rows with an
 * Edit button, and editing/adding a row opens a popup that updates an
 * in-memory draft, committed into headerRow/detailRows state on "Done".
 *
 * Two different things can write that state to local SQLite:
 *  - A silent background autosave (see the effect below this component's
 *    state declarations) debounces any tracked change into a save at
 *    status 0 ("work in progress") - no toast, no navigation, purely
 *    "don't lose the technician's work" insurance.
 *  - The page-level Save button (handleSave) is the only thing that writes
 *    status 1 ("Serviced") - and only after validating every required
 *    field, unlike the autosave. See saveAssetServiceVisit's doc comment
 *    in localData.ts for the full status lifecycle.
 *
 * Both write to the asset_service_history/asset_service_properties tables
 * (one visit per (assetGuid, serRecId), amended in place on repeat saves)
 * rather than the legacy master asset_properties table. The very first time
 * this screen is opened for a given job+asset (no visit saved yet), the
 * form is seeded from the legacy master values so the technician starts
 * from the asset's last-known state instead of a blank form; every save
 * after that loads back from the visit itself. Pushing a saved visit up to
 * the server happens later, from UtilitiesPage's manual Sync.
 */
export default function AssetServiceInfoPage() {
  const { serRecId, assetGuid } = useParams<{ serRecId: string; assetGuid: string }>()
  const navigate = useNavigate()

  const [asset, setAsset] = useState<LocalAsset | null>(null)
  const [site, setSite] = useState<LocalSite | null>(null)
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [category, setCategory] = useState<LocalCommonCategory | null>(null)
  const [fields, setFields] = useState<LocalCommonCategoryProp[]>([])
  const [headerRow, setHeaderRow] = useState<LocalAssetServiceProperty | null>(null)
  const [detailRows, setDetailRows] = useState<LocalAssetServiceProperty[]>([])
  const [loading, setLoading] = useState(true)

  const [editingRow, setEditingRow] = useState<LocalAssetServiceProperty | null>(null)
  const [editingIsNew, setEditingIsNew] = useState(false)
  const [modalMissing, setModalMissing] = useState<Set<number>>(new Set())

  const [toast, setToast] = useState<{ message: string; color: 'success' | 'danger' } | null>(null)

  // "Wild" (contains, case-insensitive) search over the Devices grid, plus a
  // barcode/QR scanner that fills it in from the phone's camera - handy for
  // matching a device by its printed serial number/code without typing it.
  const [deviceQuery, setDeviceQuery] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)

  const customerName = useMemo(() => {
    if (!customer) return null
    return (
      customer.organizationName ||
      [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      null
    )
  }, [customer])

  const siteAddress = useMemo(() => {
    if (!site) return null
    return [site.address, site.town].filter(Boolean).join(', ') || null
  }, [site])

  const headerFields = useMemo(
    () => fields.filter((f) => f.categoryType === 0).sort((a, b) => (a.ctrlOrder ?? 0) - (b.ctrlOrder ?? 0)),
    [fields],
  )
  const detailFields = useMemo(
    () => fields.filter((f) => f.categoryType === 1).sort((a, b) => (a.ctrlOrder ?? 0) - (b.ctrlOrder ?? 0)),
    [fields],
  )
  // First 5 columns (by CtrlOrder) for the detail table.
  const summaryColumns = detailFields.slice(0, 5)

  // Devices search matches against EVERY dynamic field on the row (not just
  // the 5 shown as columns) so a code/serial living in a column past the
  // first 5 is still findable - including via a scanned barcode/QR value.
  const filteredDetailRows = useMemo(() => {
    const q = deviceQuery.trim().toLowerCase()
    if (!q) return detailRows
    return detailRows.filter((row) =>
      detailFields.some((field) => (getFieldValue(row, field) ?? '').toLowerCase().includes(q)),
    )
  }, [detailRows, detailFields, deviceQuery])

  // All 3 sections open by default - an IonAccordionGroup instead of plain
  // stacked cards so the engineer CAN collapse one to make room (e.g. hide
  // the device table while filling in header fields on a small screen),
  // while the normal/default state keeps everything visible at once.
  const [openSections, setOpenSections] = useState<string[]>(['info', 'header', 'detail'])

  // Silent background autosave (see the effect below, and
  // saveAssetServiceVisit's doc comment for the status 0/1 meaning). These
  // are refs, not state: the debounce timer and the unmount-flush cleanup
  // both need the LATEST headerRow/detailRows without re-subscribing, and
  // skipNextAutosaveRef/autosavePendingRef are plumbing that must never
  // itself trigger a re-render.
  const skipNextAutosaveRef = useRef(true)
  const autosavePendingRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)
  const headerRowRef = useRef(headerRow)
  const detailRowsRef = useRef(detailRows)
  const assetGuidRef = useRef(assetGuid)
  const serRecIdRef = useRef(serRecId)
  headerRowRef.current = headerRow
  detailRowsRef.current = detailRows
  assetGuidRef.current = assetGuid
  serRecIdRef.current = serRecId

  useEffect(() => {
    void (async () => {
      if (!assetGuid || !serRecId) return
      setLoading(true)
      // A fresh asset/job pair: the next headerRow/detailRows change the
      // autosave effect sees is this load's OWN setHeaderRow/setDetailRows
      // below, not a technician edit - skip that one.
      skipNextAutosaveRef.current = true

      const serRecIdNum = Number(serRecId)

      const loadedAsset = await getAssetByGuid(assetGuid)
      setAsset(loadedAsset)

      const job = await getJobById(serRecIdNum)
      let loadedSite: LocalSite | null = null
      let loadedCustomer: LocalCustomer | null = null
      if (job?.siteId != null) {
        loadedSite = await getSiteById(job.siteId)
        if (loadedSite?.custId != null) {
          loadedCustomer = await getCustomerById(loadedSite.custId)
        }
      }
      setSite(loadedSite)
      setCustomer(loadedCustomer)

      let loadedCategory: LocalCommonCategory | null = null
      let loadedFields: LocalCommonCategoryProp[] = []
      if (loadedAsset?.templateId != null) {
        loadedCategory = await getCommonCategoryByTemplateId(loadedAsset.templateId)
        if (loadedCategory) {
          loadedFields = await getCommonCategoryProps(loadedCategory.categoryId)
        }
      }
      setCategory(loadedCategory)
      setFields(loadedFields)

      // Prefer an already-saved visit for this exact (asset, job) pair -
      // whether pending or already synced - over the legacy master values,
      // so reopening a visit shows what was actually captured for THIS
      // service call. Only when no visit has ever been saved here do we
      // seed the form from the master AssetProperties values instead.
      const existingVisit = await getServiceVisit(assetGuid, serRecIdNum)

      let existingHeader: LocalAssetServiceProperty | null = null
      let existingDetails: LocalAssetServiceProperty[] = []

      if (existingVisit) {
        existingHeader = existingVisit.properties.find((r) => r.type === 0) ?? null
        existingDetails = existingVisit.properties.filter((r) => r.type === 1)
      } else {
        const masterRows = await getAssetPropertiesByAssetGuid(assetGuid)
        const masterHeader = masterRows.find((r) => r.type === 0)
        existingHeader = masterHeader ? fromMasterProperty(masterHeader) : null
        existingDetails = masterRows.filter((r) => r.type === 1).map(fromMasterProperty)
      }

      const hasHeaderFields = loadedFields.some((f) => f.categoryType === 0)
      setHeaderRow(existingHeader ?? (hasHeaderFields ? createBlankAssetServicePropertyRow(0) : null))
      setDetailRows(existingDetails)

      setLoading(false)
    })()
  }, [assetGuid, serRecId])

  // Silent background autosave: ANY tracked change to headerRow/detailRows
  // - a header field edit, a device row added/edited/removed via the modal
  // (confirmModal), or the Serviced checkbox toggled directly (toggleServiced)
  // - debounces into a save at status 0 ("work in progress"), with no toast
  // and no navigation. This deliberately fires again even for an asset that
  // was already explicitly Saved (status 1/"Serviced") - touching the form
  // again means it's back to in-progress until Save is pressed again. See
  // saveAssetServiceVisit's doc comment for the full 0/1 lifecycle.
  useEffect(() => {
    if (loading) return
    if (skipNextAutosaveRef.current) {
      // This run is the load effect's own initial setHeaderRow/setDetailRows
      // landing, not a technician edit - don't autosave it.
      skipNextAutosaveRef.current = false
      return
    }
    if (!assetGuid || !serRecId) return

    autosavePendingRef.current = true
    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null
      void saveAssetServiceVisit(assetGuid, Number(serRecId), headerRowRef.current, detailRowsRef.current, 0)
        .then(() => {
          autosavePendingRef.current = false
        })
        .catch(() => {
          // Silent by design - a background autosave failure shouldn't
          // interrupt the technician. The next tracked change (debounced
          // again) or the explicit Save button will try again.
        })
    }, 10000)
    autosaveTimerRef.current = timer

    return () => window.clearTimeout(timer)
  }, [headerRow, detailRows, loading, assetGuid, serRecId])

  // Flushes a still-pending autosave if the technician navigates away
  // before the debounce above fires (e.g. an edit immediately followed by
  // the back button) - otherwise that last edit would silently never be
  // saved. Runs only on unmount (empty deps): headerRowRef/detailRowsRef
  // are kept current every render specifically so this closure always sees
  // the latest values despite never itself re-subscribing.
  useEffect(() => {
    return () => {
      const guid = assetGuidRef.current
      const rec = serRecIdRef.current
      if (autosavePendingRef.current && guid && rec) {
        void saveAssetServiceVisit(guid, Number(rec), headerRowRef.current, detailRowsRef.current, 0).catch(
          () => undefined,
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Barcode/QR scanning for the Devices search box. Uses the camera directly
  // via getUserMedia (through html5-qrcode) rather than a native Capacitor
  // plugin, since this app doesn't have iOS/Android native projects added
  // yet (see capacitor.config.ts) - this way scanning already works today in
  // the browser/PWA build, and keeps working later inside a native WebView.
  //
  // Started from IonModal's onDidPresent (not a plain useEffect keyed on
  // scannerOpen): Ionic doesn't mount an IonModal's content into the DOM
  // until it actually presents, so constructing Html5Qrcode any earlier
  // fails with "HTML Element with id=... not found".
  const scannerElementId = 'device-scan-region'
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const scannerCancelledRef = useRef(false)

  function startScanner() {
    scannerCancelledRef.current = false
    const qr = new Html5Qrcode(scannerElementId)
    html5QrCodeRef.current = qr

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (scannerCancelledRef.current) return
        setDeviceQuery(decodedText)
        setToast({ message: `Scanned: ${decodedText}`, color: 'success' })
        setScannerOpen(false)
      },
      // Per-frame "no code found" callback - fires constantly while aiming,
      // so it's intentionally ignored rather than surfaced as an error.
      () => undefined,
    ).catch((err: unknown) => {
      if (scannerCancelledRef.current) return
      const message = err instanceof Error ? err.message : String(err)
      setToast({ message: `Camera unavailable: ${message}`, color: 'danger' })
      setScannerOpen(false)
    })
  }

  function stopScanner() {
    scannerCancelledRef.current = true
    const running = html5QrCodeRef.current
    html5QrCodeRef.current = null
    if (running && running.isScanning) {
      running.stop().then(() => running.clear()).catch(() => undefined)
    } else if (running) {
      running.clear()
    }
  }

  function openAddRow() {
    setEditingRow(createBlankAssetServicePropertyRow(1))
    setEditingIsNew(true)
    setModalMissing(new Set())
  }

  function openEditRow(row: LocalAssetServiceProperty) {
    setEditingRow(row)
    setEditingIsNew(false)
    setModalMissing(new Set())
  }

  /** Flips a device row's serviced/not-serviced flag directly from the list -
   * independent of opening the edit popup. Only updates in-memory state, same
   * as any other field edit on this page - the page-level Save button is what
   * actually persists it (and pushes it up on the next Sync). */
  function toggleServiced(row: LocalAssetServiceProperty) {
    setDetailRows((prev) =>
      prev.map((r) => (r.localId === row.localId ? { ...r, serviceFlag: !r.serviceFlag } : r)),
    )
  }

  function closeModal() {
    setEditingRow(null)
  }

  function confirmModal() {
    if (!editingRow) return

    const missing = new Set<number>()
    for (const field of detailFields) {
      if (isFieldMissing(field, getFieldValue(editingRow, field))) {
        missing.add(field.propsId)
      }
    }
    if (missing.size > 0) {
      setModalMissing(missing)
      return
    }

    setDetailRows((prev) =>
      editingIsNew ? [...prev, editingRow] : prev.map((r) => (r.localId === editingRow.localId ? editingRow : r)),
    )
    setEditingRow(null)
  }

  async function handleSave() {
    // Cancel any autosave the debounce timer still has scheduled before
    // doing the explicit, validated save below - otherwise it could fire
    // moments later at status 0 and stomp the status-1 "Serviced" save this
    // function is about to make.
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    const missingLabels: string[] = []

    if (headerRow) {
      for (const field of headerFields) {
        if (isFieldMissing(field, getFieldValue(headerRow, field))) {
          missingLabels.push(field.name ?? `Field ${field.propsId}`)
        }
      }
    }
    detailRows.forEach((row, idx) => {
      for (const field of detailFields) {
        if (isFieldMissing(field, getFieldValue(row, field))) {
          missingLabels.push(`Row ${idx + 1}: ${field.name ?? field.propsId}`)
        }
      }
    })

    if (missingLabels.length > 0) {
      setToast({ message: `Missing required fields: ${missingLabels.join(', ')}`, color: 'danger' })
      return
    }

    if (!assetGuid || !serRecId) return

    try {
      // status: 1 - this is the ONLY place that marks the visit "Serviced"
      // (see saveAssetServiceVisit's doc comment). Cancel any autosave the
      // background effect still has pending BEFORE navigating away: this
      // page is about to unmount, and its unmount-flush effect would
      // otherwise re-save at status 0 right behind this status-1 save and
      // silently un-mark the asset as serviced.
      await saveAssetServiceVisit(assetGuid, Number(serRecId), headerRow, detailRows, 1)
      autosavePendingRef.current = false
      // Back to the Asset Service list rather than a toast-and-stay: the
      // list is what shows this asset now marked "Serviced" (see
      // AssetServiceListPage's servicedGuids), so returning to it is the
      // useful confirmation that the save took. A REPLACE (not a plain
      // navigate) so the back button from the list doesn't return to this
      // now-saved form - same pattern as WipPage's Complete/Pause Job.
      navigate(`/jobs/${serRecId}/assets`, { replace: true })
    } catch {
      setToast({ message: 'Could not save - please try again.', color: 'danger' })
    }
  }

  const hasDynamicForm = category != null && fields.length > 0

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/jobs/${serRecId}/assets`} />
          </IonButtons>
          <IonTitle>{asset?.assetName ?? 'Asset'}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {loading && (
          <div className="ion-padding ion-text-center">
            <IonSpinner name="crescent" />
          </div>
        )}
        {/* Gated behind `loading` rather than rendered immediately with empty
            data: headerFields/detailFields start out empty until the async
            load finishes, and IonAccordionGroup only auto-opens the
            IonAccordion children present the FIRST time it mounts - one
            added later (once data arrives) does not retroactively honor
            `value`. Mounting the whole group only once loading is done means
            all 3 accordions are already there for the group's first render. */}
        {!loading && (
        <IonAccordionGroup
          multiple
          value={openSections}
          onIonChange={(e) => {
            // ionChange bubbles - the Devices search box (and anything else
            // inside an accordion's content) also fires its own ionChange,
            // which would otherwise reach this handler and stomp
            // openSections with that control's value instead of the
            // accordion group's. Only react to the event when it actually
            // came from the group itself.
            if (e.target !== e.currentTarget) return
            setOpenSections((e.detail.value as string[] | null) ?? [])
          }}
        >
          <IonAccordion value="info">
            <IonItem slot="header" color="light">
              <IonLabel>
                <h2>{asset?.assetName ?? 'Asset'}</h2>
                <p>Job #{serRecId}</p>
              </IonLabel>
            </IonItem>
            <div className="ion-padding" slot="content">
              <IonList lines="none">
                <IonItem>
                  <IonLabel>Asset Name</IonLabel>
                  <IonNote slot="end">{asset?.assetName ?? '—'}</IonNote>
                </IonItem>
                <IonItem>
                  <IonLabel>Job Id</IonLabel>
                  <IonNote slot="end">{serRecId ?? '—'}</IonNote>
                </IonItem>
                <IonItem>
                  <IonLabel>Customer</IonLabel>
                  <IonNote slot="end">{customerName ?? '—'}</IonNote>
                </IonItem>
                <IonItem>
                  <IonLabel>Site Address</IonLabel>
                  <IonNote slot="end">{siteAddress ?? '—'}</IonNote>
                </IonItem>
              </IonList>
            </div>
          </IonAccordion>

          {!loading && !hasDynamicForm && (
            <IonText color="medium">
              <p className="ion-padding">No service form is configured for this asset type yet.</p>
            </IonText>
          )}

          {hasDynamicForm && headerFields.length > 0 && headerRow && (
            <IonAccordion value="header">
              <IonItem slot="header" color="light">
                <IonLabel>Details</IonLabel>
              </IonItem>
              <div className="ion-padding" slot="content">
                {/* Two controls per row - IonCol size="6" wraps automatically. */}
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {headerFields.map((field) => (
                    <div key={field.propsId} style={{ width: '50%', boxSizing: 'border-box', padding: '0 4px' }}>
                      <DynamicField
                        field={field}
                        value={getFieldValue(headerRow, field)}
                        onChange={(value) =>
                          setHeaderRow((prev) => (prev ? setFieldValue(prev, field, value) : prev))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </IonAccordion>
          )}

          {hasDynamicForm && detailFields.length > 0 && (
            <IonAccordion value="detail">
              <IonItem slot="header" color="light">
                <IonLabel>Devices</IonLabel>
              </IonItem>
              <div className="ion-padding" slot="content">
                {detailRows.length === 0 && (
                  <IonText color="medium">
                    <p>No rows added yet.</p>
                  </IonText>
                )}
                {detailRows.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <IonSearchbar
                      value={deviceQuery}
                      debounce={150}
                      placeholder="Search devices (any field)"
                      style={{ padding: 0, flex: 1 }}
                      onIonInput={(e) => setDeviceQuery(e.detail.value ?? '')}
                    />
                    <IonButton
                      fill="clear"
                      aria-label="Scan barcode or QR code"
                      onClick={() => setScannerOpen(true)}
                    >
                      <IonIcon icon={scanOutline} slot="icon-only" />
                    </IonButton>
                  </div>
                )}
                {detailRows.length > 0 && filteredDetailRows.length === 0 && (
                  <IonText color="medium">
                    <p>No devices match "{deviceQuery}".</p>
                  </IonText>
                )}
                {/* A bounded, independently-scrolling area (rather than relying on the
                    page scroll) so the header row has a scroll container it can actually
                    stick to, regardless of how many device rows there are. */}
                <div style={{ maxHeight: '55vh', overflowY: 'auto', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    {filteredDetailRows.length > 0 && (
                      <thead>
                        <tr>
                          {summaryColumns.map((col) => (
                            <th
                              key={col.propsId}
                              style={{
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                                textAlign: 'left',
                                padding: '6px 8px',
                                fontSize: 13,
                                color: 'var(--ion-color-medium)',
                                background: 'var(--ion-background-color, #fff)',
                                borderBottom: '1px solid var(--ion-color-light-shade, #e0e0e0)',
                              }}
                            >
                              {col.name}
                            </th>
                          ))}
                          <th
                            style={{
                              position: 'sticky',
                              top: 0,
                              zIndex: 1,
                              width: 68,
                              textAlign: 'center',
                              fontSize: 13,
                              color: 'var(--ion-color-medium)',
                              background: 'var(--ion-background-color, #fff)',
                              borderBottom: '1px solid var(--ion-color-light-shade, #e0e0e0)',
                            }}
                          >
                            Serviced
                          </th>
                          <th
                            style={{
                              position: 'sticky',
                              top: 0,
                              zIndex: 1,
                              width: 44,
                              background: 'var(--ion-background-color, #fff)',
                              borderBottom: '1px solid var(--ion-color-light-shade, #e0e0e0)',
                            }}
                          />
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {filteredDetailRows.map((row) => (
                        <tr key={row.localId} style={{ borderTop: '1px solid var(--ion-color-light-shade, #e0e0e0)' }}>
                          {summaryColumns.map((col) => (
                            <td key={col.propsId} style={{ padding: '8px' }}>
                              {getFieldValue(row, col) || '—'}
                            </td>
                          ))}
                          <td style={{ padding: '4px', textAlign: 'center' }}>
                            <IonCheckbox
                              aria-label="Serviced"
                              checked={row.serviceFlag}
                              onIonChange={() => toggleServiced(row)}
                            />
                          </td>
                          <td style={{ padding: '4px', textAlign: 'right' }}>
                            <IonButton fill="clear" size="small" onClick={() => openEditRow(row)}>
                              <IonIcon icon={createOutline} slot="icon-only" />
                            </IonButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <IonButton expand="block" fill="outline" className="ion-margin-top" onClick={openAddRow}>
                  <IonIcon icon={addOutline} slot="start" />
                  Add row
                </IonButton>
              </div>
            </IonAccordion>
          )}
        </IonAccordionGroup>
        )}
      </IonContent>

      {hasDynamicForm && (
        <IonFooter>
          <IonToolbar>
            <IonButton expand="block" className="ion-margin-horizontal" onClick={() => void handleSave()}>
              Save
            </IonButton>
          </IonToolbar>
        </IonFooter>
      )}

      <IonModal isOpen={editingRow !== null} onDidDismiss={closeModal}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>{editingIsNew ? 'Add device' : 'Edit device'}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={closeModal}>
                <IonIcon icon={closeOutline} slot="icon-only" />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <IonList lines="full">
            <IonListHeader>Device details</IonListHeader>
            {editingRow &&
              detailFields.map((field) => (
                <DynamicField
                  key={field.propsId}
                  field={field}
                  value={getFieldValue(editingRow, field)}
                  missing={modalMissing.has(field.propsId)}
                  onChange={(value) =>
                    setEditingRow((prev) => (prev ? setFieldValue(prev, field, value) : prev))
                  }
                />
              ))}
          </IonList>
        </IonContent>
        <IonFooter>
          <IonToolbar>
            <IonButtons slot="start">
              <IonButton onClick={closeModal}>Cancel</IonButton>
            </IonButtons>
            <IonButtons slot="end">
              <IonButton strong onClick={confirmModal}>
                Done
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonFooter>
      </IonModal>

      <IonModal
        isOpen={scannerOpen}
        onDidPresent={startScanner}
        onWillDismiss={stopScanner}
        onDidDismiss={() => setScannerOpen(false)}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Scan barcode / QR code</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setScannerOpen(false)}>
                <IonIcon icon={closeOutline} slot="icon-only" />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <div className="ion-padding">
            <IonText color="medium">
              <p>Point the camera at a device's barcode or QR code.</p>
            </IonText>
          </div>
          {/* html5-qrcode renders the live camera preview into this element by id. */}
          <div id={scannerElementId} style={{ width: '100%' }} />
        </IonContent>
      </IonModal>

      <IonToast
        isOpen={toast !== null}
        message={toast?.message}
        color={toast?.color}
        duration={3000}
        onDidDismiss={() => setToast(null)}
      />
    </IonPage>
  )
}
