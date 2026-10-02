import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

export function SetupNavigationShell({
  backLabel,
  onBack,
  children,
  contentClassName = "",
}: {
  backLabel: string;
  onBack: () => void;
  children: React.ReactNode;
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
    <main className="setup-navigation-shell">
      <header className="setup-navigation-header">
        <button
          className="setup-navigation-back"
          onClick={onBack}
          aria-label={backLabel}
        >
          <ArrowLeft size={18} />
          <span>{backLabel}</span>
        </button>
        <span aria-hidden="true">GOD CHESS</span>
      </header>
      <section className={`setup-navigation-content ${contentClassName}`.trim()}>
        {children}
      </section>
    </main>
  );
}
