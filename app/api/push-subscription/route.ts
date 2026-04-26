// app/api/push-subscription/route.ts
//
// POST   — store/refresh a Web Push subscription for this device
// DELETE — remove a subscription by endpoint (when user toggles off)
//
// Subscriptions are stored in the `push_subscriptions` table on Supabase.
// Keyed by `endpoint` (the URL the browser gives us) so re-subscribing from
// the same device just upserts. We also persist `notif_times` (which slots
// the user toggled on) and `timezone` (so the cron fires in the user's TZ).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const { subscription, userId, notifTimes, timezone, state } = await req.json();
    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'subscription required' }, { status: 400 });
    }
    // Store a trimmed snapshot of state — only the fields the cron/test push
    // actually use. Keeps row size small and avoids leaking unrelated bits.
    const trimmedState = state && typeof state === 'object' ? {
      items: Array.isArray(state.items) ? state.items.map((it: { name: string; expiry: string; qty?: number; unit?: string; added?: string }) => ({
        name: it.name, expiry: it.expiry, qty: it.qty, unit: it.unit, added: it.added,
      })) : [],
      members: Array.isArray(state.members) ? state.members.map((m: { name: string; isKid?: boolean; age?: number }) => ({
        name: m.name, isKid: m.isKid, age: m.age,
      })) : [],
      name: typeof state.name === 'string' ? state.name : '',
      cuisines: Array.isArray(state.cuisines) ? state.cuisines : [],
      itemsUsed: typeof state.itemsUsed === 'number' ? state.itemsUsed : 0,
      itemsWasted: typeof state.itemsWasted === 'number' ? state.itemsWasted : 0,
    } : {};
    const row = {
      endpoint: subscription.endpoint as string,
      subscription: subscription as Record<string, unknown>,
      user_id: typeof userId === 'string' && userId ? userId : null,
      notif_times: notifTimes && typeof notifTimes === 'object' ? notifTimes : {},
      timezone: typeof timezone === 'string' && timezone ? timezone : 'UTC',
      state: trimmedState,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db().from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
    const { error } = await db().from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
