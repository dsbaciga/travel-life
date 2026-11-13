import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import userService, {
  type LinkIngestSettingsResponse,
} from "../services/user.service";
import { useConfirmDialog } from "../hooks/useConfirmDialog";

/**
 * Settings card for saved-link email ingest.
 *
 * Forwarding a link to the ingest mailbox creates a saved link in the inbox.
 * A message is only accepted if its From address is recognised — the account's
 * own email, or one of the extra addresses managed here.
 *
 * The mailbox itself is server-level config (IMAP_USER) and is shown read-only.
 */
export default function LinkIngestSettings() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const [settings, setSettings] = useState<LinkIngestSettingsResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSender, setNewSender] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await userService.getLinkIngestSettings();
        if (active) setSettings(data);
      } catch {
        if (active) toast.error("Failed to load link ingest settings");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const persist = async (senders: string[]) => {
    setSaving(true);
    try {
      const updated = await userService.updateLinkIngestSettings(senders);
      setSettings(updated);
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save trusted senders"
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!settings) return;

    const address = newSender.trim().toLowerCase();
    if (!address) return;

    if (address === settings.accountEmail.toLowerCase()) {
      toast.error("Your account email is always trusted — no need to add it");
      return;
    }
    if (settings.linkIngestSenders.includes(address)) {
      toast.error("That address is already trusted");
      return;
    }

    const ok = await persist([...settings.linkIngestSenders, address]);
    if (ok) {
      setNewSender("");
      toast.success("Trusted sender added");
    }
  };

  const handleRemove = async (address: string) => {
    if (!settings) return;

    const confirmed = await confirm({
      title: "Remove trusted sender?",
      message: `Links forwarded from ${address} will no longer be accepted.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!confirmed) return;

    const ok = await persist(
      settings.linkIngestSenders.filter((entry) => entry !== address)
    );
    if (ok) toast.success("Trusted sender removed");
  };

  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse h-5 w-40 bg-gray-200 dark:bg-dusk-700 rounded" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="text-lg font-display font-semibold text-charcoal dark:text-dusk-100">
          Link Ingest
        </h3>
        <p className="text-sm text-slate dark:text-dusk-400 mt-1">
          Forward a link to the ingest mailbox and it appears in your saved-links
          inbox.
        </p>
      </div>

      {!settings.ingestEnabled ? (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Email ingest is not configured on the server. Set{" "}
            <code className="font-mono text-xs">IMAP_USER</code> and{" "}
            <code className="font-mono text-xs">IMAP_PASSWORD</code> to enable it.
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-parchment dark:bg-navy-900/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate dark:text-dusk-400">
            Forward links to
          </p>
          <p className="font-mono text-sm text-charcoal dark:text-dusk-100 mt-1 break-all">
            {settings.ingestMailbox}
          </p>
        </div>
      )}

      <div>
        <p className="label">Trusted senders</p>
        <p className="text-xs text-slate dark:text-dusk-400 mb-2">
          Mail is only accepted from these addresses. Your account address (
          <span className="font-mono break-all">{settings.accountEmail}</span>) is always
          trusted.
        </p>

        {settings.linkIngestSenders.length > 0 && (
          <ul className="space-y-2 mb-3">
            {settings.linkIngestSenders.map((address) => (
              <li
                key={address}
                className="flex items-center justify-between gap-3 rounded-lg border border-primary-100 dark:border-gold/20 px-3 py-2"
              >
                <span className="font-mono text-sm text-charcoal dark:text-dusk-200 break-all">
                  {address}
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 dark:text-red-400 hover:underline flex-shrink-0"
                  onClick={() => handleRemove(address)}
                  disabled={saving}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            type="email"
            className="input flex-1"
            placeholder="work-address@example.com"
            value={newSender}
            onChange={(e) => setNewSender(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!saving) handleAdd();
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary whitespace-nowrap"
            onClick={handleAdd}
            disabled={saving || !newSender.trim()}
          >
            Add
          </button>
        </div>
      </div>

      <p className="text-xs text-slate dark:text-dusk-400">
        A From address can be forged, so treat the mailbox address itself as the
        real secret and avoid sharing it.
      </p>

      <ConfirmDialogComponent />
    </div>
  );
}
