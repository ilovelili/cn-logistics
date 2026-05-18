import { useCallback, useEffect, useState, type RefObject } from "react";

export function useHorizontalScrollHint<TElement extends HTMLElement>(
  scrollRef: RefObject<TElement>,
) {
  const [scrollState, setScrollState] = useState({
    canScroll: false,
    atStart: true,
    atEnd: true,
  });

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    const canScroll = maxScrollLeft > 1;

    setScrollState({
      canScroll,
      atStart: element.scrollLeft <= 1,
      atEnd: element.scrollLeft >= maxScrollLeft - 1,
    });
  }, [scrollRef]);

  useEffect(() => {
    updateScrollState();
  }, [updateScrollState]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollState);
    resizeObserver?.observe(element);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [scrollRef, updateScrollState]);

  const scrollByDirection = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollBy({
      left: direction * Math.max(element.clientWidth * 0.7, 240),
      behavior: "smooth",
    });
  };

  return { ...scrollState, scrollByDirection };
}
