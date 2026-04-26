"use client";
import Link from "next/link";
import { useState } from "react";

const CONTACT_EMAIL = "hello@fridgebee.app";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<"feedback" | "bug" | "feature" | "other">(
    "feedback",
  );
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(
      `[FridgeBee · ${topic}] ${name ? `from ${name}` : "feedback"}`,
    );
    const body = encodeURIComponent(
      `${message}\n\n— — — — — —\nName: ${name || "(not provided)"}\nEmail: ${
        email || "(not provided)"
      }\nTopic: ${topic}`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FDFAF4",
        color: "#141210",
        padding: "32px 20px 64px",
        fontFamily:
          'Cabinet Grotesk, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "#7A7060",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            ← FridgeBee
          </Link>
        </div>

        <h1
          style={{
            fontFamily: "Instrument Serif, Georgia, serif",
            fontSize: 44,
            fontWeight: 400,
            lineHeight: 1.13,
            letterSpacing: "-0.5px",
            marginBottom: 12,
          }}
        >
          Get in <em style={{ color: "#E8920A", fontStyle: "italic" }}>touch</em>
        </h1>
        <p style={{ fontSize: 17, color: "#3D3830", lineHeight: 1.7, marginBottom: 36, fontWeight: 300 }}>
          Found a bug? Got an idea? Want a feature? Tell us — we read every
          message, usually reply within a day.
        </p>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(20,18,16,0.08)",
            borderRadius: 14,
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 42, height: 42, borderRadius: 10, background: "#FEF3DC",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, flexShrink: 0,
            }}
          >
            ✉️
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#7A7060", marginBottom: 2 }}>
              Or just email us directly
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              style={{ fontWeight: 500, fontSize: 14, color: "#141210", textDecoration: "none", wordBreak: "break-all" }}
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(20,18,16,0.08)",
            borderRadius: 16,
            padding: "24px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#3D3830", marginBottom: 6, display: "block" }}>
              What's this about?
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(["feedback", "bug", "feature", "other"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTopic(t)}
                  style={{
                    padding: "7px 14px", borderRadius: 99, border: "1.5px solid",
                    fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    borderColor: topic === t ? "#E8920A" : "rgba(20,18,16,0.15)",
                    background: topic === t ? "#FEF3DC" : "#FFFFFF",
                    color: topic === t ? "#A06208" : "#3D3830",
                    textTransform: "capitalize",
                  }}
                >
                  {t === "bug" ? "🐛 Bug report" : t === "feature" ? "✨ Feature idea" : t === "feedback" ? "💬 Feedback" : "❓ Other"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="name" style={{ fontSize: 12, fontWeight: 600, color: "#3D3830", marginBottom: 6, display: "block" }}>
              Your name <span style={{ color: "#B0A898" }}>(optional)</span>
            </label>
            <input
              id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Niharika"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid rgba(20,18,16,0.12)", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#FDFAF4" }}
            />
          </div>

          <div>
            <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: "#3D3830", marginBottom: 6, display: "block" }}>
              Email <span style={{ color: "#B0A898" }}>(if you want a reply)</span>
            </label>
            <input
              id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoCapitalize="none" autoCorrect="off"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid rgba(20,18,16,0.12)", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#FDFAF4" }}
            />
          </div>

          <div>
            <label htmlFor="message" style={{ fontSize: 12, fontWeight: 600, color: "#3D3830", marginBottom: 6, display: "block" }}>
              Your message
            </label>
            <textarea
              id="message" required rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what's on your mind..."
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid rgba(20,18,16,0.12)", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#FDFAF4", resize: "vertical", minHeight: 120 }}
            />
          </div>

          <button
            type="submit" disabled={!message.trim()}
            style={{
              background: message.trim() ? "#141210" : "rgba(20,18,16,0.2)",
              color: "#FFFFFF", border: "none", borderRadius: 99, padding: "13px 20px",
              fontSize: 15, fontWeight: 500, cursor: message.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit", transition: "background .2s",
            }}
          >
            Send message →
          </button>

          <p style={{ fontSize: 11, color: "#B0A898", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>
            Opens your email app with a pre-filled message. We don't store anything from this form.
          </p>
        </form>

        <div
          style={{
            marginTop: 36, paddingTop: 20,
            borderTop: "1px solid rgba(20,18,16,0.08)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 12, color: "#B0A898",
          }}
        >
          <span>© 2026 FridgeBee</span>
          <div style={{ display: "flex", gap: 18 }}>
            <Link href="/blog" style={{ color: "inherit", textDecoration: "none" }}>Blog</Link>
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
