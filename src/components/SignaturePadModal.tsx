import { useEffect, useRef, useState } from 'react'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { closeOutline } from 'ionicons/icons'

/**
 * Canvas-based signature capture, standing in for the legacy MAUI app's
 * native SignaturePad (see work_docket.html's invokeCSCode()/TriggerFor:
 * 'SignaturePad' - the old flow handed a rendered HTML string to a native
 * signature-capture screen; there's no native host anymore, so this is a
 * plain in-app replacement instead). Captures a drawn signature AND a typed
 * printed name, since work_docket.html displays both separately (the image
 * itself, plus a `{{ data.company_sign / customer_sign }}` printed-name
 * line - see that file's row just below the signature images).
 *
 * Used for both signer roles (`role` prop) - DocumentFormPage.tsx opens one
 * instance per role rather than trying to share drawn state between them.
 */
export default function SignaturePadModal({
  isOpen,
  role,
  initialPrintedName,
  onCancel,
  onSave,
}: {
  isOpen: boolean
  role: 'engineer' | 'customer'
  initialPrintedName: string
  onCancel: () => void
  onSave: (result: { dataUrl: string; printedName: string }) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const hasStrokeRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [printedName, setPrintedName] = useState(initialPrintedName)
  const [isEmpty, setIsEmpty] = useState(true)

  // Reset the pad and seed the name field fresh every time the modal opens -
  // otherwise a previous signing session's ink would still be on the canvas
  // if the technician reopens this for a second signer.
  useEffect(() => {
    if (!isOpen) return
    setPrintedName(initialPrintedName)
    setIsEmpty(true)
    hasStrokeRef.current = false
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [isOpen, initialPrintedName])

  function resizeCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1a1a1a'
    }
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = pointFromEvent(e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const point = pointFromEvent(e)
    const last = lastPointRef.current ?? point
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
    if (!hasStrokeRef.current) {
      hasStrokeRef.current = true
      setIsEmpty(false)
    }
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasStrokeRef.current = false
    setIsEmpty(true)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || isEmpty) return
    onSave({ dataUrl: canvas.toDataURL('image/png'), printedName: printedName.trim() })
  }

  return (
    <IonModal isOpen={isOpen} onDidPresent={resizeCanvas} onDidDismiss={onCancel}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{role === 'engineer' ? "Engineer's signature" : "Customer's signature"}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onCancel}>
              <IonIcon icon={closeOutline} slot="icon-only" />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonItem>
          <IonLabel position="stacked">Printed name</IonLabel>
          <IonInput
            value={printedName}
            placeholder="Full name"
            onIonInput={(e) => setPrintedName(e.detail.value ?? '')}
          />
        </IonItem>

        <div style={{ marginTop: 16 }}>
          <IonLabel>Sign below</IonLabel>
          <div
            style={{
              border: '1px solid var(--ion-color-medium)',
              borderRadius: 4,
              marginTop: 8,
              touchAction: 'none',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 200, display: 'block' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          </div>
          <IonButton fill="clear" size="small" onClick={handleClear}>
            Clear
          </IonButton>
        </div>
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onCancel}>Cancel</IonButton>
          </IonButtons>
          <IonButtons slot="end">
            <IonButton strong disabled={isEmpty || !printedName.trim()} onClick={handleSave}>
              Use signature
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  )
}
