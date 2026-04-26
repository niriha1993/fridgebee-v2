// app/api/cron/send-nudges/route.ts
//
// Vercel Cron hits this endpoint on a schedule (see vercel.json). For every
// subscribed device, we check:
//   1. Is the current local time within ±2 minutes of one of the user's
//      notif slot times (e.g. "08:00", "17:30")?
//   2. Does the user have items expiring soon (or other things worth
//      nudging about)?
// If yes → fire a Web Push.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We reject
// requests without it so random people can't trigger this endpoint.
//
// This handler runs in Node.js (web-push is CJS-only).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@fridgebee.app';
const CRON_SECRET   = process.env.CRON_SECRET || '';

interface PushSubscriptionRow {
  endpoint: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  user_id: string | null;
  notif_times: Record<string, string>;
  timezone: string;
  state?: AppStateRow['state'];
}

interface AppStateRow {
  user_id: string;
  state: {
    items?: Array<{ name: string; expiry: string; qty: number; unit: string; added?: string; cost?: number }>;
    name?: string;
    notifEnabled?: boolean;
    members?: Array<{ name: string; isKid?: boolean; age?: number; dietaryFilters?: string[]; allergies?: string[] }>;
    cuisines?: string[];
    dietaryFilters?: string[];
    cookedMeals?: Array<{ name: string; cookedAt: string }>;
    itemsUsed?: number;
    itemsWasted?: number;
  };
}

// Breakfast-specific dish lookup — used by the morning notification slot so
// the suggestion is something a real human eats AT breakfast (Poha, Upma,
// Pancakes), not a dinner dish that happens to use the same ingredient.
const BREAKFAST_RECIPES: Record<string, string> = {
  // Indian breakfast staples
  poha: 'Poha', 'flattened rice': 'Poha',
  sooji: 'Suji Upma', rava: 'Suji Upma', semolina: 'Suji Upma',
  besan: 'Besan Chilla',
  atta: 'Aloo Paratha', 'wheat flour': 'Aloo Paratha',
  maida: 'Pancakes',
  vermicelli: 'Vermicelli Upma', sewai: 'Vermicelli Upma',
  sabudana: 'Sabudana Khichdi',
  'idli rava': 'Idli', 'dosa batter': 'Dosa', 'idli batter': 'Idli',
  // Halwa (sweet, kid-friendly)
  'sweet potato': 'Sweet Potato Halwa', 'shakarkandi': 'Sweet Potato Halwa', shakarkand: 'Sweet Potato Halwa',
  carrot: 'Gajar Halwa', gajar: 'Gajar Halwa', carrots: 'Gajar Halwa',
  pumpkin: 'Pumpkin Halwa', kaddu: 'Pumpkin Halwa',
  almond: 'Badam Halwa', almonds: 'Badam Halwa', badam: 'Badam Halwa',
  beetroot: 'Beetroot Halwa',
  // Indian breakfast — protein-led
  eggs: 'Masala Omelette', egg: 'Masala Omelette',
  paneer: 'Paneer Bhurji',
  // Indian breakfast — herb/leaf-led
  spinach: 'Palak Paratha', palak: 'Palak Paratha',
  methi: 'Methi Thepla', fenugreek: 'Methi Thepla',
  // Indian breakfast — veg-led parathas / chillas / uttapams
  potato: 'Aloo Paratha', aloo: 'Aloo Paratha',
  onion: 'Onion Uttapam',
  tomato: 'Tomato Uttapam', tomatoes: 'Tomato Uttapam',
  cabbage: 'Cabbage Paratha',
  cauliflower: 'Gobi Paratha', gobi: 'Gobi Paratha',
  // Western / continental
  oats: 'Oatmeal', oatmeal: 'Oatmeal',
  bread: 'French Toast',
  yogurt: 'Yogurt Parfait', curd: 'Curd Rice',
  milk: 'Cornflakes',
  banana: 'Banana Pancakes',
  mango: 'Mango Smoothie',
  apple: 'Apple Cinnamon Oatmeal',
  berries: 'Berry Smoothie Bowl', strawberry: 'Strawberry Smoothie',
  avocado: 'Avocado Toast',
  cheese: 'Cheese Toast',
  sausage: 'Sausage Sandwich',
  bacon: 'Bacon and Eggs',
};
function suggestBreakfast(itemName?: string): string | null {
  if (!itemName) return null;
  const lc = itemName.toLowerCase().trim();
  if (BREAKFAST_RECIPES[lc]) return BREAKFAST_RECIPES[lc];
  for (const [k, r] of Object.entries(BREAKFAST_RECIPES)) {
    if (lc.includes(k) || k.includes(lc)) return r;
  }
  return null;
}

// Quick recipe suggestion lookup — maps an ingredient noun to a real, named
// dish. Used to make notifications specific ("Try Palak Paneer tonight")
// instead of generic ("Open FridgeBee for ideas"). No AI call needed —
// keeps the cron fast and deterministic.
const ITEM_TO_RECIPE: Record<string, string> = {
  spinach: 'Palak Paneer', palak: 'Palak Paneer',
  methi: 'Aloo Methi', fenugreek: 'Aloo Methi',
  paneer: 'Paneer Butter Masala',
  tomato: 'Pasta Pomodoro', tomatoes: 'Pasta Pomodoro',
  cabbage: 'Cabbage Stir-fry',
  capsicum: 'Mixed Veg Sabzi', 'bell pepper': 'Mixed Veg Sabzi',
  bhindi: 'Bhindi Masala', okra: 'Bhindi Masala',
  brinjal: 'Baingan Bharta', eggplant: 'Baingan Bharta', baingan: 'Baingan Bharta',
  lauki: 'Lauki Sabzi',
  carrot: 'Carrot Soup', carrots: 'Carrot Soup',
  potato: 'Aloo Sabzi', aloo: 'Aloo Sabzi',
  cauliflower: 'Aloo Gobi', gobi: 'Aloo Gobi',
  mushroom: 'Mushroom Risotto', mushrooms: 'Mushroom Risotto',
  broccoli: 'Garlic Broccoli',
  avocado: 'Avocado Toast',
  eggs: 'Scrambled Eggs on Toast', egg: 'Scrambled Eggs on Toast',
  chicken: 'Chicken Curry', 'chicken breast': 'Grilled Chicken',
  fish: 'Pan-fried Fish', salmon: 'Grilled Salmon',
  pork: 'Pork Belly Rice Bowl', 'pork belly': 'Pork Belly Rice Bowl',
  beef: 'Beef Stir-fry', 'ground beef': 'Spaghetti Bolognese',
  mutton: 'Mutton Curry', lamb: 'Lamb Stew',
  prawn: 'Prawn Stir-fry', prawns: 'Prawn Stir-fry', shrimp: 'Prawn Stir-fry',
  tofu: 'Tofu Stir-fry',
  rice: 'Vegetable Fried Rice', basmati: 'Vegetable Pulao',
  pasta: 'Pasta Pomodoro', spaghetti: 'Spaghetti Aglio e Olio',
  noodles: 'Singapore Noodles',
  dal: 'Dal Tadka', lentils: 'Dal Tadka', 'toor dal': 'Dal Tadka',
  rajma: 'Rajma Chawal', chickpeas: 'Chana Masala', chana: 'Chana Masala',
  cheese: 'Grilled Cheese Sandwich', mozzarella: 'Caprese Salad',
  milk: 'French Toast', yogurt: 'Yogurt Parfait', curd: 'Cucumber Raita',
  mango: 'Mango Lassi', banana: 'Banana Smoothie', apple: 'Apple Crumble',
  berries: 'Berry Smoothie', strawberry: 'Strawberry Smoothie',
};
function suggestRecipe(itemName?: string): string | null {
  if (!itemName) return null;
  const lc = itemName.toLowerCase().trim();
  if (ITEM_TO_RECIPE[lc]) return ITEM_TO_RECIPE[lc];
  // Substring match for compound names ("alphonso mango" → mango).
  for (const [key, recipe] of Object.entries(ITEM_TO_RECIPE)) {
    if (lc.includes(key) || key.includes(lc)) return recipe;
  }
  return null;
}

// Pick a varied phrasing seeded by the date so the same user doesn't get
// the identical title every day.
function variant<T>(arr: T[], dateSeed: string): T {
  let h = 0;
  for (let i = 0; i < dateSeed.length; i++) h = (h * 31 + dateSeed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

// Time-of-day in HH:MM in a given IANA timezone. Returns null if invalid.
function nowInTz(tz: string): { hh: number; mm: number; iso: string } | null {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const hh = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const mm = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return { hh, mm, iso: now.toISOString() };
  } catch {
    return null;
  }
}

// Returns minutes-since-midnight from "HH:MM".
function hhmmToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

// Build a personalised nudge based on the user's profile + fridge state +
// which slot fired. Returns null if there's nothing meaningful to say (so
// the user doesn't get spammed with empty nudges).
//
// Personalisation axes:
//   - Kid in household → name them in the body, prefer kid-safe recipes
//   - Multiple adults → "for the family"
//   - Solo → "you"
//   - Items expiring soon → expiry-led message
//   - Items sitting unused for 3+ days → "don't forget your X"
//   - Cooking history → tone (active cook / first-timer)
function buildNudge(state: AppStateRow['state'], slot: string, dateSeed: string): { title: string; body: string; url: string } | null {
  const items = Array.isArray(state.items) ? state.items : [];
  const members = Array.isArray(state.members) ? state.members : [];
  const userName = (state.name || '').split(' ')[0] || '';
  const today = new Date();
  const dayMs = 86400000;

  // Items expiring within ~2 days.
  const expiringSoon = items
    .map(it => {
      const expiry = new Date(it.expiry + 'T00:00:00');
      const days = Math.ceil((expiry.getTime() - today.getTime()) / dayMs);
      return { it, days };
    })
    .filter(({ days }) => days <= 2)
    .sort((a, b) => a.days - b.days);

  // Items that have been sitting unused for 3+ days and aren't expiring yet.
  const sittingUnused = items
    .filter(it => it.added)
    .map(it => {
      const added = new Date(it.added + 'T00:00:00');
      const sittingDays = Math.floor((today.getTime() - added.getTime()) / dayMs);
      return { it, sittingDays };
    })
    .filter(({ sittingDays, it }) => {
      if (sittingDays < 3) return false;
      const expiry = new Date(it.expiry + 'T00:00:00');
      const days = Math.ceil((expiry.getTime() - today.getTime()) / dayMs);
      return days > 2; // not already covered by expiringSoon
    })
    .sort((a, b) => b.sittingDays - a.sittingDays);

  // Household profile.
  const kid = members.find(m => m.isKid || (m.age != null && m.age < 12));
  const kidName = kid?.name?.trim() || null;
  const otherAdults = members.filter(m => m !== kid);
  const isCouple = members.length >= 1 && !kidName; // user + 1+ adult member
  const isFamily = !!kidName;
  const isSolo = members.length === 0;

  const greeting = userName ? `, ${userName}` : '';

  // ── MORNING DIGEST (~ 8 am) — BREAKFAST-THEMED ─────────────────────────
  // Morning is the BREAKFAST nudge. Pick a breakfast-appropriate dish using
  // pantry items the user actually has (Poha, Upma, Oatmeal, Banana
  // Pancakes, etc.). Tomorrow framing works for the previous-night version
  // ("Tomorrow morning try X") OR same-morning ("Make X for breakfast today").
  // We use "this morning" since 8am IS breakfast time.
  if (slot === 'morning') {
    // Step 1 — find a breakfast-suitable hero ingredient. Iterate the fridge
    // and pick the FIRST item whose name maps to a real breakfast recipe.
    const breakfastHero = items.find(it => suggestBreakfast(it.name));
    const breakfastRecipe = breakfastHero ? suggestBreakfast(breakfastHero.name) : null;

    if (breakfastRecipe && breakfastHero) {
      if (isFamily) {
        return {
          title: variant([
            `Breakfast for ${kidName}? 🍳`,
            `${kidName}'s breakfast 🌅`,
          ], dateSeed),
          body: `Make ${breakfastRecipe} this morning — uses your ${breakfastHero.name.toLowerCase()} and ${kidName} will love it.`,
          url: '/?tab=meals',
        };
      }
      if (isCouple) {
        return {
          title: variant([
            `Breakfast idea ☀️`,
            `Good morning${greeting} 🌅`,
          ], dateSeed),
          body: `Try ${breakfastRecipe} together this morning — uses your ${breakfastHero.name.toLowerCase()}.`,
          url: '/?tab=meals',
        };
      }
      return {
        title: variant([
          `Good morning${greeting} ☀️`,
          `Breakfast: ${breakfastRecipe} 🍳`,
        ], dateSeed),
        body: `Make ${breakfastRecipe} — uses your ${breakfastHero.name.toLowerCase()}. Tap to start cooking.`,
        url: '/?tab=meals',
      };
    }

    // Step 2 — no breakfast-suitable items. Fall back to expiry-led copy.
    if (expiringSoon.length > 0) {
      const head = expiringSoon[0].it.name;
      const word = expiringSoon[0].days <= 0 ? 'today' : 'tomorrow';
      return {
        title: `${head} expires ${word} 🌅`,
        body: isFamily
          ? `Cook with ${head} today — ${kidName} can have it for lunch or dinner.`
          : `Plan a meal around ${head} today before it goes bad.`,
        url: '/?tab=meals',
      };
    }

    // Step 3 — items sitting unused.
    if (sittingUnused.length > 0) {
      const item = sittingUnused[0];
      return {
        title: variant([
          `Good morning${greeting} ☀️`,
          `Your ${item.it.name} is waiting 🌅`,
        ], dateSeed),
        body: `Bought your ${item.it.name.toLowerCase()} ${item.sittingDays} days ago — let's cook it before it goes bad.`,
        url: '/?tab=meals',
      };
    }

    if (items.length === 0) {
      return {
        title: `Good morning${greeting} ☀️`,
        body: 'Add what you bought yesterday — FridgeBee will turn it into breakfast and dinner.',
        url: '/?tab=fridge',
      };
    }

    // Last resort — gentle morning ping.
    return {
      title: `Good morning${greeting} ☀️`,
      body: 'Open FridgeBee — we\'ll plan today\'s meals around what you have.',
      url: '/?tab=meals',
    };
  }

  // ── EXPIRY ALERT (~ 8:30 am) ────────────────────────────────────────────
  if (slot === 'expiry') {
    if (expiringSoon.length === 0) return null;
    const head = expiringSoon[0].it.name;
    const word = expiringSoon[0].days <= 0 ? 'today' : 'tomorrow';
    const recipe = suggestRecipe(head);
    if (expiringSoon.length === 1) {
      return {
        title: `${head} expires ${word} ⚠️`,
        body: recipe
          ? `Cook ${recipe} ${isFamily ? `for ${kidName}` : isCouple ? 'tonight' : 'tonight'} — uses it up perfectly.`
          : `Make something with it ${isFamily ? `for ${kidName} ` : ''}before it goes bad.`,
        url: '/?tab=meals',
      };
    }
    const names = expiringSoon.map(e => e.it.name).slice(0, 3).join(', ');
    return {
      title: `${expiringSoon.length} items expiring 🍳`,
      body: `${names} need using. ${recipe ? `Try ${recipe}.` : 'Tap for ideas.'}`,
      url: '/?tab=meals',
    };
  }

  // ── MEAL SUGGESTIONS (~ 5:30 pm) ─────────────────────────────────────────
  if (slot === 'meal') {
    if (isFamily) {
      const hero = expiringSoon[0]?.it || sittingUnused[0]?.it || items[0];
      const recipe = suggestRecipe(hero?.name);
      return {
        title: `What's ${kidName} eating tonight? 🍳`,
        body: recipe
          ? `${recipe} — kid-safe and uses your ${hero?.name?.toLowerCase() || 'fridge'}. Tap to start cooking.`
          : `Pick something ${kidName} will love — open FridgeBee for tonight's plan.`,
        url: '/?tab=meals',
      };
    }
    if (sittingUnused.length > 0) {
      const item = sittingUnused[0];
      const recipe = suggestRecipe(item.it.name);
      return {
        title: `Don't forget your ${item.it.name} 🍳`,
        body: recipe
          ? `Bought ${item.sittingDays} days ago — make ${recipe} tonight before it spoils.`
          : `Bought ${item.sittingDays} days ago — still good if you cook it tonight.`,
        url: '/?tab=meals',
      };
    }
    if (expiringSoon.length > 0) {
      const head = expiringSoon[0].it.name;
      const recipe = suggestRecipe(head);
      return {
        title: variant([`Time for dinner? 🍳`, `What's for dinner${greeting}? 🍳`], dateSeed),
        body: recipe
          ? `${recipe} sounds good tonight — uses your ${head.toLowerCase()}.`
          : `${head} expires soon. Tap for tonight's recipe ideas.`,
        url: '/?tab=meals',
      };
    }
    if (items.length === 0) {
      return null;
    }
    // Plenty of items, nothing urgent — gentle nudge.
    const hero = items[0];
    const recipe = suggestRecipe(hero.name);
    return {
      title: variant([
        `What's for dinner${greeting}? 🍳`,
        `Time to cook${greeting}? 🍳`,
      ], dateSeed),
      body: recipe
        ? `${recipe} — uses your ${hero.name.toLowerCase()}. Tap to start.`
        : 'Open FridgeBee — pick something for tonight.',
      url: '/?tab=meals',
    };
  }

  // ── RESTOCK REMINDERS (~ 10 am) ──────────────────────────────────────────
  if (slot === 'restock') {
    // Items recently used up (last 3 days) — heuristic: very low qty.
    const runningLow = items.filter(it => it.qty <= 1 && (it.unit === 'pcs' || it.unit === 'packet' || it.unit === 'bunch'));
    const wasted = state.itemsWasted || 0;
    if (runningLow.length === 0 && wasted === 0) return null;
    if (runningLow.length > 0) {
      const names = runningLow.slice(0, 3).map(it => it.name).join(', ');
      return {
        title: 'Running low 🛒',
        body: `${names} are getting low. Add to your shopping list?`,
        url: '/?tab=restock',
      };
    }
    return null;
  }

  // Unknown slot
  return null;
}

export async function GET(req: NextRequest) {
  // Auth — Vercel Cron sets this header. Browsers/random clients can't.
  const auth = req.headers.get('authorization') || '';
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
  }

  // Lazy-import web-push (CJS interop).
  const wp = (await import('web-push')).default ?? (await import('web-push'));
  wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Pull every subscription. Volume should stay small enough to fit in one
  // page (push_subscriptions is a tiny table). For larger scale, paginate.
  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription, user_id, notif_times, timezone, state');
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

  let fired = 0;
  let skipped = 0;
  let removed = 0;
  const errors: string[] = [];

  // Pre-load app states for all users we have subs for. Saves N queries.
  const userIds = Array.from(new Set((subs || []).map((s: PushSubscriptionRow) => s.user_id).filter(Boolean) as string[]));
  const stateByUser = new Map<string, AppStateRow['state']>();
  if (userIds.length) {
    const { data: states } = await supabase
      .from('user_app_state')
      .select('user_id, state')
      .in('user_id', userIds);
    for (const row of states || []) stateByUser.set(row.user_id, row.state || {});
  }

  for (const s of (subs || []) as PushSubscriptionRow[]) {
    const tzNow = nowInTz(s.timezone || 'UTC');
    if (!tzNow) { skipped++; continue; }
    const nowMin = tzNow.hh * 60 + tzNow.mm;

    // Find the slot whose configured time is within ±2 minutes of now.
    const matchedSlot = Object.entries(s.notif_times || {})
      .map(([slot, hhmm]) => ({ slot, min: hhmmToMin(hhmm as string) }))
      .find(({ min }) => min !== null && Math.abs((min as number) - nowMin) <= 2);
    if (!matchedSlot) { skipped++; continue; }

    // Prefer the snapshot stored on the subscription row itself (works for
    // guest users) — fall back to the cloud-synced user_app_state for
    // signed-in users so we get the freshest data possible.
    const state = (s.user_id && stateByUser.get(s.user_id)) || s.state || {};
    // Date seed = local date in user's timezone — keeps the same variant
    // for them through one day, varies day-to-day.
    const dateSeed = `${s.endpoint.slice(-12)}-${tzNow.iso.slice(0, 10)}`;
    const payload = buildNudge(state, matchedSlot.slot, dateSeed);
    if (!payload) { skipped++; continue; }

    try {
      await wp.sendNotification(s.subscription, JSON.stringify({
        ...payload,
        tag: `fb-${matchedSlot.slot}-${tzNow.iso.slice(0, 10)}`,
      }), { TTL: 60 * 60 * 4 });
      fired++;
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      // 404/410 means the subscription is dead — remove it so we don't keep
      // pushing to a phantom endpoint forever.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        removed++;
      } else {
        errors.push(err.message || 'send failed');
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: subs?.length || 0,
    fired,
    skipped,
    removed,
    errors: errors.slice(0, 10),
  });
}
