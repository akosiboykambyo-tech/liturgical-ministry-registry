"use client";

import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const PUBLIC_EXCLUSIONS = ["/admin"];

function isPublicPath(pathname: string) {
  return !PUBLIC_EXCLUSIONS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function shouldReveal(element: Element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest("[data-motion-ignore='true']")) return false;
  if (element.hidden) return false;
  if (element.classList.contains("hidden")) return false;
  return true;
}

export function SiteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publicRoute = isPublicPath(pathname);

  useEffect(() => {
    document.documentElement.removeAttribute("data-route-pending");

    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }

    if (!publicRoute) return;

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, publicRoute]);

  useEffect(() => {
    if (!publicRoute) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduceMotion) return;

    const root = document.querySelector(".public-page-motion");
    if (!root) return;

    const revealSelector = [
      "main > section",
      "main article",
      "main [data-motion-card='true']",
      "main form",
      "main dl",
      "main figure",
      "footer",
    ].join(",");

    const tracked = new Set<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const element = entry.target as HTMLElement;
          element.setAttribute("data-motion-visible", "true");
          observer.unobserve(element);
        }
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -5% 0px",
      }
    );

    const register = (scope: ParentNode = root) => {
      const candidates = Array.from(scope.querySelectorAll(revealSelector));

      candidates.forEach((element, index) => {
        if (tracked.has(element) || !shouldReveal(element)) return;

        tracked.add(element);
        const html = element as HTMLElement;

        html.setAttribute("data-motion-reveal", "true");
        html.style.setProperty(
          "--motion-delay",
          `${Math.min(index % 4, 3) * 45}ms`
        );

        const rect = html.getBoundingClientRect();
        const alreadyVisible =
          rect.top < window.innerHeight * 0.92 && rect.bottom > 0;

        if (alreadyVisible) {
          requestAnimationFrame(() => {
            html.setAttribute("data-motion-visible", "true");
          });
        } else {
          observer.observe(html);
        }
      });
    };

    register();

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.matches?.(revealSelector) && shouldReveal(node)) {
            register(node.parentElement ?? root);
          } else {
            register(node);
          }
        }
      }
    });

    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [pathname, publicRoute]);

  useEffect(
    () => () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      document.documentElement.removeAttribute("data-route-pending");
    },
    []
  );

  function handleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!publicRoute || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;

    if (!anchor) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;

    let destination: URL;

    try {
      destination = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }

    if (destination.origin !== window.location.origin) return;

    const current = new URL(window.location.href);
    const sameDocument =
      destination.pathname === current.pathname &&
      destination.search === current.search;

    if (sameDocument) return;

    document.documentElement.setAttribute("data-route-pending", "true");

    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

    clearTimerRef.current = setTimeout(() => {
      document.documentElement.removeAttribute("data-route-pending");
      clearTimerRef.current = null;
    }, 900);
  }

  if (!publicRoute) return <>{children}</>;

  return (
    <div
      key={pathname}
      className="public-page-motion"
      onClickCapture={handleClick}
    >
      {children}
    </div>
  );
}