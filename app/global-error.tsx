"use client";

/**
 * Last-resort error boundary: replaces the root layout, so it must include
 * html/body and use self-contained styling if the normal design system fails.
 * Never reveal server error messages or stack traces.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#FBF9F9", color: "#1E1114", fontFamily: "Arial, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px", boxSizing: "border-box" }}>
          <section aria-labelledby="global-error-title" style={{ width: "100%", maxWidth: 760, borderLeft: "3px solid #970E24", paddingLeft: 24 }}>
            <p style={{ color: "#970E24", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              COWL-DOK · Service interruption
            </p>
            <h1 id="global-error-title" style={{ fontFamily: "Georgia, serif", fontWeight: 500, fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.1, margin: "16px 0" }}>
              We couldn’t open the registry.
            </h1>
            <p style={{ color: "#5F4A4F", fontSize: 16, lineHeight: 1.7, maxWidth: 600 }}>
              An unexpected error occurred. Please try again. If the problem continues, contact COWL-DOK support.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
              <button type="button" onClick={reset} style={{ minHeight: 44, padding: "10px 20px", backgroundColor: "#970E24", color: "#fff", border: "2px solid #970E24", borderRadius: 0, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Try again
              </button>
              <a href="/" style={{ display: "inline-flex", minHeight: 44, boxSizing: "border-box", alignItems: "center", justifyContent: "center", padding: "10px 20px", backgroundColor: "#fff", color: "#890022", border: "2px solid #890022", textDecoration: "none", fontSize: 14, fontWeight: 700 }}>
                Return to registry
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
