/* eslint-disable no-undef */
/**
 * Background sync heartbeat - runs in Capacitor Background Runner's own JS
 * runtime (Android: WorkManager, iOS: BGAppRefresh), NOT in the app's
 * WebView. Only `fetch`, `CapacitorKV` and `CapacitorNotifications` exist
 * here: no SQLite, no app modules, no DOM. Plain ES2017 JavaScript, no
 * imports. Configured in capacitor.config.ts (plugins.BackgroundRunner).
 *
 * Contract with src/sync/backgroundSync.ts:
 *   saveState      - app hands over auth / schedule / outbox / stamps.
 *   syncHeartbeat  - the scheduled run (also dispatched by the app for QA).
 *   readState      - app collects confirmations + last result, which are
 *                    then cleared.
 */

var KEY_STATE = 'sync.state' // { auth, schedule, outbox, stamps, serverSyncDateTime, lastSyncAt, savedAt }
var KEY_CONFIRM = 'sync.confirmations' // { confirmations, stamps }
var KEY_RESULT = 'sync.lastResult' // BackgroundSyncResult
var KEY_LAST_RUN = 'sync.lastRunAt' // ISO
var NOTIFICATION_ID = 4711

function readJson(key) {
  try {
    var v = CapacitorKV.get(key)
    return v && v.value ? JSON.parse(v.value) : null
  } catch (e) {
    return null
  }
}

function writeJson(key, obj) {
  if (obj === null || obj === undefined) {
    try {
      CapacitorKV.remove(key)
    } catch (e) {}
    return
  }
  CapacitorKV.set(key, JSON.stringify(obj))
}

// --- schedule helpers (mirror src/sync/syncSettings.ts) ---------------------

function minutesOf(hhmm) {
  var p = String(hhmm || '00:00').split(':')
  return Number(p[0]) * 60 + Number(p[1] || 0)
}

function withinWorkingHours(schedule, now) {
  var isoDay = ((now.getDay() + 6) % 7) + 1
  if (!schedule.workDays || schedule.workDays.indexOf(isoDay) === -1) return false
  var minutes = now.getHours() * 60 + now.getMinutes()
  var start = minutesOf(schedule.workStart)
  var end = minutesOf(schedule.workEnd)
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

function isDue(schedule, lastRunIso, now) {
  if (!lastRunIso) return true
  var last = new Date(lastRunIso).getTime()
  if (isNaN(last)) return true
  // A little slack so a 20-min interval on a 15/20-min OS cadence never skips a beat.
  return now.getTime() - last >= (schedule.intervalMinutes - 2) * 60000
}

function hhmm(d) {
  var h = String(d.getHours())
  var m = String(d.getMinutes())
  return (h.length < 2 ? '0' + h : h) + ':' + (m.length < 2 ? '0' + m : m)
}

function notify(title, body) {
  try {
    CapacitorNotifications.schedule([
      {
        id: NOTIFICATION_ID,
        title: title,
        body: body,
        scheduleAt: new Date(Date.now() + 1000),
      },
    ])
  } catch (e) {
    console.log('[sync-runner] notify failed: ' + e)
  }
}

function saveResult(result) {
  writeJson(KEY_RESULT, result)
  return result
}

// --- events ------------------------------------------------------------------

addEventListener('saveState', function (resolve, reject, args) {
  try {
    writeJson(KEY_STATE, args || {})
    resolve({ ok: true })
  } catch (e) {
    reject(String(e))
  }
})

addEventListener('readState', function (resolve, reject) {
  try {
    var confirm = readJson(KEY_CONFIRM)
    var result = readJson(KEY_RESULT)
    writeJson(KEY_CONFIRM, null)
    resolve({
      confirmations: confirm ? confirm.confirmations : null,
      stamps: confirm ? confirm.stamps : null,
      lastResult: result,
    })
  } catch (e) {
    reject(String(e))
  }
})

addEventListener('syncHeartbeat', function (resolve, reject, args) {
  var force = !!(args && args.force)
  var now = new Date()
  var state = readJson(KEY_STATE)

  function finish(result) {
    resolve(saveResult(result))
  }

  if (!state || !state.auth || !state.auth.token) {
    finish({ at: now.toISOString(), ok: false, skipped: 'no-auth', message: 'Not signed in.' })
    return
  }

  var schedule = state.schedule || { enabled: true, intervalMinutes: 20, workStart: '08:00', workEnd: '18:00', workDays: [1, 2, 3, 4, 5] }
  if (!force) {
    if (!schedule.enabled) {
      finish({ at: now.toISOString(), ok: true, skipped: 'disabled', message: 'Automatic sync is off.' })
      return
    }
    if (!withinWorkingHours(schedule, now)) {
      finish({ at: now.toISOString(), ok: true, skipped: 'outside-hours', message: 'Outside working hours.' })
      return
    }
    var lastRun = readJson(KEY_LAST_RUN)
    if (!isDue(schedule, lastRun, now)) {
      // Not a "result" the app should show - keep the previous one.
      resolve({ at: now.toISOString(), ok: true, skipped: 'not-due', message: 'Not due yet.' })
      return
    }
  }
  writeJson(KEY_LAST_RUN, now.toISOString())

  var base = String(state.auth.baseUrl || '').replace(/\/+$/, '')
  var code = encodeURIComponent(state.auth.code || '')
  var headers = { Authorization: 'Bearer ' + state.auth.token, 'Content-Type': 'application/json', Accept: 'application/json' }

  var pushed = 0
  var problems = []

  // 1. Push the outbox, if any.
  var pushPromise = Promise.resolve()
  if (state.outbox) {
    pushPromise = fetch(base + '/api/MobileV2/SyncV2/SyncUp?code=' + code, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(state.outbox),
    })
      .then(function (res) {
        if (res.status === 401) throw new Error('Session expired - open the app and sign in.')
        if (!res.ok) throw new Error('Server returned ' + res.status)
        return res.json()
      })
      .then(function (body) {
        if (!body || !body.HasData || !body.Data) throw new Error((body && body.FailMessage) || 'Push not accepted.')
        var d = body.Data
        var confirmations = {
          serviceRecord: (d.ServiceRecord && d.ServiceRecord.Confirmed) || [],
          employeeTime: (d.EmployeeTime && d.EmployeeTime.Confirmed) || [],
          liveSync: (d.LiveSync && d.LiveSync.Confirmed) || [],
        }
        pushed = confirmations.serviceRecord.length + confirmations.employeeTime.length + confirmations.liveSync.length
        // Merge with confirmations the app hasn't collected yet.
        var existing = readJson(KEY_CONFIRM)
        if (existing && existing.confirmations) {
          confirmations.serviceRecord = existing.confirmations.serviceRecord.concat(confirmations.serviceRecord)
          confirmations.employeeTime = existing.confirmations.employeeTime.concat(confirmations.employeeTime)
          confirmations.liveSync = existing.confirmations.liveSync.concat(confirmations.liveSync)
        }
        writeJson(KEY_CONFIRM, { confirmations: confirmations, stamps: state.stamps })
        // Don't push the same outbox twice.
        state.outbox = null
        writeJson(KEY_STATE, state)
      })
      .catch(function (e) {
        problems.push('Push failed: ' + (e && e.message ? e.message : e))
      })
  }

  // 2. Anything new on the server?
  var newJobs = 0
  var updatedJobs = 0
  pushPromise
    .then(function () {
      var since = state.serverSyncDateTime ? '&since=' + encodeURIComponent(state.serverSyncDateTime) : ''
      return fetch(base + '/api/MobileV2/SyncV2/Changes?code=' + code + since, { method: 'GET', headers: headers })
    })
    .then(function (res) {
      if (res.status === 401) throw new Error('Session expired - open the app and sign in.')
      if (!res.ok) throw new Error('Server returned ' + res.status)
      return res.json()
    })
    .then(function (body) {
      if (!body || !body.HasData || !body.Data) throw new Error((body && body.FailMessage) || 'Could not check for changes.')
      newJobs = body.Data.NewJobs || 0
      updatedJobs = body.Data.UpdatedJobs || 0
    })
    .catch(function (e) {
      problems.push('Check failed: ' + (e && e.message ? e.message : e))
    })
    .then(function () {
      var ok = problems.length === 0
      var when = hhmm(now)
      var parts = []
      if (pushed > 0) parts.push(pushed + ' item' + (pushed === 1 ? '' : 's') + ' sent')
      if (newJobs > 0) parts.push(newJobs + ' new job' + (newJobs === 1 ? '' : 's'))
      if (updatedJobs > 0) parts.push(updatedJobs + ' updated')
      var summary = parts.length > 0 ? parts.join(' · ') : 'Up to date'

      var result = {
        at: now.toISOString(),
        ok: ok,
        message: ok ? summary : problems.join(' '),
        newJobs: newJobs,
        updatedJobs: updatedJobs,
        pushed: pushed,
      }

      // Notify on failure always; on success only when something happened -
      // a silent "up to date" every 20 minutes would just be noise.
      if (!ok) {
        notify('Sync failed ' + when, problems.join(' ') + ' Will retry.')
      } else if (parts.length > 0) {
        notify('Synced ' + when, summary + (newJobs + updatedJobs > 0 ? ' - open the app to see them.' : ''))
      }

      finish(result)
    })
})
