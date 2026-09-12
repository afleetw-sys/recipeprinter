# Failed-import capture retention

When an import fails we keep the input that failed, so the failure is
reproducible instead of being a PostHog event with no way to see what the cook
saw. Two places, for two reasons (see `lib/failedImportCapture.ts`):

- **Firestore `debugInbox`** — one row per failure. The thing you actually read.
- **Storage `recipeprinter/debug/failed-imports/…`** — image bytes only, because
  bytes are the one thing a Firestore document cannot hold.

Neither expires. That is settled for the rows and deferred for the bytes, and
the two are not the same decision.

## The rows expire by hand, and must not expire on a clock

`debugInbox` is a to-do list. Rows are read one at a time and deleted once the
bug behind them is fixed, so the rows still sitting there are precisely the ones
that have NOT been dealt with.

Any time-based expiry therefore deletes unreviewed work and spares only what was
already handled — exactly backwards. **Do not enable a Firestore TTL policy on
this collection.** Manual deletion is the retention policy, and it is a better
one than a clock: it removes a row at the moment the row stops being useful.

An earlier draft of this file recommended a 30-day TTL on `debugInbox.expiresAt`
and the app briefly wrote that field. Both are gone. A field promising an expiry
that nothing enforces is worse than no field, because the person reading these
rows would reasonably believe it.

`firestore.rules` still *tolerates* an `expiresAt`, typed as a timestamp, and
nothing sends one. That door is left open because rules and the app deploy
separately and rules have to go first — so if a very long backstop is ever
wanted, it is a one-line app change rather than a two-stage rollout. If that day
comes it must key on `expiresAt` and never on `createdAt`: CookPilot shares this
collection and writes `createdAt` too, and a TTL policy ignores any document
lacking its field, so `expiresAt` reaps only ours.

## The image bytes are a known leak, left alone for now

Deleting a row does not delete the photographs it points at. Nothing follows
`imagePath` for you, so every reviewed-and-deleted row leaves its bytes in
Storage permanently. The manual workflow cleans up the cheap half and orphans
the expensive one.

**Decided 2026-09-11: leave them.** No lifecycle rule, no sweep script. Storage
under this prefix keeps growing — more slowly than before, because of the
write-side cuts below, but it does keep growing.

The options if it ever becomes worth doing, roughly in order of fit:

1. **Sweep orphans.** Delete a folder only once no `debugInbox` row points at
   it — which is exactly "you have dealt with this". Nothing still in the queue
   ever loses its photographs, at any age. Needs a grace period so it cannot
   race a capture that uploaded bytes before filing its row.
2. **Orphan sweep plus a long age backstop**, to catch folders whose row was
   never written at all.
3. **A flat age rule** on the prefix. Simplest, and the worst fit: past the
   window it deletes the photographs for rows still in the queue, leaving a bug
   report that can no longer be reproduced.

Two things to know before running any of them. A GCS lifecycle rule applies its
age condition from each object's creation time, so its **first pass sweeps the
entire existing backlog at once** — it is retroactive and there is no preview.
And `gcloud storage buckets update --lifecycle-file` *replaces* the bucket's
whole lifecycle configuration, so read the current one first and merge:

```bash
gcloud storage buckets describe gs://cookpilot-bbecb.firebasestorage.app --format="value(lifecycle)"
```

Any rule must be prefix-scoped to `recipeprinter/debug/failed-imports/` (and the
pre-namespace `debug/failed-imports/`). At bucket scope it would delete saved
cookbook photographs — `cookpilot-bbecb` is shared, and `firebase.json` lists
two buckets, so check which actually holds the objects.

## What the app does instead: writes less

Shipped, no action needed, and none of it deletes anything.

- **Photographs are not uploaded for `rate_limited`, `backend_unavailable` or
  `timeout`.** The parser was busy, unreachable or slow; the cook's photo had
  nothing to do with it, and several megabytes cannot say anything the row does
  not. Rows for these failures now arrive with `imageCount: 0` and a null
  `imagePath` — expected, not a capture that went missing.
- **A browser uploads at most `MAX_IMAGE_CAPTURES_PER_DAY` photo captures a
  day.** Not sampling: the first several are kept whole and the row is always
  written. It stops one failure being uploaded over and over, which is a real
  shape — an undecodable photo fails identically every time it is picked, and
  trying again is the honest response to a failed import.

Both gates run before Firebase is loaded, so a capture that is not going to
happen does not pull the Storage SDK to find out.

If either ever costs you a reproduction you wanted, the category list and the
daily number are single constants in `lib/failedImportCapture.ts`.
