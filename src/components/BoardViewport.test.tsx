// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BOARD_ZOOM_MAX,
  BoardViewport,
  clampBoardTransform,
  zoomBoardAtPoint,
} from "./BoardViewport";

beforeAll(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderViewport = (resetKey = "game-one") => {
  const onCell = vi.fn();
  const result = render(
    <BoardViewport label="Test board" resetKey={resetKey}>
      <button type="button" onClick={onCell}>Cell</button>
    </BoardViewport>,
  );
  const viewport = result.container.querySelector(".board-zoom-viewport") as HTMLDivElement;
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 410,
    bottom: 320,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  });
  return { ...result, viewport, onCell };
};

describe("board viewport math", () => {
  it("keeps the pointer location stable while zooming and clamps the board edges", () => {
    expect(zoomBoardAtPoint(
      { scale: 1, x: 0, y: 0 },
      2,
      { x: 100, y: 75 },
      { width: 400, height: 300 },
    )).toEqual({ scale: 2, x: -100, y: -75 });

    expect(clampBoardTransform(
      { scale: 2, x: -900, y: 200 },
      { width: 400, height: 300 },
    )).toEqual({ scale: 2, x: -400, y: 0 });
  });
});

describe("BoardViewport", () => {
  it("renders accessible controls, applies bounded transforms, and resets on demand", () => {
    const { container } = renderViewport();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const reset = screen.getByRole("button", { name: "Reset board zoom" });

    expect(screen.getByLabelText("Current board zoom").textContent).toBe("100%");
    expect((zoomOut as HTMLButtonElement).disabled).toBe(true);
    expect((reset as HTMLButtonElement).disabled).toBe(true);

    for (let index = 0; index < 12; index += 1) fireEvent.click(zoomIn);
    expect(screen.getByLabelText("Current board zoom").textContent).toBe("300%");
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".board-zoom-content")?.getAttribute("style"))
      .toContain(`scale(${BOARD_ZOOM_MAX})`);

    fireEvent.click(reset);
    expect(screen.getByLabelText("Current board zoom").textContent).toBe("100%");
    expect(container.querySelector(".board-zoom-content")?.getAttribute("style"))
      .toContain("translate3d(0px, 0px, 0) scale(1)");
  });

  it("resets when the board identity changes", () => {
    const { rerender } = renderViewport("first");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByLabelText("Current board zoom").textContent).toBe("125%");

    rerender(
      <BoardViewport label="Test board" resetKey="second">
        <button type="button">Cell</button>
      </BoardViewport>,
    );
    expect(screen.getByLabelText("Current board zoom").textContent).toBe("100%");
  });

  it("preserves taps but suppresses the click produced by a pointer pan", () => {
    const { viewport, onCell } = renderViewport();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const cell = screen.getByRole("button", { name: "Cell" });

    fireEvent.pointerDown(cell, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 200,
      clientY: 150,
    });
    fireEvent.pointerUp(cell, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 200,
      clientY: 150,
    });
    fireEvent.click(cell);
    expect(onCell).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(viewport, {
      pointerId: 2,
      pointerType: "mouse",
      button: 0,
      clientX: 200,
      clientY: 150,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 150,
      clientY: 110,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 150,
      clientY: 110,
    });
    expect(viewport.querySelector(".board-zoom-content")?.getAttribute("style"))
      .toContain("translate3d(-100px, -75px, 0)");
    fireEvent.click(cell);
    expect(onCell).toHaveBeenCalledTimes(1);
  });

  it("suppresses board clicks produced by a two-finger pinch", () => {
    const { viewport, onCell } = renderViewport();
    const cell = screen.getByRole("button", { name: "Cell" });

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 130,
      clientY: 150,
    });
    fireEvent.pointerDown(viewport, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 230,
      clientY: 150,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 280,
      clientY: 150,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 280,
      clientY: 150,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 130,
      clientY: 150,
    });
    fireEvent.click(cell);

    expect(onCell).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Current board zoom").textContent).not.toBe("100%");
  });

  it("uses Ctrl-wheel pinch at fit scale without consuming ordinary page scroll", () => {
    const { viewport } = renderViewport();
    const ordinaryWheel = new WheelEvent("wheel", {
      deltaY: -100,
      clientX: 210,
      clientY: 170,
      cancelable: true,
    });
    fireEvent(viewport, ordinaryWheel);
    expect(ordinaryWheel.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Current board zoom").textContent).toBe("100%");

    const pinchWheel = new WheelEvent("wheel", {
      deltaY: -100,
      clientX: 210,
      clientY: 170,
      ctrlKey: true,
      cancelable: true,
    });
    fireEvent(viewport, pinchWheel);
    expect(pinchWheel.defaultPrevented).toBe(true);
    expect(screen.getByLabelText("Current board zoom").textContent).not.toBe("100%");
  });
});
