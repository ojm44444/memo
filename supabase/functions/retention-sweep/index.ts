import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Retention. Runs once a day, enforces the two windows the site states.
 *
 *  1. TRASH, 30 DAYS. The privacy page says a deleted song can be restored for
 *     30 days and then goes for good. Until now the only thing enforcing that
 *     was a sweep in trashRepo.ts that runs when the app boots, and it did
 *     half the job: local rows and audio_versions rows went, the cloud songs
 *     row stayed soft deleted forever, and storage was never touched. On
 *     2 Sept production held 21 expired songs, the oldest deleted on 10 June,
 *     11 of them still carrying audio. A window enforced by whether someone
 *     happens to open the app is not a window.
 *
 *  2. CLOUD AUDIO, 90 DAYS AFTER A LAPSE, with warnings on day 60 and day 85.
 *     Only our copy of the audio goes. Titles, notes, lyrics, tags and
 *     comments stay, so signing back in shows the work with the takes empty
 *     rather than an empty board, and a local copy is never touched.
 *
 *     THE DELETION IS GATED ON BOTH WARNINGS HAVING ACTUALLY SENT. The first
 *     build of this did not do that, and it was wrong in a way that only
 *     shows up on the worst day: the warnings go through Resend, Resend is
 *     not configured yet, and a send failure was recorded as an error while
 *     the deletion carried on regardless. Someone would have lost their audio
 *     with no warning at all because our mail was down. The gate reads
 *     email_log, which send-lifecycle-email writes only on a send Resend
 *     accepted (it releases the claim when Resend refuses), so an unsent
 *     warning cannot look like a sent one. Unwarned accounts get warned and
 *     wait; the deletion happens on a later run, once the record exists.
 *
 * WHY THIS IS NOT A pg_cron JOB DOING SQL. Deleting a row out of
 * storage.objects does not delete the file behind it, it orphans it. We would
 * carry on paying for bytes we had told someone were gone, which is both a
 * cost bug and a false statement on a privacy page. Removal has to go through
 * the Storage API, so it happens here.
 *
 * ORDER MATTERS. Files first, rows second, always. If the sweep dies between
 * the two, the next run finds the same rows and retries the removal, and
 * removing an object that is already gone is not an error. Doing it the other
 * way round loses the only record of which files to delete.
 *
 * NOT CALLABLE BY THE BROWSER. Shared secret in a header, same as
 * send-lifecycle-email, for the same reason.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const BUCKET = 'audio'
const LAPSE_DELETE_DAYS = 90
const WARN_FIRST_DAYS = 60
const WARN_LAST_DAYS = 85

/** "14 October 2026". The emails print a date, not a number of days. */
function longDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface LapsedRow {
  user_id: string
  email: string
  display_name: string
  lapsed_on: string
  days_lapsed: number
  cloud_takes: number
  storage_paths: string[]
}

serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('LIFECYCLE_EMAIL_SECRET')

  if (!url || !serviceKey || !secret) {
    return json({ error: 'Retention is not configured' }, 503)
  }

  if (req.headers.get('x-lifecycle-secret') !== secret) {
    return json({ error: 'Forbidden' }, 403)
  }

  /* A dry run reports exactly what a real run would do and changes nothing.
     This is the first thing that deletes customer audio on a schedule, so it
     needs a way to be read before it is trusted. */
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'

  const admin = createClient(url, serviceKey)
  const report = {
    dryRun,
    trash: { songs: 0, objects: 0, objectErrors: [] as string[] },
    lapsed: { warned60: 0, warned85: 0, purged: 0, takesCleared: 0, deferred: 0 },
    errors: [] as string[],
  }

  const sendEmail = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (dryRun) return false
    const res = await fetch(`${url}/functions/v1/send-lifecycle-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lifecycle-secret': secret,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      report.errors.push(`email ${payload.kind}: ${await res.text()}`)
      return false
    }
    return true
  }

  // ── 1. Trash past 30 days ────────────────────────────────────────────────
  try {
    const { data: expired, error } = await admin.rpc('retention_expired_trash', { p_limit: 500 })
    if (error) throw error

    const rows = (expired ?? []) as { song_id: string; storage_paths: string[] }[]
    const paths = rows.flatMap((r) => r.storage_paths ?? [])

    report.trash.songs = rows.length
    report.trash.objects = paths.length

    if (!dryRun && paths.length) {
      /* remove() takes up to 1000 keys; chunked anyway so one long-dead board
         cannot make the whole sweep fail on a request size limit. */
      for (let i = 0; i < paths.length; i += 200) {
        const { error: rmError } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 200))
        if (rmError) report.trash.objectErrors.push(rmError.message)
      }
    }

    /* Rows only after the files are gone, and only if they went. Dropping the
       songs row while an object survived would leave audio we are paying for
       and can no longer find. */
    if (!dryRun && rows.length && report.trash.objectErrors.length === 0) {
      const { error: delError } = await admin
        .from('songs')
        .delete()
        .in('id', rows.map((r) => r.song_id))
      if (delError) throw delError
    }
  } catch (err) {
    report.errors.push(`trash: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── 2. Lapsed accounts ───────────────────────────────────────────────────
  try {
    const { data: lapsed, error } = await admin.rpc('retention_lapsed_accounts')
    if (error) throw error

    const rows = (lapsed ?? []) as LapsedRow[]

    /* What has actually been sent, read once. A row exists here only because
       Resend accepted the message, so this is a record of delivery attempts
       that succeeded, not of intentions. */
    const sent = new Set<string>()
    if (rows.length) {
      const { data: log, error: logError } = await admin
        .from('email_log')
        .select('email, kind, dedupe_key')
        .in('kind', ['audio_expiring_60', 'audio_expiring_85'])
        .in('email', rows.map((r) => r.email))
      if (logError) throw logError
      for (const r of (log ?? []) as { email: string; kind: string; dedupe_key: string | null }[]) {
        sent.add(`${r.email.toLowerCase()}|${r.kind}|${r.dedupe_key ?? ''}`)
      }
    }
    const wasSent = (email: string, kind: string, key: string) =>
      sent.has(`${email.toLowerCase()}|${kind}|${key}`)

    for (const row of rows) {
      const deleteDate = new Date(row.lapsed_on)
      deleteDate.setDate(deleteDate.getDate() + LAPSE_DELETE_DAYS)
      const deleteOn = longDate(deleteDate)

      /* The lapse date is the dedupe key, so a second lapse warns again while
         a re-run of today's sweep does not. */
      const common = {
        email: row.email,
        name: row.display_name,
        userId: row.user_id,
        dedupeKey: row.lapsed_on,
      }

      if (row.days_lapsed >= LAPSE_DELETE_DAYS) {
        /* Both warnings, or nothing happens today. */
        const warned =
          wasSent(row.email, 'audio_expiring_60', row.lapsed_on) &&
          wasSent(row.email, 'audio_expiring_85', row.lapsed_on)

        if (!warned) {
          report.lapsed.deferred++
          report.errors.push(
            `lapsed ${row.user_id}: past day ${LAPSE_DELETE_DAYS} but not warned twice, deletion deferred`,
          )
          /* Send what is missing so the countdown can actually complete.
             Day 85 first: the date in the day 60 copy has already passed. */
          if (!wasSent(row.email, 'audio_expiring_85', row.lapsed_on)) {
            if (await sendEmail({ ...common, kind: 'audio_expiring_85', deleteOn })) {
              report.lapsed.warned85++
            }
          }
          if (!wasSent(row.email, 'audio_expiring_60', row.lapsed_on)) {
            if (await sendEmail({ ...common, kind: 'audio_expiring_60', deleteOn })) {
              report.lapsed.warned60++
            }
          }
          continue
        }

        if (!dryRun) {
          /* Every chunk has to go before the rows are cleared. The first
             version of this `continue`d the CHUNK loop on a failure and then
             cleared storage_path anyway, which is precisely the orphaned-file
             bug this function exists to avoid: the object stays in the bucket,
             billed forever, with nothing left pointing at it. Skip the whole
             user instead and let the next run retry. */
          let removalFailed = false
          for (let i = 0; i < row.storage_paths.length; i += 200) {
            const { error: rmError } = await admin.storage
              .from(BUCKET)
              .remove(row.storage_paths.slice(i, i + 200))
            if (rmError) {
              report.errors.push(`lapsed storage ${row.user_id}: ${rmError.message}`)
              removalFailed = true
              break
            }
          }
          if (removalFailed) continue

          const { data: cleared, error: clearError } = await admin.rpc(
            'retention_clear_cloud_audio',
            { p_user_id: row.user_id },
          )
          if (clearError) {
            report.errors.push(`lapsed clear ${row.user_id}: ${clearError.message}`)
            continue
          }
          report.lapsed.takesCleared += (cleared as number) ?? 0
          await sendEmail({ ...common, kind: 'audio_deleted' })
        }
        report.lapsed.purged++
        continue
      }

      /* Day 85 first: someone whose day 60 email failed, or who lapsed while
         the sweep was not running, should get the urgent one rather than a
         warning about a date that has nearly passed. The log makes both safe
         to attempt. */
      if (row.days_lapsed >= WARN_LAST_DAYS) {
        if (await sendEmail({ ...common, kind: 'audio_expiring_85', deleteOn })) {
          report.lapsed.warned85++
        }
      } else if (row.days_lapsed >= WARN_FIRST_DAYS) {
        if (await sendEmail({ ...common, kind: 'audio_expiring_60', deleteOn })) {
          report.lapsed.warned60++
        }
      }
    }
  } catch (err) {
    report.errors.push(`lapsed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return json(report, report.errors.length ? 207 : 200)
})
