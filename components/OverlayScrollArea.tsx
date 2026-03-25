"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";

type OverlayScrollAreaProps = {
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  children: ReactNode;
  viewportRef?: Ref<HTMLDivElement>;
};

function joinClasses(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

export default function OverlayScrollArea({
  className,
  viewportClassName,
  contentClassName,
  children,
  viewportRef,
}: OverlayScrollAreaProps) {
  const innerViewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const [thumb, setThumb] = useState({ height: 0, top: 0, scrollable: false });
  const [isVisible, setIsVisible] = useState(false);

  const updateMetrics = useCallback(() => {
    const viewport = innerViewportRef.current;
    if (!viewport) return;

    const { clientHeight, scrollHeight, scrollTop } = viewport;
    const scrollable = scrollHeight > clientHeight + 1;

    if (!scrollable || clientHeight <= 0) {
      setThumb((prev) => (prev.scrollable ? { height: 0, top: 0, scrollable: false } : prev));
      return;
    }

    const rawHeight = (clientHeight / scrollHeight) * clientHeight;
    const height = Math.max(34, Math.min(clientHeight - 8, rawHeight));
    const maxTop = Math.max(0, clientHeight - height);
    const top = scrollHeight === clientHeight ? 0 : (scrollTop / (scrollHeight - clientHeight)) * maxTop;

    setThumb((prev) => {
      if (
        prev.scrollable
        && Math.abs(prev.height - height) < 0.5
        && Math.abs(prev.top - top) < 0.5
      ) {
        return prev;
      }

      return { height, top, scrollable: true };
    });
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current != null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateMetrics();
    });
  }, [updateMetrics]);

  const showTemporarily = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
    }

    setIsVisible(true);
    hideTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, 700);
  }, []);

  const setViewportNode = useCallback((node: HTMLDivElement | null) => {
    innerViewportRef.current = node;
    assignRef(viewportRef, node);
    if (node) {
      scheduleUpdate();
    }
  }, [scheduleUpdate, viewportRef]);

  useEffect(() => {
    const viewport = innerViewportRef.current;
    const content = contentRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      showTemporarily();
      scheduleUpdate();
    };
    const handleInteraction = () => {
      showTemporarily();
      scheduleUpdate();
    };

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          scheduleUpdate();
        })
      : null;
    const mutationObserver = typeof MutationObserver === "function" && content
      ? new MutationObserver(() => {
          scheduleUpdate();
        })
      : null;

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("wheel", handleInteraction, { passive: true });
    viewport.addEventListener("touchmove", handleInteraction, { passive: true });
    viewport.addEventListener("pointerenter", handleInteraction);
    viewport.addEventListener("pointerdown", handleInteraction);
    viewport.addEventListener("focusin", handleInteraction);
    resizeObserver?.observe(viewport);
    if (content) {
      resizeObserver?.observe(content);
      mutationObserver?.observe(content, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    }
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("wheel", handleInteraction);
      viewport.removeEventListener("touchmove", handleInteraction);
      viewport.removeEventListener("pointerenter", handleInteraction);
      viewport.removeEventListener("pointerdown", handleInteraction);
      viewport.removeEventListener("focusin", handleInteraction);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [scheduleUpdate, showTemporarily]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
      }
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div className={joinClasses("overlayScrollArea", className, isVisible && thumb.scrollable && "is-scrollbar-visible")}>
      <div ref={setViewportNode} className={joinClasses("overlayScrollViewport", viewportClassName)}>
        <div ref={contentRef} className={joinClasses("overlayScrollContent", contentClassName)}>
          {children}
        </div>
      </div>
      {thumb.scrollable ? (
        <div className="overlayScrollBar" aria-hidden="true">
          <div
            className="overlayScrollThumb"
            style={{
              height: `${thumb.height}px`,
              transform: `translateY(${thumb.top}px)`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
