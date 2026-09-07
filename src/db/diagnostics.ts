import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getDb } from './sqlite'

/**
 * "Send diagnostics" - exports the whole local SQLite database to JSON and
 * hands it to the platform's native share sheet (email, Drive, etc.) so the
 * engineer can send it off for troubleshooting. On the web build (no native
 * share sheet available on most desktop browsers) it falls back to a plain
 * browser download instead.
 */
export async function exportAndShareDiagnostics(): Promise<void> {
  const db = await getDb()
  const { export: dump } = await db.exportToJson('full')
  const json = JSON.stringify(dump ?? {}, null, 2)
  const fileName = `servicejobs-diagnostics-${Date.now()}.json`

  if (Capacitor.getPlatform() === 'web') {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return
  }

  await Filesystem.writeFile({
    path: fileName,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })

  await Share.share({
    title: 'ServiceJobs diagnostics',
    text: 'Local app data export for troubleshooting.',
    url: uri,
    files: [uri],
  })
}
