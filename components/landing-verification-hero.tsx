"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  QrCode,
  Search,
  ShieldCheck,
} from "@/components/phosphor-icons";

type LandingVerificationHeroProps = {
  displayFontClassName: string;
};

export function LandingVerificationHero({
  displayFontClassName,
}: LandingVerificationHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let cleanup = () => {};
    let cancelled = false;

    async function setupAnimation() {
      const [{ gsap }, { ScrollTrigger }, { ScrollSmoother }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/ScrollSmoother"),
      ]);

      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

      const section = sectionRef.current;
      const stage = stageRef.current;
      const hero = heroRef.current;
      const heroContent = heroContentRef.current;
      const card = cardRef.current;

      if (!section || !stage || !hero || !heroContent || !card) return;

      const mm = gsap.matchMedia();

      mm.add(
        "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        () => {
          const smoother = ScrollSmoother.create({
            wrapper: "#smooth-wrapper",
            content: "#smooth-content",
            smooth: 0.85,
            effects: false,
            smoothTouch: 0,
          });

          gsap.set(hero, {
            width: "100%",
            borderTopRightRadius: "0.75rem",
            borderBottomRightRadius: "0.75rem",
          });

          gsap.set(card, {
            autoAlpha: 0,
            xPercent: 18,
            clipPath: "inset(0 0 0 100%)",
            pointerEvents: "none",
          });

          const timeline = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: () => `+=${Math.round(window.innerHeight * 1.35)}`,
              pin: true,
              pinSpacing: true,
              scrub: 0.75,
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });

          timeline
            .to(
              hero,
              {
                width: "54%",
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                duration: 1,
              },
              0
            )
            .to(
              heroContent,
              {
                scale: 0.82,
                transformOrigin: "left center",
                duration: 1,
              },
              0
            )
            .to(
              card,
              {
                autoAlpha: 1,
                xPercent: 0,
                clipPath: "inset(0 0 0 0%)",
                pointerEvents: "auto",
                duration: 0.9,
              },
              0.08
            )
            .to({}, { duration: 0.45 });

          window.requestAnimationFrame(() => ScrollTrigger.refresh());

          return () => {
            timeline.scrollTrigger?.kill();
            timeline.kill();
            smoother.kill();
            gsap.set([hero, heroContent, card], { clearProps: "all" });
          };
        }
      );

      mm.add(
        "(max-width: 1023px), (prefers-reduced-motion: reduce)",
        () => {
          gsap.set([hero, heroContent, card], { clearProps: "all" });
        }
      );

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const sectionTitles = gsap.utils.toArray<HTMLElement>(
          '[data-landing-reveal="section-title"]'
        );
        const steps = gsap.utils.toArray<HTMLElement>(
          '[data-landing-reveal="step"]'
        );
        const guidanceTitle = document.querySelector<HTMLElement>(
          '[data-landing-reveal="guidance-title"]'
        );
        const questions = gsap.utils.toArray<HTMLElement>(
          '[data-landing-reveal="question"]'
        );
        const office = document.querySelector<HTMLElement>(
          '[data-landing-reveal="office"]'
        );
        const footer = document.querySelector<HTMLElement>("footer");

        const revealTweens: gsap.core.Tween[] = [];

        sectionTitles.forEach((target) => {
          revealTweens.push(
            gsap.fromTo(
              target,
              { autoAlpha: 0, y: 24 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.72,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: target,
                  start: "top 84%",
                  once: true,
                },
              }
            )
          );
        });

        if (steps.length > 0) {
          revealTweens.push(
            gsap.fromTo(
              steps,
              { autoAlpha: 0, y: 24 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.68,
                stagger: 0.09,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: steps[0].parentElement ?? steps[0],
                  start: "top 82%",
                  once: true,
                },
              }
            )
          );
        }

        if (guidanceTitle) {
          revealTweens.push(
            gsap.fromTo(
              guidanceTitle,
              { autoAlpha: 0, y: 22 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.7,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: guidanceTitle,
                  start: "top 84%",
                  once: true,
                },
              }
            )
          );
        }

        if (questions.length > 0) {
          revealTweens.push(
            gsap.fromTo(
              questions,
              { autoAlpha: 0, y: 18 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.62,
                stagger: 0.08,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: questions[0].parentElement ?? questions[0],
                  start: "top 84%",
                  once: true,
                },
              }
            )
          );
        }

        [office, footer].forEach((target) => {
          if (!target) return;
          revealTweens.push(
            gsap.fromTo(
              target,
              { autoAlpha: 0, y: 20 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.7,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: target,
                  start: "top 90%",
                  once: true,
                },
              }
            )
          );
        });

        window.requestAnimationFrame(() => ScrollTrigger.refresh());

        return () => {
          revealTweens.forEach((tween) => {
            tween.scrollTrigger?.kill();
            tween.kill();
          });
          gsap.set(
            [
              ...sectionTitles,
              ...steps,
              ...(guidanceTitle ? [guidanceTitle] : []),
              ...questions,
              ...(office ? [office] : []),
              ...(footer ? [footer] : []),
            ],
            { clearProps: "opacity,visibility,transform" }
          );
        };
      });

      cleanup = () => {
        mm.revert();
        ScrollTrigger.refresh();
      };

      ScrollTrigger.refresh();
    }

    void setupAnimation();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="verification"
      className="mx-auto w-full max-w-[1240px] px-5 pb-12 pt-5 sm:px-7 sm:pb-14 sm:pt-7 lg:px-12 lg:pb-16 lg:pt-8"
    >
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-xl bg-card shadow-[0_18px_45px_rgba(38,35,42,0.08)] lg:min-h-[570px]"
      >
        <div
          ref={heroRef}
          className="relative flex min-h-[470px] flex-col justify-center rounded-t-xl bg-[#970e24] px-7 py-10 text-white sm:min-h-[500px] sm:px-10 sm:py-12 lg:absolute lg:inset-y-0 lg:left-0 lg:min-h-0 lg:w-full lg:rounded-xl lg:px-12 lg:py-14"
        >
          <div
            ref={heroContentRef}
            className="max-w-xl lg:w-[560px] lg:max-w-none"
          >
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.17em] text-white/95 sm:text-xs">
              <span className="h-px w-6 bg-current" aria-hidden="true" />
              Official Head Office Registry
            </div>

            <h1
              className={`${displayFontClassName} mt-7 text-[clamp(2.75rem,6vw,4.65rem)] font-medium leading-[1.03] tracking-[-0.025em]`}
            >
              Is this person a registered minister?
              <span className="mt-1 block font-normal italic text-[#ffe0df]">
                Check here.
              </span>
            </h1>

            <p className="mt-6 max-w-md text-base leading-7 text-white/90 sm:text-lg sm:leading-8">
              Find out if a minister is registered with the diocese.
            </p>

            <div className="mt-10 flex max-w-md items-start gap-4 border-t border-white/30 pt-6">
              <ShieldCheck
                className="mt-0.5 h-7 w-7 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">
                  Maintained by the Diocesan Commission on Worship and Liturgy.
                </p>
              </div>
            </div>

            <div className="mt-9 hidden items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-white/65 lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
              Scroll down to start your search
            </div>
          </div>
        </div>

        <div
          ref={cardRef}
          className="relative flex min-h-[520px] flex-col justify-center rounded-b-xl border border-t-0 border-border bg-white px-7 py-9 sm:px-10 sm:py-11 lg:absolute lg:inset-y-0 lg:right-0 lg:min-h-0 lg:w-[46%] lg:rounded-l-none lg:rounded-r-xl lg:border lg:border-l-0 lg:px-10 lg:py-12"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#faedf0] text-[#970e24]">
              <Search className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Public Verification
            </span>
          </div>

          <h2
            className={`${displayFontClassName} mt-5 text-[2rem] font-medium leading-tight tracking-[-0.02em] text-foreground sm:text-[2.25rem]`}
          >
            Check a minister
          </h2>

          <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground sm:text-base">
            Enter a name or Registry ID to see their ministry and status.
          </p>

          <div className="mt-6 rounded-md border border-[#e7e5e9] bg-[#f5f5f7] p-4">
            <span className="text-sm text-muted-foreground">
              You&apos;ll need one of these:
            </span>
            <p className="mt-2 text-base font-semibold text-foreground">
              Full name{" "}
              <span className="mx-2 font-normal text-muted-foreground">or</span>
              Registry ID
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Registry ID example: LMD-2026-0001
            </p>
          </div>

          <Link
            href="/verify"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#970e24] px-5 py-3 text-sm font-semibold text-white transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#730a1c] hover:shadow-[0_8px_20px_rgba(151,14,36,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 focus-visible:ring-offset-2 active:translate-y-0"
          >
            Search
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            You&apos;ll be taken to the diocesan portal shortly.
          </p>

          <div className="mt-6 flex gap-3 border-t border-border pt-5">
            <QrCode
              className="mt-0.5 h-6 w-6 shrink-0 text-[#970e24]"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Have a certificate?
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Scan the QR code on it to see the record.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
