import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog | FridgeBee — Real Recipes, Real Fridges",
  description:
    "Recipes and food-waste tips from FridgeBee. What to cook with what you actually have — written for real kitchens.",
};

interface Post {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  readMinutes: number;
  emoji: string;
  tag: string;
}

const POSTS: Post[] = [
  {
    slug: "paneer-onion-tomato",
    title: "What to cook with paneer, onion, and tomato",
    description:
      "The classic Indian fridge trio. 7 dinners you can make in 30 minutes — no shopping trip needed.",
    publishedAt: "April 26, 2026",
    readMinutes: 6,
    emoji: "🧀",
    tag: "Indian · Vegetarian",
  },
];

export default function BlogIndex() {
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
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
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
          The <em style={{ color: "#E8920A", fontStyle: "italic" }}>FridgeBee</em>{" "}
          blog
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "#3D3830",
            lineHeight: 1.7,
            marginBottom: 36,
            fontWeight: 300,
          }}
        >
          What to cook with what you have. Real fridges, real recipes, no fusion
          nonsense.
        </p>

        {/* Posts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {POSTS.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              style={{
                display: "block",
                background: "#FFFFFF",
                border: "1px solid rgba(20,18,16,0.08)",
                borderRadius: 16,
                padding: "24px 22px",
                textDecoration: "none",
                color: "inherit",
                transition: "border-color .2s, transform .15s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    background: "#FEF3DC",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                    flexShrink: 0,
                  }}
                >
                  {post.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#B0A898",
                      marginBottom: 6,
                    }}
                  >
                    {post.tag} · {post.readMinutes} min read
                  </div>
                  <h2
                    style={{
                      fontFamily: "Instrument Serif, Georgia, serif",
                      fontSize: 22,
                      fontWeight: 400,
                      lineHeight: 1.25,
                      marginBottom: 6,
                    }}
                  >
                    {post.title}
                  </h2>
                  <p
                    style={{
                      fontSize: 14,
                      color: "#7A7060",
                      lineHeight: 1.6,
                      marginBottom: 8,
                    }}
                  >
                    {post.description}
                  </p>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#B0A898",
                    }}
                  >
                    {post.publishedAt}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: 48,
            padding: "32px 24px",
            background: "#141210",
            borderRadius: 16,
            textAlign: "center",
          }}
        >
          <h3
            style={{
              fontFamily: "Instrument Serif, Georgia, serif",
              fontSize: 26,
              fontWeight: 400,
              color: "#FFFFFF",
              marginBottom: 10,
              lineHeight: 1.25,
            }}
          >
            Try FridgeBee yourself
          </h3>
          <p
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 14,
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            Add what's in your fridge — get real recipes back, anchored to what
            you actually have.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "#E8920A",
              color: "#FFFFFF",
              padding: "12px 28px",
              borderRadius: 99,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Start free — 7 days unlimited →
          </Link>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 36,
            paddingTop: 20,
            borderTop: "1px solid rgba(20,18,16,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "#B0A898",
          }}
        >
          <span>© 2026 FridgeBee</span>
          <div style={{ display: "flex", gap: 18 }}>
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
              Privacy
            </Link>
            <Link href="/contact" style={{ color: "inherit", textDecoration: "none" }}>
              Contact
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
