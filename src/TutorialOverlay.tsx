import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

export type TutorialStep = {
  title: string;
  body: string;
  target?: string;
  cardSide?: "left" | "right";
};

export function TutorialOverlay({
  steps,
  onExit,
  onComplete = onExit,
  completeLabel = "Finish tutorial",
}: {
  steps: TutorialStep[];
  onExit: () => void;
  onComplete?: () => void;
  completeLabel?: string;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect>();
  const dialogRef = useRef<HTMLElement>(null);
  const step = steps[stepIndex];
  const finalStep = stepIndex === steps.length - 1;

  useLayoutEffect(() => {
    const updateTarget = () => {
      const target = step.target
        ? document.querySelector<HTMLElement>(`[data-tutorial="${step.target}"]`)
        : undefined;
      setTargetRect(target?.getBoundingClientRect());
    };
    const target = step.target
      ? document.querySelector<HTMLElement>(`[data-tutorial="${step.target}"]`)
      : undefined;
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", inline: "nearest" });
    }
    const frame = window.requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [step.target]);

  useEffect(() => {
    const game = document.querySelector<HTMLElement>(".tutorial-stage .game-page");
    const previousInert = game?.hasAttribute("inert");
    game?.setAttribute("inert", "");
    dialogRef.current?.focus();
    return () => {
      if (!previousInert) game?.removeAttribute("inert");
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (finalStep) onComplete();
        else setStepIndex((current) => current + 1);
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        event.preventDefault();
        setStepIndex((current) => current - 1);
      } else if (event.key === "Tab") {
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finalStep, onComplete, onExit, stepIndex]);

  const highlightStyle = targetRect
    ? {
      top: Math.max(8, targetRect.top - 6),
      left: Math.max(8, targetRect.left - 6),
      width: Math.min(window.innerWidth - 16, targetRect.width + 12),
      height: Math.min(window.innerHeight - 16, targetRect.height + 12),
    }
    : undefined;

  return (
    <div
      className={`tutorial-overlay ${targetRect ? "has-target" : "centered"}`}
      data-tutorial-step={stepIndex + 1}
      data-tutorial-highlight={step.target}
    >
      {targetRect && (
        <div
          className="tutorial-highlight"
          style={highlightStyle}
          aria-hidden="true"
        />
      )}
      {!targetRect && <div className="tutorial-full-scrim" aria-hidden="true" />}
      <section
        className={`tutorial-card side-${step.cardSide ?? "right"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-description"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button
          className="tutorial-close"
          onClick={onExit}
          aria-label="Exit tutorial"
        >
          <X size={18} />
        </button>
        <p className="eyebrow">GOD CHESS TUTORIAL</p>
        <span className="tutorial-progress">
          STEP {stepIndex + 1} OF {steps.length}
        </span>
        <h2 id="tutorial-title">{step.title}</h2>
        <p id="tutorial-description">{step.body}</p>
        <div className="tutorial-dots" aria-hidden="true">
          {steps.map((_, index) => (
            <i className={index === stepIndex ? "active" : ""} key={index} />
          ))}
        </div>
        <div className="tutorial-actions">
          <button
            className="tutorial-back"
            onClick={() => setStepIndex((current) => current - 1)}
            disabled={stepIndex === 0}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <button
            className="primary-button"
            onClick={() => {
              if (finalStep) onComplete();
              else setStepIndex((current) => current + 1);
            }}
          >
            {finalStep ? completeLabel : "Next"}
            {!finalStep && <ArrowRight size={16} />}
          </button>
        </div>
        {!finalStep && (
          <button className="tutorial-skip" onClick={onExit}>
            Skip tutorial
          </button>
        )}
      </section>
    </div>
  );
}

export type TutorialPracticePrompt = {
  title: string;
  body: string;
  instruction?: string;
  targetSelector?: string;
  targetName?: string;
  cardSide?: "left" | "right";
  blocking?: boolean;
  complete?: boolean;
};

export function TutorialPracticeOverlay({
  prompt,
  step,
  totalSteps,
  feedback,
  onExit,
}: {
  prompt: TutorialPracticePrompt;
  step: number;
  totalSteps: number;
  feedback?: string;
  onExit: () => void;
}) {
  const [targetRect, setTargetRect] = useState<DOMRect>();

  useLayoutEffect(() => {
    const updateTarget = () => {
      const target = prompt.targetSelector
        ? document.querySelector<HTMLElement>(prompt.targetSelector)
        : undefined;
      setTargetRect(target?.getBoundingClientRect());
    };
    const target = prompt.targetSelector
      ? document.querySelector<HTMLElement>(prompt.targetSelector)
      : undefined;
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", inline: "nearest" });
    }
    const frame = window.requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [prompt.targetSelector]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  const highlightStyle = targetRect
    ? {
      top: Math.max(8, targetRect.top - 6),
      left: Math.max(8, targetRect.left - 6),
      width: Math.min(window.innerWidth - 16, targetRect.width + 12),
      height: Math.min(window.innerHeight - 16, targetRect.height + 12),
    }
    : undefined;
  const targetIsLow = targetRect
    ? targetRect.top + targetRect.height / 2 > window.innerHeight / 2
    : false;

  return (
    <div
      className={`tutorial-overlay practice ${prompt.blocking ? "blocking" : ""} ${targetRect ? "has-target" : "centered"} ${targetIsLow ? "target-low" : ""}`}
      data-tutorial-practice-step={step}
      data-tutorial-highlight={prompt.targetName}
    >
      {targetRect && (
        <div
          className="tutorial-highlight"
          style={highlightStyle}
          aria-hidden="true"
        />
      )}
      {!targetRect && prompt.blocking && (
        <div className="tutorial-full-scrim" aria-hidden="true" />
      )}
      <section
        className={`tutorial-card side-${prompt.cardSide ?? "right"}`}
        role={prompt.blocking || prompt.complete ? "dialog" : "region"}
        aria-modal={prompt.blocking || prompt.complete ? "true" : undefined}
        aria-live={prompt.blocking || prompt.complete ? undefined : "polite"}
        aria-labelledby="tutorial-practice-title"
        aria-describedby="tutorial-practice-description"
      >
        <button
          className="tutorial-close"
          onClick={onExit}
          aria-label="Exit tutorial"
        >
          <X size={18} />
        </button>
        <p className="eyebrow">GUIDED PRACTICE</p>
        <span className="tutorial-progress">
          {prompt.complete ? "PRACTICE COMPLETE" : `ACTION ${step} OF ${totalSteps}`}
        </span>
        <h2 id="tutorial-practice-title">{prompt.title}</h2>
        <p id="tutorial-practice-description">{prompt.body}</p>
        {prompt.instruction && (
          <strong className="tutorial-instruction">{prompt.instruction}</strong>
        )}
        {feedback && <p className="tutorial-feedback" role="alert">{feedback}</p>}
        {prompt.complete && (
          <button className="primary-button" onClick={onExit}>
            Finish tutorial
          </button>
        )}
      </section>
    </div>
  );
}
