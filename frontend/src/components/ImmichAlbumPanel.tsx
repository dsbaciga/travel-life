import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import immichService from "../services/immich.service";
import type {
  ImmichAlbum,
  ImmichAlbumSyncResult,
  ImmichAlbumExportResult,
} from "../types/immich";
import type { PhotoAlbum } from "../types/photo";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTimezoneResolver } from "../hooks/useTimezoneResolver";
import { formatDateTimeInTimezone } from "../utils/timezone";

interface ImmichAlbumPanelProps {
  album: PhotoAlbum;
  /** Called after anything that changes the trip album (link, sync, export). */
  onChanged?: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong";
}

function count(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

function describeSync(result: ImmichAlbumSyncResult): string {
  const parts = [
    `${count(result.newlyLinked, "new photo")} linked`,
    `${count(result.addedToAlbum, "photo")} added to this album`,
  ];
  if (result.failed > 0) parts.push(`${result.failed.toLocaleString()} failed`);
  if (result.notInImmichAlbum) {
    parts.push(
      `${count(result.notInImmichAlbum, "photo")} here no longer in the Immich album (left untouched)`
    );
  }
  if (result.capped) parts.push("the Immich album is very large; only the first 5,000 were read");
  return parts.join("; ");
}

function describeExport(result: ImmichAlbumExportResult): string {
  const parts = [
    result.created ? "Created the Immich album" : "Updated the Immich album",
    `${count(result.added, "photo")} added`,
  ];
  if (result.alreadyInAlbum > 0) parts.push(`${result.alreadyInAlbum.toLocaleString()} already there`);
  if (result.failed.length > 0) parts.push(`${result.failed.length.toLocaleString()} failed`);
  if (result.skippedUploaded > 0) {
    parts.push(`${count(result.skippedUploaded, "uploaded photo")} skipped (not uploaded to Immich)`);
  }
  return parts.join("; ");
}

/**
 * Immich section of the album editor: link this trip album to an Immich album,
 * pull new photos from it on demand, and (explicitly, after a confirmation that
 * says what will be written) create or update an album in Immich from it.
 * Nothing here runs on its own; every action is a button.
 */
export default function ImmichAlbumPanel({ album, onChanged }: ImmichAlbumPanelProps) {
  const resolveTz = useTimezoneResolver();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [configured, setConfigured] = useState(false);
  const [immichAlbums, setImmichAlbums] = useState<ImmichAlbum[]>([]);
  const [linkedId, setLinkedId] = useState<string | null>(album.immichAlbumId ?? null);
  const [syncedAt, setSyncedAt] = useState<string | null>(album.immichAlbumSyncedAt ?? null);
  const [chosenId, setChosenId] = useState("");
  const [busy, setBusy] = useState<null | "link" | "sync" | "export">(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // One click, one run: set synchronously, before React re-renders the disabled buttons.
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await immichService.getSettings();
        if (cancelled || !settings.immichConfigured) return;
        setConfigured(true);
        const result = await immichService.getAlbums(false);
        if (!cancelled) setImmichAlbums(result.albums ?? []);
      } catch (error) {
        console.error("[ImmichAlbumPanel] Failed to load Immich albums:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!configured) return null;

  const linkedName = linkedId
    ? immichAlbums.find((a) => a.id === linkedId)?.albumName ?? "Linked Immich album"
    : null;

  const run = async (kind: "link" | "sync" | "export", action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const handleLink = (immichAlbumId: string | null) =>
    run("link", async () => {
      const result = await immichService.setAlbumLink(album.id, immichAlbumId);
      setLinkedId(result.immichAlbumId);
      setSyncedAt(result.immichAlbumSyncedAt);
      setChosenId("");
      onChanged?.();
    });

  const handleSync = () =>
    run("sync", async () => {
      const result = await immichService.syncAlbum(album.id);
      setSyncedAt(result.syncedAt);
      setMessage({ kind: result.failed > 0 ? "error" : "ok", text: describeSync(result) });
      onChanged?.();
    });

  const handleExport = () =>
    run("export", async () => {
      const preview = await immichService.previewAlbumExport(album.id);
      if (preview.immichAssetCount === 0) {
        setMessage({
          kind: "error",
          text: "This album has no photos from Immich to add to an Immich album.",
        });
        return;
      }
      const target = preview.willCreate
        ? `create a new album named "${preview.albumName}" in your Immich library`
        : "add to the Immich album this one is linked to";
      const skipped =
        preview.skippedUploaded > 0
          ? ` ${count(preview.skippedUploaded, "uploaded photo")} will be skipped; photos are never uploaded to Immich.`
          : "";
      const confirmed = await confirm({
        title: preview.willCreate ? "Create album in Immich" : "Update album in Immich",
        message:
          `This will ${target} and add ${count(preview.immichAssetCount, "photo")} to it.` +
          ` Nothing in Immich is deleted or changed, and nothing is removed from any Immich album.` +
          (preview.willCreate ? " This album will also be linked to the new Immich album." : "") +
          skipped,
        confirmLabel: preview.willCreate ? "Create in Immich" : "Add to Immich album",
        variant: "info",
      });
      if (!confirmed) return;

      const result = await immichService.exportAlbum(album.id);
      setLinkedId(result.immichAlbumId);
      setMessage({ kind: result.failed.length > 0 ? "error" : "ok", text: describeExport(result) });
      if (result.failed.length > 0) toast.error("Some photos could not be added to the Immich album");
      onChanged?.();
    });

  const syncedLabel = syncedAt
    ? formatDateTimeInTimezone(syncedAt, resolveTz())
    : null;

  return (
    <div className="border border-gray-200 dark:border-dusk-700 rounded-lg p-3 space-y-3">
      <div className="text-sm font-medium text-gray-700 dark:text-dusk-300">Immich</div>

      {linkedId ? (
        <>
          <p className="text-sm text-gray-600 dark:text-dusk-400">
            Linked to <span className="font-medium">{linkedName}</span>
            {syncedLabel ? ` - last synced ${syncedLabel}` : " - not synced yet"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={busy !== null}
              className="btn btn-secondary"
            >
              {busy === "sync" ? "Syncing..." : "Sync from Immich"}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy !== null}
              className="btn btn-secondary"
            >
              {busy === "export" ? "Working..." : "Update album in Immich..."}
            </button>
            <button
              type="button"
              onClick={() => handleLink(null)}
              disabled={busy !== null}
              className="btn btn-secondary"
            >
              Unlink
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-dusk-400">
            Sync adds photos that are in the Immich album but not here. Photos removed from the
            Immich album are never removed from this trip.
          </p>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <select
              value={chosenId}
              onChange={(e) => setChosenId(e.target.value)}
              aria-label="Immich album to link"
              className="input flex-1"
            >
              <option value="">Choose an Immich album</option>
              {immichAlbums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.albumName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleLink(chosenId)}
              disabled={!chosenId || busy !== null}
              className="btn btn-secondary"
            >
              {busy === "link" ? "Linking..." : "Link"}
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy !== null}
              className="btn btn-secondary"
            >
              {busy === "export" ? "Working..." : "Create album in Immich..."}
            </button>
          </div>
        </>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${
            message.kind === "error"
              ? "text-red-600 dark:text-red-400"
              : "text-green-700 dark:text-green-400"
          }`}
        >
          {message.text}
        </p>
      )}
      <ConfirmDialogComponent />
    </div>
  );
}
