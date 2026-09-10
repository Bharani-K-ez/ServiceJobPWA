import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

/**
 * Rasterizes `element` (meant to be the completed document's content, in
 * its "report" display mode - see DocumentFormPage's toggleDisplay(true)
 * call before invoking this) and slices it across A4 pages into a PDF,
 * saved and handed to the platform's share sheet.
 *
 * Mirrors db/diagnostics.ts's exportAndShareDiagnostics() platform branch
 * (web: trigger a browser download; native: write via Filesystem then
 * Share.share) - same reasoning applies here: most desktop browsers have no
 * native share sheet to hand a file to, so a plain download is the right
 * web fallback, while native gets the real share sheet (email, Drive,
 * WhatsApp, etc.).
 *
 * Known limitation: this slices a single tall rendered image across pages
 * by raw pixel height, the standard html2canvas+jsPDF approach - a row of
 * content can end up split across a page break rather than kept together.
 * Good enough for a first working version; a section-aware page-break
 * strategy (respecting the template's own `page-break-before/after` CSS
 * hints already present in work_docket.html) would be a real improvement
 * but is more than this pass needs.
 */
export async function generateAndSharePdf(element: HTMLElement, fileNameBase: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2, // sharper output than the element's native CSS pixel size
    useCORS: true,
    backgroundColor: '#ffffff',
  })

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const imageData = canvas.toDataURL('image/jpeg', 0.92)

  let heightLeft = imgHeight
  let position = 0
  pdf.addImage(imageData, 'JPEG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imageData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }

  const fileName = `${fileNameBase}.pdf`

  if (Capacitor.getPlatform() === 'web') {
    pdf.save(fileName)
    return
  }

  const base64 = pdf.output('datauristring').split(',')[1] ?? ''
  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  })
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })

  await Share.share({
    title: fileNameBase,
    url: uri,
    files: [uri],
  })
}
