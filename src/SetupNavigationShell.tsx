import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

export function SetupNavigationShell({
  backLabel,
  onBack,
  headerAction,
  children,
  className = "",
  contentClassName = "",
}: {
  backLabel: string;
  onBack: () => void;
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
        {headerAction ?? <span aria-hidden="true">GOD CHESS</span>}
      </header>
      <section className={`setup-navigation-content ${contentClassName}`.trim()}>
        {children}
      </section>
    </main>
  );
}
