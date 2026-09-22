import { useCallback, useEffect, useState } from 'react'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonNote,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { Capacitor } from '@capacitor/core'
import { getDb, persist } from '../db/sqlite'
import { DB_NAME } from '../db/schema'

/**
 * DEV-ONLY local database browser, at /dev/db. Registered in App.tsx only
 * when `import.meta.env.DEV` is true, so it never ships in a production
 * bundle (Vite tree-shakes the import away).
 *
 * Why it exists: on web the app's SQLite database lives inside jeep-sqlite
 * as one opaque blob in IndexedDB (jeepSqliteStore / databases /
 * "<DB_NAME>SQLite.db"), which Chrome's IndexedDB viewer can only show as a
 * byte array, and on a device there is no browser tooling at all. This page
 * talks to the SAME live connection the app uses (getDb), so it shows the
 * in-memory state including writes that haven't been persisted yet.
 *
 * - Pick a table to see its first N rows (from sqlite_master, so new tables
 *   appear automatically).
 * - Or type any SQL. Read-only by default (db.query); tick "Allow writes"
 *   to run INSERT/UPDATE/DELETE through db.run + persist().
 * - "Download .db" grabs the persisted SQLite file straight out of
 *   IndexedDB (web only) for DB Browser for SQLite / the VS Code SQLite
 *   Viewer. Run a sync or any save first so the blob is current - the
 *   in-memory copy is only flushed to IndexedDB by persist().
 */

const ROW_LIMIT_OPTIONS = [50, 200, 1000]

/** How jeep-sqlite names its IndexedDB database / store / key - see its WebStore source. */
const JEEP_IDB_NAME = 'jeepSqliteStore'
const JEEP_IDB_STORE = 'databases'
const JEEP_IDB_KEY = `${DB_NAME}SQLite.db`

type Row = Record<string, unknown>

function isReadOnlySql(sql: string): boolean {
  const head = sql.trim().replace(/^--.*$/gm, '').trim().slice(0, 10).toUpperCase()
  return head.startsWith('SELECT') || head.startsWith('PRAGMA') || head.startsWith('WITH') || head.startsWith('EXPLAIN')
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function readPersistedDbFile(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(JEEP_IDB_NAME)
    open.onerror = () => reject(open.error ?? new Error('Could not open IndexedDB.'))
    open.onsuccess = () => {
      const idb = open.result
      if (!idb.objectStoreNames.contains(JEEP_IDB_STORE)) {
        idb.close()
        reject(new Error(`IndexedDB store "${JEEP_IDB_STORE}" not found - has the app persisted anything yet?`))
        return
      }
      const get = idb.transaction(JEEP_IDB_STORE, 'readonly').objectStore(JEEP_IDB_STORE).get(JEEP_IDB_KEY)
      get.onerror = () => {
        idb.close()
        reject(get.error ?? new Error('Could not read the database blob.'))
      }
      get.onsuccess = () => {
        idb.close()
        const value = get.result as Uint8Array | ArrayBuffer | undefined
        if (!value) {
          reject(new Error(`No persisted database "${JEEP_IDB_KEY}" found - run a sync or save something first.`))
          return
        }
        resolve(value instanceof Uint8Array ? value : new Uint8Array(value))
      }
    }
  })
}

export default function DevDbPage() {
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [rowLimit, setRowLimit] = useState<number>(200)
  const [sql, setSql] = useState<string>('')
  const [allowWrites, setAllowWrites] = useState(false)
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadTables = useCallback(async () => {
    const db = await getDb()
    const res = await db.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    setTables(((res.values ?? []) as { name: string }[]).map((r) => r.name))
  }, [])

  useEffect(() => {
    loadTables().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [loadTables])

  async function runSql(statement: string) {
    setError(null)
    setStatus(null)
    setBusy(true)
    try {
      const db = await getDb()
      if (isReadOnlySql(statement)) {
        const started = performance.now()
        const res = await db.query(statement)
        const values = (res.values ?? []) as Row[]
        setColumns(values.length > 0 ? Object.keys(values[0]) : [])
        setRows(values)
        setStatus(`${values.length} row(s) in ${Math.round(performance.now() - started)} ms`)
      } else {
        if (!allowWrites) {
          setError('That statement writes to the database. Tick "Allow writes" to run it.')
          return
        }
        const res = await db.run(statement)
        await persist()
        await loadTables()
        setColumns([])
        setRows([])
        setStatus(`OK - ${res.changes?.changes ?? 0} row(s) changed (persisted).`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function showTable(name: string, limit = rowLimit) {
    setSelectedTable(name)
    const statement = `SELECT * FROM "${name}" LIMIT ${limit}`
    setSql(statement)
    await runSql(statement)
  }

  async function downloadDbFile() {
    setError(null)
    setStatus(null)
    try {
      if (Capacitor.getPlatform() !== 'web') {
        setError('Download .db is web-only. On a device use Utilities > Send diagnostics (JSON export) instead.')
        return
      }
      // Flush the in-memory database first so the blob matches what's on screen.
      await persist()
      const bytes = await readPersistedDbFile()
      // slice() re-backs the view with a plain ArrayBuffer, which is what BlobPart requires.
      const blob = new Blob([bytes.slice()], { type: 'application/x-sqlite3' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${DB_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setStatus(`Downloaded ${(bytes.byteLength / 1024).toFixed(1)} KB.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="warning">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/utilities" />
          </IonButtons>
          <IonTitle>Local DB (dev)</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={downloadDbFile}>Download .db</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonItem>
          <IonSelect
            label="Table"
            placeholder="Pick a table"
            value={selectedTable}
            onIonChange={(e) => void showTable(e.detail.value as string)}
          >
            {tables.map((t) => (
              <IonSelectOption key={t} value={t}>
                {t}
              </IonSelectOption>
            ))}
          </IonSelect>
          <IonSelect
            slot="end"
            label="Limit"
            value={rowLimit}
            onIonChange={(e) => {
              const limit = Number(e.detail.value)
              setRowLimit(limit)
              if (selectedTable) void showTable(selectedTable, limit)
            }}
          >
            {ROW_LIMIT_OPTIONS.map((n) => (
              <IonSelectOption key={n} value={n}>
                {n}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>

        <IonItem lines="none">
          <IonTextarea
            label="SQL"
            labelPlacement="stacked"
            autoGrow
            rows={3}
            value={sql}
            placeholder="SELECT * FROM app_meta"
            onIonInput={(e) => setSql(e.detail.value ?? '')}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </IonItem>
        <IonItem lines="none">
          <IonButton onClick={() => void runSql(sql)} disabled={busy || sql.trim() === ''}>
            Run
          </IonButton>
          <IonButton fill="clear" onClick={() => void loadTables()} disabled={busy}>
            Refresh tables
          </IonButton>
          <IonCheckbox
            slot="end"
            checked={allowWrites}
            onIonChange={(e) => setAllowWrites(e.detail.checked)}
            labelPlacement="start"
          >
            Allow writes
          </IonCheckbox>
        </IonItem>

        {status && (
          <IonNote className="ion-padding-start" color="medium">
            {status}
          </IonNote>
        )}
        {error && (
          <IonText color="danger">
            <p className="ion-padding-start">{error}</p>
          </IonText>
        )}

        {columns.length > 0 && (
          <div style={{ overflowX: 'auto', padding: '0 8px 16px' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      style={{
                        position: 'sticky',
                        top: 0,
                        textAlign: 'left',
                        padding: '4px 8px',
                        borderBottom: '1px solid var(--ion-color-medium)',
                        background: 'var(--ion-background-color)',
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 ? 'var(--ion-color-light)' : undefined }}>
                    {columns.map((c) => (
                      <td
                        key={c}
                        title={formatCell(row[c])}
                        style={{
                          padding: '2px 8px',
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: row[c] === null ? 'var(--ion-color-medium)' : undefined,
                        }}
                      >
                        {formatCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <IonLabel className="ion-padding" color="medium">
          <p>
            Reads hit the live in-memory connection (unsaved state included). &quot;Download .db&quot;
            persists first, then pulls the SQLite file out of IndexedDB ({JEEP_IDB_NAME} /{' '}
            {JEEP_IDB_STORE} / {JEEP_IDB_KEY}) - open it in DB Browser for SQLite or the VS Code
            SQLite Viewer.
          </p>
        </IonLabel>
      </IonContent>
    </IonPage>
  )
}
