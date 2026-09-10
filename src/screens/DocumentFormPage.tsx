import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import {
  getCustomerById,
  getJobById,
  getJobDocument,
  getSiteById,
  saveJobDocument,
  type LocalCustomer,
  type LocalJob,
  type LocalSite,
} from '../db/localData'
import { getDocTemplate } from '../docTemplates/registry'
import { buildBridgeScript } from '../docTemplates/bridge'
import { buildCommonTokens, buildDocContextScript, substituteTemplate } from '../docTemplates/tokens'
import SignaturePadModal from '../components/SignaturePadModal'

type BridgeMessage =
  | { docBridge: true; action: 'bridgeReady' }
  | { docBridge: true; action: 'invokeCSharpAction'; payload: Record<string, unknown> }

/** Only messages this component itself posts INTO the iframe - kept in one
 * place so bridge.ts's listener and this file's sender can't drift apart. */
function postToFrame(win: Window, msg: Record<string, unknown>) {
  win.postMessage({ docBridge: true, ...msg }, window.location.origin)
}

/**
 * Renders one bundled document template (public/templates/*.html - see
 * docTemplates/registry.ts) for a specific job, lets the technician fill it
 * in and sign it, then saves the result locally and/or exports a PDF. See
 * docTemplates/tokens.ts, bridge.ts and pdf.ts for the three pieces this
 * screen ties together.
 *
 * Reached from WipPage's "Create Document" button - documents here are
 * job-level, not tied to a specific asset (there's no per-asset document
 * flow in this app; a template that genuinely needed one could still set
 * DocTemplateDef.assetScoped and take an assetGuid param, this screen just
 * doesn't need to today), so job_documents rows this screen writes always
 * have assetGuid = null - see localData.ts's getJobDocument/saveJobDocument.
 *
 * The template renders inside a same-origin iframe built via
 * document.open()/write()/close() (rather than `srcDoc`, which has had
 * inconsistent contentWindow/contentDocument access across some WebViews)
 * so this component can reach into it directly: read the Angular scope for
 * Save, toggle c-edit/c-disp classes for the PDF's "report" appearance, and
 * rasterize its #template element with html2canvas.
 */
export default function DocumentFormPage() {
  const { serRecId, templateKey } = useParams<{
    serRecId: string
    templateKey: string
  }>()
  const numericSerRecId = Number(serRecId)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState<{ message: string; color: 'success' | 'danger' } | null>(null)
  const [title, setTitle] = useState('Document')

  const [job, setJob] = useState<LocalJob | null>(null)
  const [site, setSite] = useState<LocalSite | null>(null)

  // Which signer the signature modal is currently capturing for, or null
  // when the modal is closed. Holding the key the "Sign" trigger asked for
  // (see the invokeCSharpAction handler below) means this component never
  // needs to guess which role a given signature pad session is for.
  const [signingRole, setSigningRole] = useState<'engineer' | 'customer' | null>(null)

  const buildDocument = useCallback(async () => {
    if (!templateKey) {
      setError('No document template specified.')
      setLoading(false)
      return
    }
    const template = getDocTemplate(templateKey)
    if (!template) {
      setError(`Unknown document template "${templateKey}".`)
      setLoading(false)
      return
    }
    setTitle(template.title)

    try {
      const jobRow = await getJobById(numericSerRecId)
      setJob(jobRow)

      let siteRow: LocalSite | null = null
      let customerRow: LocalCustomer | null = null
      if (jobRow?.siteId) {
        siteRow = await getSiteById(jobRow.siteId)
        setSite(siteRow)
        if (siteRow?.custId) {
          customerRow = await getCustomerById(siteRow.custId)
        }
      }

      const existing = await getJobDocument(numericSerRecId, null, templateKey)

      const tokens = buildCommonTokens({
        job: jobRow
          ? { serRecId: jobRow.serRecId, probDesc: jobRow.probDesc, dispatchEng: jobRow.dispatchEng }
          : null,
        site: siteRow
          ? {
              occupant: siteRow.occupant,
              telephone: siteRow.telephone,
              address: siteRow.address,
              town: siteRow.town,
              county: siteRow.county,
            }
          : null,
        customer: customerRow
          ? { organizationName: customerRow.organizationName, address: customerRow.address, town: customerRow.town, county: customerRow.county }
          : null,
        assetGuid: null,
      })

      const templateUrl = `/${template.assetPath}`
      const res = await fetch(templateUrl)
      if (!res.ok) throw new Error(`Failed to load template (${res.status})`)
      let html = await res.text()
      html = substituteTemplate(html, tokens)

      // The template's own relative asset paths (public/templates/vendor/*
      // - see its <script src="vendor/..."> tags) are written into an
      // iframe via document.write() below rather than loaded via the
      // iframe's `src`, so the iframe never actually navigates to
      // templateUrl - without a <base>, the browser resolves those relative
      // URLs against the PARENT page's current route instead (e.g.
      // /jobs/123/documents/work_docket/vendor/jquery-3.4.1.min.js, a 404),
      // not against where work_docket.html itself lives. Confirmed live:
      // this is exactly what was 404ing before this fix. A <base href>
      // pointing at the template's own directory fixes every relative
      // reference in one place, and has to land before the vendored
      // <script src> tags in <head> (not just anywhere in <head>) since the
      // browser starts fetching each classic script the moment the parser
      // reaches it.
      const templateDir = templateUrl.slice(0, templateUrl.lastIndexOf('/') + 1)
      const baseTag = `<base href="${templateDir}">`
      html = html.includes('<head>') ? html.replace('<head>', `<head>${baseTag}`) : baseTag + html

      const savedDataScript = existing
        ? `<script>window.__DOC_SAVED_DATA__ = ${existing.dataJson};</script>`
        : ''
      const injected = buildDocContextScript(tokens) + savedDataScript + buildBridgeScript()
      // All three vendored <script src> tags load in <head> (see
      // work_docket.html) before the template's own inline script runs
      // later in <body> - injecting right before </head> guarantees jQuery/
      // Angular are already defined by the time bridge.ts's script (which
      // uses both) executes, without needing to know exactly where in
      // <head> to splice.
      html = html.includes('</head>') ? html.replace('</head>', `${injected}</head>`) : injected + html

      const iframe = iframeRef.current
      if (!iframe) return
      const doc = iframe.contentDocument
      if (!doc) throw new Error('Could not access document iframe.')
      doc.open()
      doc.write(html)
      doc.close()
    } catch (err) {
      console.error('[DocumentFormPage] failed to build document:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, numericSerRecId])

  useEffect(() => {
    void buildDocument()
  }, [buildDocument])

  // Handles messages FROM the iframe - currently just the legacy
  // invokeCSharpAction() calls the template's own code already makes (Add
  // Image / Complete Form buttons - see work_docket.html). Ignores anything
  // not tagged docBridge so this never reacts to unrelated postMessage
  // traffic (Ionic/Capacitor internals, browser extensions, etc).
  useEffect(() => {
    function handleMessage(event: MessageEvent<BridgeMessage>) {
      const data = event.data
      if (!data || data.docBridge !== true) return
      if (data.action !== 'invokeCSharpAction') return

      const payload = data.payload
      const triggerFor = payload?.TriggerFor
      if (triggerFor === 'ImagePicker') {
        const key = typeof payload.Image_Key === 'string' ? payload.Image_Key : null
        if (!key) return
        void pickImage(key)
      } else if (triggerFor === 'SignaturePad') {
        // The template's own "Complete Form" button already toggled report
        // mode (FormHelper.toggleDisplay) before calling invokeCSCode(), so
        // this is just the signal that the technician is done editing -
        // nothing further needed here; PDF generation is a separate
        // explicit action (the footer's "Generate PDF" button below) rather
        // than triggered implicitly by this legacy event.
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pickImage(imageKey: string) {
    try {
      // getPhoto (not the newer takePhoto) is used deliberately here: its
      // `source: CameraSource.Prompt` default asks the technician to choose
      // between the camera and their photo library in one step, matching
      // the legacy app's own single "Add Image" button behaviour, and its
      // `resultType: DataUrl` hands back a ready-to-use data URL directly -
      // no separate fetch(webPath)/blob conversion needed. It's marked
      // deprecated in @capacitor/camera (in favour of takePhoto, which only
      // opens the camera) but remains fully functional; fine to revisit if
      // it's ever actually removed.
      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        correctOrientation: true,
      })
      if (!photo.dataUrl) return
      const iframe = iframeRef.current
      const win = iframe?.contentWindow
      if (!win) return
      postToFrame(win, { action: 'imageResult', imageKey, dataUrl: photo.dataUrl })
    } catch (err) {
      // A cancelled picker rejects too - not a real error, just no photo.
      console.warn('[DocumentFormPage] image capture cancelled or failed:', err)
    }
  }

  function openSignature(role: 'engineer' | 'customer') {
    setSigningRole(role)
  }

  function handleSignatureSave(result: { dataUrl: string; printedName: string }) {
    const iframe = iframeRef.current
    const win = iframe?.contentWindow
    setSigningRole(null)
    if (!win) return
    const dateStr = new Date().toLocaleDateString('en-GB')
    postToFrame(win, {
      action: 'setSignature',
      role: signingRole,
      dataUrl: result.dataUrl,
      printedName: result.printedName,
      dateStr,
    })
  }

  function readScopeData(): Record<string, unknown> | null {
    const iframe = iframeRef.current
    const win = iframe?.contentWindow as (Window & { angular?: { element: (sel: string) => { scope: () => { data?: Record<string, unknown> } } } }) | null | undefined
    if (!win?.angular) return null
    try {
      const scope = win.angular.element('#inspection-form').scope()
      return scope?.data ?? null
    } catch (err) {
      console.error('[DocumentFormPage] failed to read template scope:', err)
      return null
    }
  }

  async function handleSave() {
    if (!templateKey) return
    const data = readScopeData()
    if (!data) {
      setToast({ message: 'Could not read the form - try again.', color: 'danger' })
      return
    }
    setSaving(true)
    try {
      await saveJobDocument({
        serRecId: numericSerRecId,
        assetGuid: null,
        templateKey,
        dataJson: JSON.stringify(data),
      })
      setToast({ message: 'Saved.', color: 'success' })
    } catch (err) {
      console.error('[DocumentFormPage] save failed:', err)
      setToast({ message: 'Save failed - see console for details.', color: 'danger' })
    } finally {
      setSaving(false)
    }
  }

  async function handleGeneratePdf() {
    if (!templateKey) return
    const iframe = iframeRef.current
    const win = iframe?.contentWindow
    const doc = iframe?.contentDocument
    if (!win || !doc) return

    setGenerating(true)
    try {
      // Save first so a PDF always reflects the same data the technician
      // would get back on reopening the document, and so pdfFileName below
      // amends the same row rather than depending on save-then-generate
      // ordering elsewhere.
      const data = readScopeData()
      if (data) {
        await saveJobDocument({
          serRecId: numericSerRecId,
          assetGuid: null,
          templateKey,
          dataJson: JSON.stringify(data),
        })
      }

      // Switch to "report" display (hides c-edit inputs, shows c-disp text)
      // via the bridge rather than fHelper.toggleDisplay directly - fHelper
      // is a script-local var inside the template, not exposed on window.
      postToFrame(win, { action: 'toggleReportMode', isReport: true })
      // Let the DOM actually repaint the toggled classes before rasterizing.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const target = doc.getElementById('template') ?? doc.body
      const fileNameBase = `${getDocTemplate(templateKey)?.title ?? 'document'}-${serRecId}`.replace(/[^\w-]+/g, '_')
      // Dynamically imported (rather than a static top-of-file import) so
      // html2canvas/jsPDF - only ever needed once a technician actually taps
      // "Generate PDF" - land in their own lazy-loaded chunk instead of
      // bloating the app's main bundle (and, with it, the size Workbox has
      // to precache for offline use - see vite.config.ts's
      // maximumFileSizeToCacheInBytes comment).
      const { generateAndSharePdf } = await import('../docTemplates/pdf')
      await generateAndSharePdf(target, fileNameBase)

      const pdfData = readScopeData()
      await saveJobDocument({
        serRecId: numericSerRecId,
        assetGuid: null,
        templateKey,
        dataJson: JSON.stringify(pdfData ?? data ?? {}),
        pdfFileName: `${fileNameBase}.pdf`,
      })

      // Back to edit mode so the technician isn't left staring at a
      // read-only view if they want to keep working on it.
      postToFrame(win, { action: 'toggleReportMode', isReport: false })

      setToast({ message: 'PDF generated.', color: 'success' })
    } catch (err) {
      console.error('[DocumentFormPage] PDF generation failed:', err)
      setToast({ message: 'PDF generation failed - see console for details.', color: 'danger' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/jobs/${serRecId}/wip`} />
          </IonButtons>
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {loading && (
          <div className="ion-padding ion-text-center">
            <IonSpinner name="crescent" />
          </div>
        )}
        {error && (
          <div className="ion-padding">
            <IonText color="danger">{error}</IonText>
          </div>
        )}
        <iframe
          ref={iframeRef}
          title={title}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: loading || error ? 'none' : 'block',
          }}
        />
      </IonContent>

      {!loading && !error && (
        <IonFooter>
          <IonToolbar>
            <IonButtons slot="start">
              <IonButton onClick={() => openSignature('engineer')}>Sign (Engineer)</IonButton>
              <IonButton onClick={() => openSignature('customer')}>Sign (Customer)</IonButton>
            </IonButtons>
            <IonButtons slot="end">
              <IonButton disabled={saving} onClick={() => void handleSave()}>
                {saving ? <IonSpinner name="crescent" /> : 'Save'}
              </IonButton>
              <IonButton strong disabled={generating} onClick={() => void handleGeneratePdf()}>
                {generating ? <IonSpinner name="crescent" /> : 'Generate PDF'}
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonFooter>
      )}

      <SignaturePadModal
        isOpen={signingRole !== null}
        role={signingRole ?? 'engineer'}
        initialPrintedName={signingRole === 'engineer' ? job?.dispatchEng ?? '' : site?.occupant ?? ''}
        onCancel={() => setSigningRole(null)}
        onSave={handleSignatureSave}
      />

      <IonToast
        isOpen={toast !== null}
        message={toast?.message}
        color={toast?.color}
        duration={2000}
        onDidDismiss={() => setToast(null)}
      />
    </IonPage>
  )
}
