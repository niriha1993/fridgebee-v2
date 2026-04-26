import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title:
    "What to cook with paneer, onion, and tomato | FridgeBee Blog",
  description:
    "The classic Indian fridge trio: paneer, onion, tomato. Seven real dinners you can cook in 30 minutes — Paneer Bhurji, Tomato Paneer Curry, Paneer Tikka Masala, and more.",
  openGraph: {
    title: "What to cook with paneer, onion, and tomato",
    description:
      "Seven real Indian dinners using just paneer, onion, and tomato. No shopping trip needed.",
    type: "article",
  },
};

interface Recipe {
  emoji: string;
  name: string;
  time: string;
  description: string;
  steps: string[];
  tip?: string;
}

const RECIPES: Recipe[] = [
  {
    emoji: "🍳",
    name: "Paneer Bhurji",
    time: "15 min",
    description:
      "Scrambled paneer with onion and tomato — the fastest way to dinner. Serve with roti, paratha, or stuff into a wrap.",
    steps: [
      "Crumble 200g paneer with your hands.",
      "Sauté finely chopped onion in oil till golden, add chopped tomato and cook till mushy.",
      "Add cumin, turmeric, chilli powder, salt. Stir in the paneer and cook 3 minutes.",
      "Finish with chopped coriander. Done.",
    ],
    tip: "Add a splash of milk at the end for a softer, creamier bhurji.",
  },
  {
    emoji: "🍅",
    name: "Tomato Paneer Curry",
    time: "25 min",
    description:
      "Silky tomato gravy with cubes of paneer. Rich, restaurant-style, made entirely in one pan.",
    steps: [
      "Blend 4 ripe tomatoes with 1 onion, garlic, ginger.",
      "Heat oil/butter, splutter cumin, pour in the tomato-onion paste. Cook 8–10 min till oil separates.",
      "Add salt, turmeric, chilli, garam masala, a pinch of sugar.",
      "Drop in cubed paneer, simmer 5 min. Garnish with cream and coriander.",
    ],
    tip: "Pan-fry the paneer cubes lightly before adding — keeps them firm in the gravy.",
  },
  {
    emoji: "🔥",
    name: "Paneer Tikka Masala",
    time: "30 min",
    description:
      "Char-marinated paneer in a rich onion-tomato masala. Tastes like takeout, costs ₹100/SGD$3 to make.",
    steps: [
      "Marinate cubed paneer in yogurt, ginger-garlic, garam masala, salt for 15 min.",
      "Char on a hot pan or under the grill till spotty brown.",
      "Cook 1 chopped onion + 3 tomatoes till saucy, add the spices and a splash of water.",
      "Stir in the charred paneer, simmer 5 min, finish with cream and dried fenugreek.",
    ],
  },
  {
    emoji: "🌯",
    name: "Paneer Kathi Roll",
    time: "20 min",
    description:
      "Paneer tikka stuffed in a chapati with onion-tomato salsa. Lunch-box gold.",
    steps: [
      "Make a quick paneer tikka (paneer + spices + 5 min in a hot pan).",
      "Slice 1 onion thin, dice 1 tomato, mix with lemon juice, salt, coriander.",
      "Warm a chapati or wrap, layer with paneer, salsa, and a drizzle of mint chutney.",
      "Roll tight, cut diagonally, serve.",
    ],
  },
  {
    emoji: "🍳",
    name: "Tomato Paneer Bhurji Toast",
    time: "10 min",
    description:
      "When you have toast and 10 minutes. Breakfast, lunch, or 11pm-snack — all roles handled.",
    steps: [
      "Cook tomato + onion + crumbled paneer together with salt, pepper, chilli for 5 min.",
      "Toast 2 slices of bread, butter generously.",
      "Pile the bhurji on top, finish with coriander and lemon juice.",
    ],
  },
  {
    emoji: "🥘",
    name: "Paneer Do Pyaza",
    time: "25 min",
    description:
      "Onion-forward Mughlai dish — \"do pyaza\" literally means \"two onions\". Sweet, deeply flavorful, pairs with naan or jeera rice.",
    steps: [
      "Slice 2 large onions thick, sauté half till golden brown, set aside.",
      "Sauté the rest of the onion + tomato + spices till saucy.",
      "Add cubed paneer + the reserved browned onions, simmer 8 min.",
      "Finish with garam masala and cream.",
    ],
  },
  {
    emoji: "🍕",
    name: "Paneer Tomato Pizza",
    time: "20 min",
    description:
      "Cheat code for kids: tomato sauce + paneer crumble on a roti or pita. Tastes like pizza, no Italian ingredients required.",
    steps: [
      "Cook 2 chopped tomatoes with garlic, oregano, salt till saucy. Mash.",
      "Spread on a roti or pita base. Top with crumbled paneer, sliced onion, chilli flakes.",
      "Bake or pan-fry till the base is crisp and toppings are warm.",
    ],
    tip: "Add a fried egg on top for breakfast pizza.",
  },
];

export default function PaneerOnionTomatoPost() {
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
      <article style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Top breadcrumb */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/blog"
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
            ← Blog
          </Link>
        </div>

        {/* Tag + meta */}
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#B0A898",
            marginBottom: 12,
          }}
        >
          Indian · Vegetarian · 6 min read · April 26, 2026
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: "Instrument Serif, Georgia, serif",
            fontSize: 44,
            fontWeight: 400,
            lineHeight: 1.13,
            letterSpacing: "-0.5px",
            marginBottom: 16,
          }}
        >
          What to cook with{" "}
          <em style={{ color: "#E8920A", fontStyle: "italic" }}>
            paneer, onion, and tomato
          </em>
        </h1>

        {/* Lede */}
        <p
          style={{
            fontSize: 18,
            color: "#3D3830",
            lineHeight: 1.7,
            marginBottom: 28,
            fontWeight: 300,
          }}
        >
          Three ingredients. One fridge. Seven real dinners. The paneer-onion-tomato
          combo is the most reliable Indian fridge trio there is — and you almost
          always have all three.
        </p>

        {/* Hero image placeholder */}
        <div
          style={{
            background: "linear-gradient(135deg, #FEF3DC 0%, #F5EFE3 100%)",
            border: "1px solid rgba(20,18,16,0.08)",
            borderRadius: 16,
            padding: "60px 20px",
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 8 }}>🧀 🧅 🍅</div>
          <div style={{ fontSize: 13, color: "#7A7060" }}>
            The Indian fridge trio
          </div>
        </div>

        {/* Intro */}
        <p
          style={{
            fontSize: 16,
            color: "#3D3830",
            lineHeight: 1.8,
            marginBottom: 18,
          }}
        >
          Open any Indian fridge and you'll almost certainly find these three
          things — paneer in the bottom shelf, an onion or two on the rack, and
          tomatoes ripening in the door. It's the reliable trio every dabbawala,
          aunty, and college kid leans on when they're tired and the kitchen feels
          empty.
        </p>
        <p
          style={{
            fontSize: 16,
            color: "#3D3830",
            lineHeight: 1.8,
            marginBottom: 36,
          }}
        >
          The good news: those three are enough for at least seven different
          dinners. No shopping trip. No fusion experiments. Just real,
          home-cook-tested dishes that hit the table in 30 minutes or less.
          Here's the lineup.
        </p>

        {/* Recipes */}
        {RECIPES.map((recipe, idx) => (
          <section
            key={recipe.name}
            style={{
              marginBottom: 36,
              paddingBottom: 32,
              borderBottom:
                idx < RECIPES.length - 1
                  ? "1px solid rgba(20,18,16,0.08)"
                  : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "#FEF3DC",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  flexShrink: 0,
                }}
              >
                {recipe.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "#A06208",
                    marginBottom: 2,
                  }}
                >
                  Recipe {idx + 1} · {recipe.time}
                </div>
                <h2
                  style={{
                    fontFamily: "Instrument Serif, Georgia, serif",
                    fontSize: 28,
                    fontWeight: 400,
                    lineHeight: 1.2,
                  }}
                >
                  {recipe.name}
                </h2>
              </div>
            </div>
            <p
              style={{
                fontSize: 15,
                color: "#3D3830",
                lineHeight: 1.7,
                marginBottom: 14,
              }}
            >
              {recipe.description}
            </p>
            <ol
              style={{
                paddingLeft: 22,
                fontSize: 14.5,
                color: "#3D3830",
                lineHeight: 1.7,
              }}
            >
              {recipe.steps.map((step, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {step}
                </li>
              ))}
            </ol>
            {recipe.tip && (
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  background: "#E8F5E9",
                  border: "1px solid #A5D6A7",
                  borderRadius: 10,
                  fontSize: 13.5,
                  color: "#2D6A2F",
                  lineHeight: 1.6,
                }}
              >
                <strong>Tip:</strong> {recipe.tip}
              </div>
            )}
          </section>
        ))}

        {/* Closing */}
        <div
          style={{
            marginTop: 24,
            padding: "28px 24px",
            background: "#FFFFFF",
            border: "1px solid rgba(20,18,16,0.08)",
            borderRadius: 16,
          }}
        >
          <h3
            style={{
              fontFamily: "Instrument Serif, Georgia, serif",
              fontSize: 24,
              fontWeight: 400,
              marginBottom: 10,
            }}
          >
            What if you have one of them but not the other two?
          </h3>
          <p style={{ fontSize: 15, color: "#3D3830", lineHeight: 1.7, marginBottom: 14 }}>
            That's where{" "}
            <Link href="/" style={{ color: "#E8920A", fontWeight: 500 }}>
              FridgeBee
            </Link>{" "}
            comes in. Tell it what's actually in your fridge — paneer + cabbage,
            paneer + capsicum, paneer + just methi — and it'll surface real
            recipes anchored on what you have. No "Mango Dal Rice", no fake
            fusion. Just dishes you can cook tonight.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "#141210",
              color: "#FFFFFF",
              padding: "12px 24px",
              borderRadius: 99,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Try FridgeBee free — 7 days unlimited →
          </Link>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid rgba(20,18,16,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "#B0A898",
          }}
        >
          <Link
            href="/blog"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            ← Back to blog
          </Link>
          <div style={{ display: "flex", gap: 18 }}>
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
              Privacy
            </Link>
            <Link href="/contact" style={{ color: "inherit", textDecoration: "none" }}>
              Contact
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}
