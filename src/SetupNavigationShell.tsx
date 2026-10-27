import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

export function SetupNavigationShell({
  backLabel,
  onBack,
  headerTitle,
  headerAction,
  children,
  className = "",
  contentClassName = "",
}: {
  backLabel: string;
  onBack: () => void;
  headerTitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <main className={`setup-navigation-shell ${className}`.trim()}>
      <header className="setup-navigation-header">
        <button
          className="setup-navigation-back"
          onClick={onBack}
          aria-label={backLabel}
        >
          <ArrowLeft size={18} />
          <span>{backLabel}</span>
        </button>
        {headerTitle && (
          <span className="setup-navigation-title">{headerTitle}</span>
        )}
        {headerAction ?? (
          <span className="setup-navigation-brand" aria-hidden="true">GOD CHESS</span>
        )}
      </header>
      <section className={`setup-navigation-content ${contentClassName}`.trim()}>
        {children}
      </section>
    </main>
  );
}
