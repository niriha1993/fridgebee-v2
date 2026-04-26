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

function buildPreviewNudge(args: {
  state: {
    items?: Array<{ name: string; expiry: string; added?: string; qty: number; unit: string }>;
    members?: Array<{ name: string; isKid?: boolean; age?: number }>;
    name?: string;
  };
  notifTimes?: Record<string, string>;
}): { title: string; body: string } {
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

  // Pick a slot to preview. Priority: morning > expiry > meal > restock —
  // but only if that slot is enabled by the user. Falls back to meal-time
  // if nothing is enabled.
  const enabledSlots = Object.keys(notifTimes);
  const previewSlot = ['morning','expiry','meal','restock'].find(s => enabledSlots.includes(s)) || 'meal';

  // ── BREAKFAST PREVIEW ─────────────────────────────────────────────────
  if (previewSlot === 'morning') {
    const breakfastHero = items.find(it => lookupRecipe(it.name, BREAKFAST_RECIPES));
    const breakfastRecipe = breakfastHero ? lookupRecipe(breakfastHero.name, BREAKFAST_RECIPES) : null;
    if (breakfastRecipe && breakfastHero) {
      if (kidName) {
        return {
          title: `Breakfast for ${kidName}? 🍳`,
          body: `Make ${breakfastRecipe} this morning — uses your ${breakfastHero.name.toLowerCase()} and ${kidName} will love it.`,
        };
      }
      return {
        title: `Good morning ☀️`,
        body: `Make ${breakfastRecipe} — uses your ${breakfastHero.name.toLowerCase()}. Tap to start cooking.`,
      };
    }
    if (expiringSoon.length > 0) {
      const head = expiringSoon[0].it.name;
      return {
        title: `${head} expires soon 🌅`,
        body: kidName
          ? `Cook with ${head} today — ${kidName} can have it for lunch or dinner.`
          : `Plan a meal around ${head} today.`,
      };
    }
    return {
      title: `Good morning ☀️`,
      body: items.length > 0
        ? `Open FridgeBee — we'll plan today's meals around what you have.`
        : `Add what you bought — FridgeBee will turn it into breakfast.`,
    };
  }

  // ── EXPIRY PREVIEW ────────────────────────────────────────────────────
  if (previewSlot === 'expiry') {
    if (expiringSoon.length === 0) {
      return { title: 'No items expiring 🌱', body: 'You\'re on top of your fridge. Nothing\'s about to spoil.' };
    }
    const head = expiringSoon[0].it.name;
    const word = expiringSoon[0].days <= 0 ? 'today' : 'tomorrow';
    const recipe = lookupRecipe(head, ITEM_TO_RECIPE);
    return {
      title: `${head} expires ${word} ⚠️`,
      body: recipe ? `Cook ${recipe} ${kidName ? `for ${kidName}` : 'tonight'} — uses it up perfectly.` : 'Make something with it before it goes bad.',
    };
  }

  // ── RESTOCK PREVIEW ───────────────────────────────────────────────────
  if (previewSlot === 'restock') {
    const lowItems = items.filter(it => it.qty <= 1);
    if (lowItems.length === 0) {
      return { title: 'Fridge looks stocked 🛒', body: 'Nothing running low right now.' };
    }
    return {
      title: 'Running low 🛒',
      body: `${lowItems.slice(0, 3).map(it => it.name).join(', ')} are getting low. Add to your shopping list?`,
    };
  }

  // ── MEAL PREVIEW (default / dinner) ──────────────────────────────────
  if (kidName) {
    const hero = expiringSoon[0]?.it || items[0];
    const recipe = lookupRecipe(hero?.name, ITEM_TO_RECIPE);
    return {
      title: `What's ${kidName} eating tonight? 🍳`,
      body: recipe
        ? `${recipe} — kid-safe and uses your ${hero?.name?.toLowerCase() || 'fridge'}.`
        : `Pick something ${kidName} will love — open FridgeBee.`,
    };
  }
  if (expiringSoon.length > 0) {
    const head = expiringSoon[0].it.name;
    const word = expiringSoon[0].days <= 0 ? 'today' : 'tomorrow';
    const recipe = lookupRecipe(head, ITEM_TO_RECIPE);
    return {
      title: `${head} expires ${word} 🍳`,
      body: recipe ? `Try ${recipe} tonight — uses it up.` : 'Tap for a recipe that uses it.',
    };
  }
  if (items.length > 0) {
    const hero = items[0];
    const recipe = lookupRecipe(hero.name, ITEM_TO_RECIPE);
    return {
      title: `Time for dinner? 🍳`,
      body: recipe ? `${recipe} — uses your ${hero.name.toLowerCase()}.` : 'Open FridgeBee for tonight\'s plan.',
    };
  }
  return {
    title: 'FridgeBee 🐝',
    body: 'Test notification — push is working! Add items to your fridge to see real nudges.',
  };
}

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
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
    });

    const wp = (await import('web-push')).default ?? (await import('web-push'));
    wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    await wp.sendNotification(
      row.subscription as { endpoint: string; keys: { p256dh: string; auth: string } },
      JSON.stringify({
        ...payload,
        url: '/?tab=meals',
        tag: `fb-test-${Date.now()}`,
      }),
      { TTL: 60 },
    );
    return NextResponse.json({ ok: true, preview: payload });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
