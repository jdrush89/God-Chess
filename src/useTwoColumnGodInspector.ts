import { useCallback, useEffect, useState } from "react";

export const TWO_COLUMN_GOD_PICKER_QUERY =
  "(min-width: 641px) and (max-width: 960px)";

export function useTwoColumnGodInspector(focusElementId: string) {
  const [twoColumnLayout, setTwoColumnLayout] = useState(() =>
    window.matchMedia(TWO_COLUMN_GOD_PICKER_QUERY).matches
  );
  const [inspectorDialogOpen, setInspectorDialogOpen] = useState(false);

  const dismissInspector = useCallback(() => {
    setInspectorDialogOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById(focusElementId)?.focus();
    });
  }, [focusElementId]);

  useEffect(() => {
    const media = window.matchMedia(TWO_COLUMN_GOD_PICKER_QUERY);
    const updateLayout = () => setTwoColumnLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!twoColumnLayout) setInspectorDialogOpen(false);
  }, [twoColumnLayout]);

  useEffect(() => {
    if (!twoColumnLayout || !inspectorDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissInspector();
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [dismissInspector, inspectorDialogOpen, twoColumnLayout]);

  const openInspector = useCallback(() => {
    if (twoColumnLayout) setInspectorDialogOpen(true);
  }, [twoColumnLayout]);

  return {
    dismissInspector,
    inspectorDialogOpen,
    openInspector,
    twoColumnLayout,
  };
}
