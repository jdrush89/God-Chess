import { Bug, Copy, LogOut, Menu, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDebugReport,
  diagnosticsStatus,
  recordDiagnostic,
} from "./diagnostics";

interface MatchEscapeMenuProps {
  onOpenSettings?: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
}

const focusableSelector = [
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function MatchEscapeMenu({
  onOpenSettings,
  onLeave,
  leaveLabel = "Leave match",
}: MatchEscapeMenuProps) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copying" | "copied" | "fallback" | "failed"
  >("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const reportButtonRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const copyOperationRef = useRef(0);
  const report = useMemo(
    () => reportOpen ? buildDebugReport(description) : "",
    [description, reportOpen],
  );

  const resetCopyStatus = () => {
    copyOperationRef.current += 1;
    setCopyStatus("idle");
  };
  const close = () => {
    setOpen(false);
    setReportOpen(false);
    resetCopyStatus();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const openMenu = () => {
    setOpen(true);
    recordDiagnostic({ category: "ui", event: "escape-menu-opened" });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reportOpen) {
        event.preventDefault();
        setReportOpen(false);
        resetCopyStatus();
        window.setTimeout(() => reportButtonRef.current?.focus(), 0);
        return;
      }
      if (open) {
        event.preventDefault();
        close();
        return;
      }
      const blockingModal = [...document.querySelectorAll<HTMLElement>(
        ".modal-backdrop, [role='dialog'], .history-drawer",
      )].some((element) =>
        !element.matches(".four-online-pause, .three-online-pause")
      );
      if (blockingModal) return;
      event.preventDefault();
      openMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, reportOpen]);

  useEffect(() => {
    if (!open) return;
    const focusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
    focusable?.focus();
  }, [open, reportOpen]);

  useEffect(() => {
    if (copyStatus !== "fallback" && copyStatus !== "failed") return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [copyStatus]);

  const trapFocus = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      focusableSelector,
    ) ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copyReport = async () => {
    const operation = copyOperationRef.current + 1;
    copyOperationRef.current = operation;
    setCopyStatus("copying");
    try {
      const clipboard = navigator.clipboard;
      if (typeof clipboard?.writeText !== "function") {
        if (copyOperationRef.current !== operation) return;
        setCopyStatus("fallback");
        return;
      }
      await clipboard.writeText(report);
      if (copyOperationRef.current !== operation) return;
      setCopyStatus("copied");
      recordDiagnostic({ category: "ui", event: "debug-report-copied" });
    } catch (error) {
      if (copyOperationRef.current !== operation) return;
      setCopyStatus("failed");
      recordDiagnostic({
        category: "error",
        event: "debug-report-copy-failed",
        data: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  };

  return (
    <>
      <button
        className="escape-menu-trigger"
        data-placement="top-right"
        onClick={openMenu}
        aria-label="Open match menu"
        ref={triggerRef}
      >
        <Menu size={17} />
        <span>Menu</span>
      </button>
      {open && (
        <div className="escape-menu-backdrop">
          <section
            className="escape-menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="escape-menu-title"
            onKeyDown={trapFocus}
            ref={dialogRef}
          >
            {!reportOpen ? (
              <>
                <button className="close-button" onClick={close} aria-label="Close match menu">
                  <X size={20} />
                </button>
                <p className="eyebrow">MATCH MENU</p>
                <h2 id="escape-menu-title">Game paused locally</h2>
                <p>Opening this menu does not change the match or cancel the current action.</p>
                <div className="escape-menu-actions">
                  <button className="primary-button" onClick={close}>Resume</button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setReportOpen(true);
                      resetCopyStatus();
                    }}
                    ref={reportButtonRef}
                  >
                    <Bug size={16} /> Report bug
                  </button>
                  {onOpenSettings && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        close();
                        onOpenSettings();
                      }}
                    >
                      <Settings size={16} /> Settings
                    </button>
                  )}
                  {onLeave && (
                    <button
                      className="danger-button"
                      onClick={() => {
                        close();
                        onLeave();
                      }}
                    >
                      <LogOut size={16} /> {leaveLabel}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  className="close-button"
                  onClick={() => {
                    setReportOpen(false);
                    resetCopyStatus();
                  }}
                  aria-label="Back to match menu"
                >
                  <X size={20} />
                </button>
                <p className="eyebrow">REPORT BUG</p>
                <h2 id="escape-menu-title">Copy a safe debug report</h2>
                <label className="bug-description">
                  <span>What happened? <small>Optional</small></span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={2_000}
                    placeholder="Describe what you clicked and where the match stopped."
                  />
                </label>
                <div className="debug-report-preview" aria-label="Sanitized debug report preview">
                  <pre>{report}</pre>
                </div>
                {diagnosticsStatus().storageError && (
                  <p className="debug-report-feedback" role="alert">
                    Session log storage failed: {diagnosticsStatus().storageError}
                  </p>
                )}
                <button className="primary-button copy-report-button" onClick={() => void copyReport()}>
                  <Copy size={16} /> Copy debug report
                </button>
                {copyStatus === "copying" && (
                  <p className="debug-report-feedback" role="status">Copying debug report...</p>
                )}
                {copyStatus === "copied" && (
                  <p className="debug-report-feedback" role="status">Debug report copied.</p>
                )}
                {(copyStatus === "fallback" || copyStatus === "failed") && (
                  <>
                    <p className="debug-report-feedback" role={copyStatus === "failed" ? "alert" : "status"}>
                      {copyStatus === "failed"
                        ? "Clipboard access failed. Select and copy the report below."
                        : "Clipboard access is unavailable. Select and copy the report below."}
                    </p>
                    <textarea
                      className="debug-report-fallback"
                      value={report}
                      readOnly
                      aria-label="Selectable debug report"
                      ref={fallbackRef}
                    />
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
