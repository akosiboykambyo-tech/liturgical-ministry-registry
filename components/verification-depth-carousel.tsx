"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import gsap from "gsap";
import "./verification-depth-carousel.css";

type CarouselItem = {
  id: string;
  content: ReactNode;
  label: string;
};

type VerificationDepthCarouselProps = {
  items: CarouselItem[];
  activeIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
  hideControls?: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function VerificationDepthCarousel({
  items,
  activeIndex = 0,
  onChange,
  className = "",
  hideControls = false,
}: VerificationDepthCarouselProps) {
  const count = items.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const dragRef = useRef<{
    startX: number;
    startPos: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);

  const [active, setActive] = useState(() =>
    clamp(activeIndex, 0, Math.max(0, count - 1))
  );
  const [viewportWidth, setViewportWidth] = useState(760);
  const positionRef = useRef(active);
  const activeRef = useRef(active);
  const reducedMotionRef = useRef(false);

  const dimensions = useMemo(() => {
    const mobile = viewportWidth < 640;
    const compact = viewportWidth < 860;
    const cardWidth = mobile
      ? clamp(viewportWidth - 38, 286, 350)
      : clamp(viewportWidth - (compact ? 140 : 220), 410, 650);

    return {
      cardWidth,
      cardHeight: mobile ? 270 : 250,
      spread: mobile ? 18 : compact ? 34 : 46,
      depth: mobile ? 54 : 72,
      tilt: mobile ? 2.5 : 3.5,
      visibleCards: mobile ? 2 : 3,
    };
  }, [viewportWidth]);

  const layout = useCallback(
    (position: number) => {
      if (!count) return;
      const { spread, depth, tilt, visibleCards } = dimensions;

      for (let index = 0; index < count; index += 1) {
        const element = cardRefs.current[index];
        if (!element) continue;

        const distance = index - position;
        const visible = Math.abs(distance) <= visibleCards + 0.5;
        const translateX = spread * distance;
        const translateZ = -depth * Math.abs(distance);
        const rotateY =
          distance === 0
            ? 0
            : tilt * Math.sign(distance) * Math.min(Math.abs(distance), 1);
        const scale =
          distance === 0 ? 1 : Math.max(0.95, 1 - Math.abs(distance) * 0.018);
        const opacity = !visible
          ? 0
          : Math.max(0.58, 1 - Math.abs(distance) * 0.14);

        element.style.transform =
          distance === 0
            ? "translate3d(-50%, -50%, 0)"
            : [
                "translate3d(-50%, -50%, 0)",
                `translateX(${translateX.toFixed(2)}px)`,
                `translateZ(${translateZ.toFixed(2)}px)`,
                `rotateY(${rotateY.toFixed(2)}deg)`,
                `scale(${scale.toFixed(3)})`,
              ].join(" ");
        element.style.opacity = opacity.toFixed(3);
        element.style.zIndex = String(
          2000 - Math.round(Math.abs(distance) * 20)
        );
        element.style.pointerEvents =
          visible && opacity > 0.05 ? "auto" : "none";
      }
    },
    [count, dimensions]
  );

  const notify = useCallback(
    (index: number) => {
      activeRef.current = index;
      setActive(index);
      onChange?.(index);
    },
    [onChange]
  );

  const setFocus = useCallback(
    (rawIndex: number, animate = true) => {
      if (!count) return;
      const index = clamp(rawIndex, 0, count - 1);

      tweenRef.current?.kill();

      const proxy = { position: positionRef.current };
      tweenRef.current = gsap.to(proxy, {
        position: index,
        duration: animate && !reducedMotionRef.current ? 0.46 : 0,
        ease: "power3.out",
        onUpdate: () => {
          positionRef.current = proxy.position;
          layout(proxy.position);
        },
        onComplete: () => {
          positionRef.current = index;
          layout(index);
        },
      });

      if (index !== activeRef.current) notify(index);
    },
    [count, layout, notify]
  );

  const navigateBy = useCallback(
    (step: number) => setFocus(activeRef.current + step, true),
    [setFocus]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width);
    });

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, count);
    const next = clamp(activeIndex, 0, Math.max(0, count - 1));
    activeRef.current = next;
    positionRef.current = next;
    setActive(next);
    layout(next);
  }, [activeIndex, count, layout]);

  useEffect(() => {
    layout(positionRef.current);
  }, [dimensions, layout]);

  useEffect(
    () => () => {
      tweenRef.current?.kill();
    },
    []
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (count < 2) return;

      tweenRef.current?.kill();
      dragRef.current = {
        startX: event.clientX,
        startPos: positionRef.current,
        lastX: event.clientX,
        lastTime: performance.now(),
        velocity: 0,
        moved: false,
        pointerId: event.pointerId,
      };
    },
    [count]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = event.clientX - drag.startX;

      if (!drag.moved && Math.abs(dx) > 5) {
        drag.moved = true;
        rootRef.current?.setPointerCapture(drag.pointerId);
      }

      if (!drag.moved) return;

      const now = performance.now();
      const elapsed = Math.max(now - drag.lastTime, 1);
      drag.velocity = (event.clientX - drag.lastX) / elapsed;
      drag.lastX = event.clientX;
      drag.lastTime = now;

      const stepPixels = Math.max(dimensions.cardWidth * 0.52, 110);
      const position = clamp(
        drag.startPos - dx / stepPixels,
        0,
        Math.max(0, count - 1)
      );

      positionRef.current = position;
      layout(position);
    },
    [count, dimensions.cardWidth, layout]
  );

  const onPointerEnd = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;

    dragRef.current = null;
    if (!drag.moved) return;

    const stepPixels = Math.max(dimensions.cardWidth * 0.52, 110);
    const projected = clamp(
      positionRef.current - (drag.velocity * 110) / stepPixels,
      0,
      Math.max(0, count - 1)
    );

    setFocus(Math.round(projected), true);
  }, [count, dimensions.cardWidth, setFocus]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateBy(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateBy(1);
      } else if (event.key === "Home") {
        event.preventDefault();
        setFocus(0, true);
      } else if (event.key === "End") {
        event.preventDefault();
        setFocus(count - 1, true);
      }
    },
    [count, navigateBy, setFocus]
  );

  if (count === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`verification-depth-carousel ${className}`.trim()}
      role="region"
      aria-roledescription="carousel"
      aria-label="Matching registry entries"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <div
        className="verification-depth-carousel__stage"
        style={{
          height: dimensions.cardHeight + 44,
          perspective: "1400px",
        }}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            ref={(element) => {
              cardRefs.current[index] = element;
            }}
            className={[
              "verification-depth-carousel__card",
              active === index ? "is-active" : "",
            ].join(" ")}
            style={{
              width: dimensions.cardWidth,
              minHeight: dimensions.cardHeight,
            }}
            aria-hidden={active !== index}
            onClick={() => {
              if (!dragRef.current?.moved) setFocus(index, true);
            }}
          >
            {item.content}
          </div>
        ))}
      </div>

      {count > 1 && !hideControls && (
        <div className="verification-depth-carousel__controls">
          <button
            type="button"
            onClick={() => navigateBy(-1)}
            disabled={active === 0}
            aria-label="Previous matching minister"
            className="verification-depth-carousel__arrow verification-depth-carousel__arrow--previous"
          >
            <span aria-hidden="true">←</span>
          </button>

          <button
            type="button"
            onClick={() => navigateBy(1)}
            disabled={active === count - 1}
            aria-label="Next matching minister"
            className="verification-depth-carousel__arrow verification-depth-carousel__arrow--next"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}