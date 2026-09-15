"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileBadge, Lock } from "lucide-react";
interface VerificationMember {
  id: string;
  uid: string;
  first_name: string;
  last_name: string;
  parish: string;
  ministries: string[];
  status: string;
}

interface VerificationResultStackProps {
  results: VerificationMember[];
}

export default function VerificationResultStack({
  results,
}: VerificationResultStackProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (results.length <= 1) {
      setActiveIndex(0);
      return;
    }

    const observers: IntersectionObserver[] = [];

    itemRefs.current.forEach((element, index) => {
      if (!element) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveIndex(index);
          }
        },
        {
          rootMargin: "-35% 0px -50% 0px",
          threshold: 0,
        }
      );

      observer.observe(element);
      observers.push(observer);
    });

    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      if (scrollPosition >= documentHeight - 24) {
        setActiveIndex(results.length - 1);
      }
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observers.forEach((observer) => observer.disconnect());
      window.removeEventListener("scroll", handleScroll);
    };
  }, [results.length]);

  if (results.length === 0) return null;

  if (results.length === 1) {
    const member = results[0];

    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileBadge className="h-5 w-5 shrink-0 text-primary" />
              <h2 className="text-lg font-bold">
                {member.first_name} {member.last_name}
              </h2>
            </div>

            <p className="mt-1 text-sm text-muted-foreground">
              {member.parish}
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium">
            {member.status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Parish</p>
            <p className="mt-0.5 text-sm font-medium">{member.parish}</p>
          </div>

          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Registered Ministry/Ministries
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {member.ministries.join(", ")}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-medium">Registry Result</span>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span className="font-mono">{member.uid}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="sticky top-16 z-20 mb-6 flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-xs shadow-sm">
        <span className="font-medium text-muted-foreground">
          Registry results
        </span>

        <span className="font-mono font-semibold text-foreground">
          {String(activeIndex + 1).padStart(2, "0")} /{" "}
          {String(results.length).padStart(2, "0")}
        </span>
      </div>

      <div className="space-y-6">
        {results.map((member, index) => (
          <div
            key={member.id}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className="relative min-h-[22vh]"
          >
            <div className="sticky top-24">
              <article
                className={[
                  "rounded-xl border border-border bg-card p-5 shadow-sm",
                  "transition-[transform,opacity] duration-500 ease-out",
                  "motion-reduce:transition-none",
                  index < activeIndex
                    ? "scale-[0.96] opacity-0 pointer-events-none"
                    : index === activeIndex
                    ? "scale-100 opacity-100"
                    : "scale-[0.96] opacity-35",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileBadge className="h-5 w-5 shrink-0 text-primary" />
                      <h2 className="truncate text-base font-semibold">
                        {member.first_name} {member.last_name}
                      </h2>
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {member.parish}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                    {member.status}
                  </span>
                </div>

                <div className="mt-4 rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Registered Ministry/Ministries
                  </p>
                  <p className="mt-0.5 text-sm font-medium">
                    {member.ministries.join(", ")}
                  </p>
                </div>
              </article>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
