# Voice and Tone

How Travel Life talks. It applies to every string a user can read: web, the Android app, and the backend messages that reach the screen. The existing touchstone is the mobile Today screen: "Nothing else scheduled. Enjoy the free time."

The voice is a **warm, calm, competent travel companion**. It knows the plan, tells you plainly what is going on, and does not make a fuss. For the strings that need changing today, see the [Copy Audit](COPY_AUDIT.md). For visual style, see the [Style Guide](../architecture/STYLE_GUIDE.md).

## Principles

1. **Plain words.** Short sentences, everyday vocabulary. "Couldn't save" beats "Failed to persist changes".
2. **Calm in errors.** Say what happened and what to do next. Never blame the user, never shout, never apologise at length. One short sentence for each.
3. **Warmth, lightly.** A friendly line is welcome in quiet moments (empty states, a finished day, a saved trip). No jokes when something is lost, late, expensive or about to be deleted: lost documents, failed payments, deleting things, medical and emergency details.
4. **Travel vocabulary where it is natural.** trip, day, stop, leg, stay, place, plan. Use it where it fits; never force it ("Let's get this adventure rolling!").
5. **Second person.** "You", "your trip". The app says "we" only for things the service does ("We couldn't load this").
6. **Sentence case** for headings, buttons, tabs, toasts and dialog titles: "Delete stay", not "Delete Stay".
7. **Exclamation marks only for real celebrations** (a trip finished, a milestone). Never on routine success or errors.
8. **Never**: "Oops", "Uh oh", "Whoops", "Please" as padding, "successfully", "Are you sure?", "Something went wrong" with nothing else, "No items found", or "an error occurred".
9. **Contractions are fine** ("couldn't", "you're"). Use the real ellipsis `…` for in-progress text, and avoid em dashes in UI strings.
10. **Name the thing.** "Delete Lisbon trip", not "Delete item". Use the user's own title when you have it.

## Patterns

### Empty states

A headline that says what is empty, one line that says what to do, and a button that names the action. Skip marketing prose.

| Before | After |
| ------ | ----- |
| "Where Will You Stay?" / "From boutique hotels and cozy Airbnbs to camping under the stars - add your accommodations..." / "Add Lodging" | "No stays yet" / "Add a hotel, rental or campsite to keep your booking details in one place." / "Add stay" |
| "No results found" | "Nothing matches “lisb”. Try a different spelling." |

A day with nothing in it is the place for warmth: "Nothing planned today. Enjoy the free time."

### Loading

Name what is loading, with a real ellipsis. No jokes, no spinner-only screens longer than a moment.

| Before | After |
| ------ | ----- |
| "Loading..." | "Loading your trip…" |
| "Loading unscheduled items..." | "Loading unscheduled items…" |

### Errors

Format: **what happened** + **what to do**. Say "couldn't", not "failed".

| Kind | Before | After |
| ---- | ------ | ----- |
| Network | "Failed to save budget" | "Can't reach the server. Check your connection and try again." |
| Validation | "Please enter a username" | "Enter a username." Put field problems next to the field and say what is needed: "Currency needs a three-letter code, like EUR." |
| Permission | "Access denied" | "You can view this trip but not edit it. Ask the owner for edit access." |
| Not found | "Trip not found" | "We can't find that trip. It may have been deleted." |
| Offline | "Network request failed" | "You're offline. This will save when you reconnect." |
| Unknown | "Something went wrong" | "Couldn't finish that. Try again, and reload the page if it keeps happening." |

When the cause is known, use it ("That pairing code has expired. Create a new one in Settings."). Don't show raw exception text.

### Destructive confirmations

The title names the action and the thing. The message states the consequence in one sentence, including what stays. The button repeats the action. Cancel is "Cancel", or "Keep editing" for unsaved changes. No humour.

| Before | After |
| ------ | ----- |
| "Delete Lodging" / "Are you sure you want to delete this lodging? This action cannot be undone." / **OK** | "Delete stay?" / "“Hotel Alfama” and its booking details are removed from the trip. You can't undo this." / **Delete stay** |
| "Are you sure you want to delete 12 photos?" | "Delete 12 photos? They're removed from the trip, albums and map." / **Delete 12 photos** |
| `window.confirm("You have unsaved changes. Are you sure you want to close?")` | "Discard unsaved changes?" / "Your edits to this form will be lost." / **Discard changes**, **Keep editing** |

Prefer undo to confirmation for small deletions (the `toastWithUndo` helper), and say plainly when it can't be undone.

### Success toasts

Short, past tense, say what happened. No "successfully", no "!".

| Before | After |
| ------ | ----- |
| "Activity added successfully!" | "Activity added" |
| "Successfully removed 3 photo(s) from album" | "Removed 3 photos from the album" |
| "Login successful!" | (no toast; the dashboard appearing is enough) |

Include the thing when it helps: "Added to Thursday", "Copied the share link".

### Offline and sync

Reassure first (nothing is lost), then say what happens next. Never alarm.

| Before | After |
| ------ | ----- |
| "Sync failed" | "Couldn't sync. Your changes are saved on this phone and upload when it works." |
| "Changes will sync when you reconnect" | "Changes are saved on this device and sync when you're back online." |
| "Rejected by the server" | "Couldn't be saved" with the reason underneath |

A conflict is a decision, not an error: "Someone changed this while you were offline. Choose which version to keep."

### Onboarding

Say what the app does and the next single step. No slogans on buttons.

| Before | After |
| ------ | ----- |
| Button "Begin Your Journey" | "Sign in" |
| "Fastest: scan a pairing code" | Fine as is. |
| "Your trip, in your pocket, even with no signal." | Keep. This is the voice. |

### Form helper text

One sentence, what the field is for or the format needed, shown before the user gets it wrong. Not a restatement of the label.

| Before | After |
| ------ | ----- |
| Label "Currency", helper "Please enter the currency" | "Currency the booking was paid in." |
| Placeholder "Enter location" | "Search for a place or paste an address" |
| "Invalid input" | "Use a date like 2027-03-14." |

## Word list

| Use | Avoid |
| --- | ----- |
| trip | itinerary (for the whole thing), journey (for a trip record) |
| stop, place | location, entity, item (when you can say what it is) |
| stay | accommodation, lodging item (in sentences; the tab name is a separate decision) |
| leg, flight, train, drive | transportation item |
| day, today, this week | date record |
| delete (gone for good), remove (taken out, still exists elsewhere) | destroy, erase, purge, discard (except "discard changes") |
| couldn't, can't | failed to, unable to, error |
| Try again | Please try again |
| sign in, sign out | log in, log out, authenticate |
| connection, offline | network error, connectivity |
| saved on this phone, downloaded for offline use | cached, synced to local storage |
| companion | participant |
| Check ...; Choose ...; Add ... | Please check ...; Kindly select ... |
| Done, Saved, Added | Success, Operation completed |
| nothing planned, nothing yet | no data, no items found, empty |

## Checklist before you ship a string

1. Would you say it aloud to a friend holding the phone? If not, simplify.
2. Does it say what happened, and what to do next?
3. Is it sentence case, with no "Please", "successfully", "Oops" or stray "!"?
4. Does the button name the action, and the title name the thing?
5. If the moment is serious (lost, late, paid, deleted), is it free of jokes and cleverness?
6. If a test asserts the old text, did you update it?
