// app/api/push-test/route.ts
//
// Fire a single test push to the caller's subscription. Used by the
// "Send test notification" button in Profile so users can verify end-to-end
// that pushes work AND see what their real personalised nudge will look like.
//
// We re-use the same buildNudge() the cron uses, so the test payload is
// indistinguishable from a real one.
//
// Body: { endpoint: string }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 15;

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@fridgebee.app';

// Recipe lookups — same maps the cron uses. Kept inline here to avoid a
// circular import when both routes are built together.
const BREAKFAST_RECIPES: Record<string, string> = {
  poha: 'Poha', sooji: 'Suji Upma', rava: 'Suji Upma', oats: 'Oatmeal',
  besan: 'Besan Chilla', atta: 'Aloo Paratha', maida: 'Pancakes',
  bread: 'French Toast', eggs: 'Masala Omelette', egg: 'Masala Omelette',
  paneer: 'Paneer Bhurji', yogurt: 'Yogurt Parfait', curd: 'Curd Rice',
  milk: 'Cornflakes', banana: 'Banana Pancakes', mango: 'Mango Smoothie',
  apple: 'Apple Cinnamon Oatmeal', berries: 'Berry Smoothie Bowl',
  vermicelli: 'Vermicelli Upma', sabudana: 'Sabudana Khichdi',
  'idli rava': 'Idli',
  // Indian halwas — sweet, kid-friendly breakfasts
  'sweet potato': 'Sweet Potato Halwa', shakarkandi: 'Sweet Potato Halwa',
  carrot: 'Gajar Halwa', gajar: 'Gajar Halwa',
  pumpkin: 'Pumpkin Halwa', almond: 'Badam Halwa', badam: 'Badam Halwa',
  beetroot: 'Beetroot Halwa',
  // Veg parathas / chillas / uttapams
  spinach: 'Palak Paratha', methi: 'Methi Thepla',
  potato: 'Aloo Paratha', tomato: 'Tomato Uttapam', onion: 'Onion Uttapam',
  cabbage: 'Cabbage Paratha', cauliflower: 'Gobi Paratha',
  avocado: 'Avocado Toast', cheese: 'Cheese Toast',
};
const ITEM_TO_RECIPE: Record<string, string> = {
  spinach: 'Palak Paneer', palak: 'Palak Paneer', methi: 'Aloo Methi',
  paneer: 'Paneer Butter Masala', tomato: 'Pasta Pomodoro', tomatoes: 'Pasta Pomodoro',
  cabbage: 'Cabbage Stir-fry', capsicum: 'Mixed Veg Sabzi', 'bell pepper': 'Mixed Veg Sabzi',
  bhindi: 'Bhindi Masala', okra: 'Bhindi Masala',
  brinjal: 'Baingan Bharta', eggplant: 'Baingan Bharta',
  lauki: 'Lauki Sabzi', carrot: 'Carrot Soup',
  potato: 'Aloo Sabzi', mushroom: 'Mushroom Risotto',
  eggs: 'Scrambled Eggs on Toast', chicken: 'Chicken Curry',
  fish: 'Pan-fried Fish', pork: 'Pork Belly Rice Bowl',
  'pork belly': 'Pork Belly Rice Bowl', tofu: 'Tofu Stir-fry',
  rice: 'Vegetable Fried Rice', pasta: 'Pasta Pomodoro',
  dal: 'Dal Tadka', lentils: 'Dal Tadka',
};
function lookupRecipe(name: string | undefined, table: Record<string, string>): string | null {
  if (!name) return null;
  const lc = name.toLowerCase().trim();
  if (table[lc]) return table[lc];
  for (const [k, r] of Object.entries(table)) {
    if (lc.includes(k) || k.includes(lc)) return r;
  }
  return null;
}

// Strip generic qualifier suffixes from item names so the body reads cleanly.
// Fridge UI lets users type things like "Onions India" / "Bell Pepper Red" /
// "Banana Organic" — useful for shopping but ugly in a notification body.
// Returns just the hero noun (or pair).
const QUALIFIER_TAIL_WORDS = new Set([
  'india','indian','uk','us','china','italy','italian','thai','korean','japanese',
  'red','green','yellow','white','black','purple','orange',
  'organic','fresh','premium','frozen','pack','packet','tin','can',
  'small','medium','large','xl','jumbo','mini',
  'sweet','sour','spicy','mild',
]);
function cleanItemName(raw: string | undefined | null): string {
  if (!raw) return '';
  const lc = raw.toLowerCase().trim();
  const parts = lc.split(/\s+/);
  // Drop trailing qualifier words greedily — "onions india" → "onions",
  // "bell pepper red organic" → "bell pepper".
  while (parts.length > 1 && QUALIFIER_TAIL_WORDS.has(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(' ');
}

function buildPreviewNudge(args: {
  state: {
    items?: Array<{ name: string; expiry: string; added?: string; qty: number; unit: string }>;
    members?: Array<{ name: string; isKid?: boolean; age?: number }>;
    name?: string;
  };
  notifTimes?: Record<string, string>;
  forcedSlot?: string | null;
}): { title: string; body: string; recipe?: string | null } {
  const { state } = args;
  const notifTimes = args.notifTimes || {};
  const items = state.items || [];
  const members = state.members || [];
  const today = new Date();
  const dayMs = 86400000;

  const expiringSoon = items
    .map(it => {
      const expiry = new Date(it.expiry + 'T00:00:00');
      return { it, days: Math.ceil((expiry.getTime() - today.getTime()) / dayMs) };
    })
    .filter(({ days }) => days <= 2)
    .sort((a, b) => a.days - b.days);

  const kid = members.find(m => m.isKid || (m.age != null && m.age < 12));
  const kidName = kid?.name?.trim() || null;

  // Slot resolution priority:
  //   1. `forcedSlot` (caller explicitly requested) — must match a known slot,
  //      otherwise we fall through. This is what the Profile per-slot test
  //      buttons use, so "test restock" actually shows restock copy.
  //   2. The current time-of-day → closest configured slot. This makes a
  //      generic "Send test" feel like the live notification a user would
  //      actually receive at this hour.
  //   3. Fallback to meal-time.
  const KNOWN_SLOTS = ['morning','expiry','meal','restock'];
  const enabledSlots = Object.keys(notifTimes).filter(s => KNOWN_SLOTS.includes(s));
  let previewSlot: string;
  if (args.forcedSlot && KNOWN_SLOTS.includes(args.forcedSlot)) {
    previewSlot = args.forcedSlot;
  } else if (enabledSlots.length === 1) {
    // Only one slot enabled — obviously test that.
    previewSlot = enabledSlots[0];
  } else if (enabledSlots.length > 1) {
    // Pick the slot whose configured time is closest to "now" so the test
    // mirrors what would actually fire today.
    const nowMin = today.getHours() * 60 + today.getMinutes();
    const distance = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      const t = (h || 0) * 60 + (m || 0);
      return Math.min(Math.abs(t - nowMin), 1440 - Math.abs(t - nowMin));
    };
    previewSlot = enabledSlots
      .map(s => ({ s, d: distance(notifTimes[s] || '08:00') }))
      .sort((a, b) => a.d - b.d)[0].s;
  } else {
    previewSlot = 'meal';
  }

  // ── BREAKFAST PREVIEW ─────────────────────────────────────────────────
  if (previewSlot === 'morning') {
    const breakfastHero = items.find(it => lookupRecipe(it.name, BREAKFAST_RECIPES));
    const breakfastRecipe = breakfastHero ? lookupRecipe(breakfastHero.name, BREAKFAST_RECIPES) : null;
    if (breakfastRecipe && breakfastHero) {
      const heroClean = cleanItemName(breakfastHero.name);
      if (kidName) {
        return {
          title: `Breakfast for ${kidName}? 🍳`,
          body: `Make ${breakfastRecipe} this morning — uses your ${heroClean} and ${kidName} will love it.`,
          recipe: breakfastRecipe,
        };
      }
      return {
        title: `Good morning ☀️`,
        body: `Make ${breakfastRecipe} — uses your ${heroClean}. Tap to start cooking.`,
        recipe: breakfastRecipe,
      };
    }
    if (expiringSoon.length > 0) {
      const headClean = cleanItemName(expiringSoon[0].it.name);
      const fallbackRecipe = lookupRecipe(expiringSoon[0].it.name, ITEM_TO_RECIPE);
      return {
        title: `${headClean} expires soon 🌅`,
        body: kidName
          ? `Cook with ${headClean} today — ${kidName} can have it for lunch or dinner.`
          : `Plan a meal around ${headClean} today.`,
        recipe: fallbackRecipe,
      };
    }
    return {
      title: `Good morning ☀️`,
      body: items.length > 0
        ? `Open FridgeBee — we'll plan today's meals around what you have.`
        : `Add what you bought — FridgeBee will turn it into breakfast.`,
      recipe: null,
    };
  }

  // ── EXPIRY PREVIEW ────────────────────────────────────────────────────
  if (previewSlot === 'expiry') {
    if (expiringSoon.length === 0) {
      return { title: 'No items expiring 🌱', body: 'You\'re on top of your fridge. Nothing\'s about to spoil.', recipe: null };
    }
    const headClean = cleanItemName(expiringSoon[0].it.name);
    const word = expiringSoon[0].days <= 0 ? 'today' : 'tomorrow';
    const recipe = lookupRecipe(expiringSoon[0].it.name, ITEM_TO_RECIPE);
    return {
      title: `${headClean} expires ${word} ⚠️`,
      body: recipe ? `Cook ${recipe} ${kidName ? `for ${kidName}` : 'tonight'} — uses it up perfectly.` : 'Make something with it before it goes bad.',
      recipe,
    };
  }

  // ── RESTOCK PREVIEW ───────────────────────────────────────────────────
  if (previewSlot === 'restock') {
    const lowItems = items.filter(it => it.qty <= 1);
    if (lowItems.length === 0) {
      return { title: 'Fridge looks stocked 🛒', body: 'Nothing running low right now.', recipe: null };
    }
    return {
      title: 'Running low 🛒',
      body: `${lowItems.slice(0, 3).map(it => cleanItemName(it.name)).join(', ')} are getting low. Add to your shopping list?`,
      recipe: null,
    };
  }

  // ── MEAL PREVIEW (default / dinner) ──────────────────────────────────
  if (kidName) {
    const hero = expiringSoon[0]?.it || items[0];
    const recipe = lookupRecipe(hero?.name, ITEM_TO_RECIPE);
    const heroClean = cleanItemName(hero?.name) || 'fridge';
    return {
      title: `What's ${kidName} eating tonight? 🍳`,
      body: recipe
        ? `${recipe} — kid-safe and uses your ${heroClean}.`
        : `Pick something ${kidName} will love — open FridgeBee.`,
      recipe,
    };
  }
  if (expiringSoon.length > 0) {
    const headClean = cleanItemName(expiringSoon[0].it.name);
    const word = expiringSoon[0].days <= 0 ? 'today' : 'tomorrow';
    const recipe = lookupRecipe(expiringSoon[0].it.name, ITEM_TO_RECIPE);
    return {
      title: `${headClean} expires ${word} 🍳`,
      body: recipe ? `Try ${recipe} tonight — uses it up.` : 'Tap for a recipe that uses it.',
      recipe,
    };
  }
  if (items.length > 0) {
    const hero = items[0];
    const heroClean = cleanItemName(hero.name);
    const recipe = lookupRecipe(hero.name, ITEM_TO_RECIPE);
    return {
      title: `Time for dinner? 🍳`,
      body: recipe ? `${recipe} — uses your ${heroClean}.` : 'Open FridgeBee for tonight\'s plan.',
      recipe,
    };
  }
  return {
    title: 'FridgeBee 🐝',
    body: 'Test notification — push is working! Add items to your fridge to see real nudges.',
    recipe: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { endpoint, slot } = await req.json();
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
    }
    if (!VAPID_PRIVATE) {
      return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    const { data: row, error } = await supabase
      .from('push_subscriptions')
      .select('subscription, user_id, state, notif_times')
      .eq('endpoint', endpoint)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row?.subscription) return NextResponse.json({ error: 'subscription not found' }, { status: 404 });

    // Build a real-style preview using the user's actual fridge + family.
    // Prefer the snapshot stored on this subscription (works for guests too);
    // fall back to user_app_state for signed-in users when the snapshot is
    // empty (older subscriptions before this column existed).
    type PreviewState = NonNullable<Parameters<typeof buildPreviewNudge>[0]>['state'];
    let stateForPreview: PreviewState = (row.state as PreviewState) || {};
    const hasItems = Array.isArray(stateForPreview.items) && stateForPreview.items.length > 0;
    if (!hasItems && row.user_id) {
      const { data: stateRow } = await supabase
        .from('user_app_state')
        .select('state')
        .eq('user_id', row.user_id)
        .maybeSingle();
      if (stateRow?.state) stateForPreview = stateRow.state as PreviewState;
    }
    const payload = buildPreviewNudge({
      state: stateForPreview,
      notifTimes: (row.notif_times as Record<string, string>) || {},
      forcedSlot: typeof slot === 'string' ? slot : null,
    });

    // Deep-link the test push to the exact recipe whenever one was suggested.
    // Restock/no-recipe paths fall back to /?tab=meals (or /?tab=restock).
    const recipeParam = payload.recipe ? `&recipe=${encodeURIComponent(payload.recipe)}` : '';
    const url = slot === 'restock' ? '/?tab=restock' : `/?tab=meals${recipeParam}`;

    const wp = (await import('web-push')).default ?? (await import('web-push'));
    wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    await wp.sendNotification(
      row.subscription as { endpoint: string; keys: { p256dh: string; auth: string } },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url,
        tag: `fb-test-${Date.now()}`,
      }),
      { TTL: 60 },
    );
    return NextResponse.json({ ok: true, preview: { title: payload.title, body: payload.body }, slotUsed: slot || null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
