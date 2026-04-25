'use client';
import React, { useState, useEffect, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface FoodItem {
  id: string; name: string; emoji: string;
  shelf: 'fridge' | 'freezer' | 'pantry';
  category: string; qty: number; unit: string;
  added: string; expiry: string;
  cost?: number;
  addedBy?: 'manual' | 'voice' | 'scan';
}
interface Member {
  id: string; name: string; age?: number; isKid: boolean;
  allergies: string[]; dislikes: string[]; dietaryFilters: string[];
}
interface AppState {
  onboarded: boolean; obStep: number;
  name: string; country: string;
  cuisines: string[]; customCuisine: string;
  dietaryFilters: string[]; allergies: string[];
  cookedMeals: { name: string; cookedAt: string }[];
  notifTimes: Record<string, string>; notifEnabled: boolean;
  items: FoodItem[]; members: Member[];
  wasteStreak: number; itemsUsed: number; itemsWasted: number;
  wastedByCategory: Record<string, number>;
  dislikedRecipes: string[];
  paywallClicks: Record<string, number>;
  restockItems: RestockItem[];
  restockRegion: string;
}

interface Meal {
  name: string; emoji: string; description: string;
  cookTime: number; kcal: number; protein: number;
  mealType: string; usesExpiring: boolean;
  safeFor: string[]; ingredients: string[];
  steps: string[]; tags: string[];
}

interface PlannedDayMeals {
  id: string;
  label: string;
  subtitle: string;
  meals: Meal[];
}

interface ParsedInputItem {
  item_name?: string;
  quantity?: number;
  name?: string;
  qty?: number;
  unit?: string;
  category?: string;
  emoji?: string;
  price?: number;
  shelf?: Shelf;
  expiry?: string;
}

interface RestockItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  cost?: number;
  checked: boolean;
  addedFrom?: 'manual' | 'fridge';
}

interface UserProfileRow {
  id: string;
  email: string | null;
  trial_start_date: string | null;
  trial_active: boolean | null;
  created_at?: string;
}

interface UserAppStateRow {
  user_id: string;
  state: AppState;
  created_at?: string;
  updated_at?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SHELF_LABELS: Record<string, string> = { fridge:'Fridge', freezer:'Freezer', pantry:'Pantry' };
const SHELF_ICONS: Record<string, string>  = { fridge:'🧊', freezer:'❄️', pantry:'🫙' };
const CATEGORIES = ['Dairy','Produce','Meat','Seafood','Grains','Snacks','Drinks','Condiments','Frozen','Other'];
const CAT_TINT: Record<string, string> = {
  Dairy:'#FEF3DC', Produce:'#E8F2EC', Meat:'#FDEAEA', Seafood:'#E0F2FE',
  Grains:'#FEF3C7', Snacks:'#F3E8FF', Drinks:'#DBEAFE', Condiments:'#FDFAF5',
  Frozen:'#E0F2FE', Other:'#F7F0E6',
};
const EMOJIS: Record<string, string> = {
  Dairy:'🥛', Produce:'🥦', Meat:'🥩', Seafood:'🐟', Grains:'🌾',
  Snacks:'🍿', Drinks:'🥤', Condiments:'🫙', Frozen:'🧊', Other:'📦',
};
const UNITS = ['pcs','g','kg','ml','L','cups','tbsp','tsp','lbs','oz'];
const ALLERGY_OPTIONS = ['Gluten','Dairy','Eggs','Nuts','Peanuts','Soy','Fish','Shellfish','Sesame'];
const DIETARY_OPTIONS = ['Vegetarian','Vegan','Halal','Kosher','Low-carb','Keto','Paleo'];
const KID_FILTERS = ['Spicy','Whole nuts','Raw honey','Choking hazards','Excess salt'];

const MEAL_PERIODS: Array<{ id: 'breakfast'|'lunch'|'snack'|'dinner'; label: string; time: string; emoji: string }> = [
  { id:'breakfast', label:'Breakfast', time:'7–9 AM', emoji:'☀️' },
  { id:'lunch', label:'Lunch', time:'12–2 PM', emoji:'🌤️' },
  { id:'snack', label:'Snack', time:'4–5 PM', emoji:'🍎' },
  { id:'dinner', label:'Dinner', time:'6–8 PM', emoji:'🌙' },
];
const NOTIF_OPTIONS = [
  { key:'morning', label:'Morning digest',    icon:'☀️', desc:'Daily check-in at 8 AM' },
  { key:'expiry',  label:'Expiry alerts',      icon:'⚠️', desc:'Before items expire' },
  { key:'meal',    label:'Meal suggestions',   icon:'🍳', desc:'Dinner ideas at 5 PM' },
  { key:'restock', label:'Restock reminders',  icon:'🛒', desc:'When running low' },
];
const COUNTRY_CURRENCY: Record<string, { symbol: string; name: string }> = {
  IN:{ symbol:'₹',   name:'India' },       US:{ symbol:'$',   name:'United States' },
  SG:{ symbol:'S$',  name:'Singapore' },   GB:{ symbol:'£',   name:'United Kingdom' },
  AU:{ symbol:'A$',  name:'Australia' },   MY:{ symbol:'RM',  name:'Malaysia' },
  PK:{ symbol:'₨',  name:'Pakistan' },    AE:{ symbol:'AED', name:'UAE' },
};
const CUISINE_MAP: Record<string, string[]> = {
  IN:['Indian','Chinese','Italian','Mexican','Thai','Japanese','Street Food'],
  PK:['Pakistani','Indian','Chinese','Turkish','Italian','American'],
  SG:['Chinese','Indian','Malay','Japanese','Thai','Italian'],
  AE:['Lebanese','Indian','Italian','Japanese','Turkish','Persian'],
  MY:['Malaysian','Chinese','Indian','Thai','Japanese','Italian'],
  GB:['British','Indian','Italian','Chinese','French','Thai'],
  AU:['Australian','Italian','Chinese','Thai','Indian','Japanese'],
  US:['American','Mexican','Italian','Chinese','Japanese','Indian'],
};
const ALL_CUISINES = ['Indian','Pakistani','Sri Lankan','Chinese','Japanese','Korean','Vietnamese','Thai',
  'Italian','Greek','Turkish','Lebanese','Spanish','Mexican','American','Brazilian','French',
  'German','British','Ethiopian','Nigerian','Persian','Moroccan','Malay','Australian'];
const STORAGE_KEY = 'fridgebee_v2';

// Market price estimates (base USD, scaled by country FX). Covers common globals
// plus South Asian pantry staples so price guesses feel right for users in IN/PK/SG/MY.
const ITEM_PRICES_USD: Record<string, number> = {
  // Globals
  'Eggs':3.5,'Chicken':6,'Milk':2,'Broccoli':1.5,'Garlic':0.4,'Rice':2.5,
  'Onion':0.5,'Spinach':1.5,'Tomatoes':1.5,'Tomato':1.5,'Cheese':4,'Fish':6,'Dal':2,
  'Yogurt':2,'Butter':3,'Coriander':0.5,'Bell pepper':1,'Capsicum':1,'Paneer':4,
  'Potato':0.5,'Carrot':0.5,'Lemon':0.5,'Lime':0.5,'Mango':2.5,'Juice':3,
  'Apple':1,'Banana':1,'Orange':1,'Avocado':1.5,'Grapes':3,'Berries':4,'Strawberries':4,
  'Cucumber':1,'Lettuce':1.5,'Mushrooms':2,'Cauliflower':1.5,'Cabbage':1,'Pumpkin':2,'Peas':1.5,
  'Beans':1.5,'Corn':1,'Mint':0.5,'Ginger':1,'Bread':2,'Pasta':2,'Noodles':2,'Oats':2,
  // South Asian / Indian pantry staples — base prices set so FX (US:1, IN:83, SG:1.35) yields realistic local numbers
  'Bhindi':1.5,'Okra':1.5,'Atta':2,'Maida':1.5,'Besan':2.5,'Sooji':2,'Poha':2,'Jaggery':2,'Idli rava':2,
  'Rajma':2.5,'Chole':2.5,'Chickpeas':2,'Toor dal':2,'Moong dal':2,'Urad dal':2,'Masoor dal':2,
  'Roti':2,'Curd':2,'Honey':5,'Green chilli':0.5,'Curry leaves':0.5,
  // Other proteins / specialty
  'Salmon':8,'Prawns':8,'Tofu':3,'Mutton':8,'Lamb':9,'Beef':7,'Pork':6,
  'Mozzarella':4,'Feta':5,'Tortilla':2,'Pita':2.5,'Bun':1,'Hummus':3,
};
const FX: Record<string,number> = { US:1, IN:83, SG:1.35, GB:0.79, AU:1.53, MY:4.7, PK:280, AE:3.67 };
function estimatePrice(name: string, country: string): number {
  const base = ITEM_PRICES_USD[name] ?? 2;
  const rate = FX[country] ?? 1;
  return parseFloat((base * rate).toFixed(2));
}

const INPUT_ALIASES = [
  'bhindi','okra','pumpkin','kaddu','onion','pyaaz','tomato','tamatar','potato','aloo',
  'milk','doodh','paneer','spinach','palak','coriander','dhania','gobi','cauliflower',
  'garlic','lehsun','ginger','adrak','carrot','gajar','lemon','banana','eggs','egg','bread',
  'rice','chawal','dal','lentils','chicken','fish','yogurt','curd'
];

const CATEGORY_EXPIRY: Record<string,number> = {
  Dairy:7, Produce:7, Meat:3, Seafood:2, Grains:180,
  Snacks:90, Drinks:14, Condiments:180, Frozen:90, Other:14,
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function daysFromNow(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}
function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
function expiryColor(d: number) { return d <= 2 ? 'var(--red)' : d <= 5 ? '#92400E' : 'var(--sage)'; }
function expiryBg(d: number)    { return d <= 2 ? 'var(--rl)'  : d <= 5 ? 'var(--al)'  : 'var(--sagel)'; }
async function normalizeScanImage(file: File) {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read this photo'));
      img.src = imageUrl;
    });

    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'scan';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function detectCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('Kolkata') || tz.includes('Calcutta')) return 'IN';
    if (tz.includes('Karachi'))     return 'PK';
    if (tz.includes('Singapore'))   return 'SG';
    if (tz.includes('Dubai'))       return 'AE';
    if (tz.includes('Kuala_Lumpur'))return 'MY';
    if (tz.includes('London'))      return 'GB';
    if (tz.includes('Sydney'))      return 'AU';
  } catch {}
  return 'US';
}

// Six common picks shown by default during onboarding, keyed by country.
// First 6 = "common in your area", the rest are still shown if user expands.
const QUICK_BY_COUNTRY: Record<string, string[]> = {
  IN: ['Onion','Tomato','Paneer','Dal','Coriander','Yogurt'],
  PK: ['Onion','Tomato','Yogurt','Coriander','Eggs','Bread'],
  SG: ['Eggs','Rice','Cheese','Spinach','Carrot','Tomato'],
  MY: ['Rice','Eggs','Carrot','Onion','Tomato','Spinach'],
  AE: ['Eggs','Tomato','Yogurt','Onion','Carrot','Cheese'],
  GB: ['Eggs','Milk','Bread','Cheese','Tomato','Spinach'],
  AU: ['Eggs','Milk','Bread','Cheese','Tomato','Spinach'],
  US: ['Eggs','Milk','Bread','Cheese','Tomato','Spinach'],
};

// Cuisine compass — broad regional groupings the user picks from in 1 tap.
// Each maps to the recipe-pool cuisines it should pull from.
const CUISINE_COMPASS: Array<{ id: string; emoji: string; label: string; pulls: string[] }> = [
  { id: 'Indian',        emoji: '🍛', label: 'Indian',        pulls: ['indian'] },
  { id: 'Mediterranean', emoji: '🥘', label: 'Mediterranean', pulls: ['mediterranean','italian'] },
  { id: 'Western',       emoji: '🥩', label: 'Western',       pulls: ['american','italian'] },
  { id: 'East Asian',    emoji: '🍜', label: 'East Asian',    pulls: ['asian'] },
  { id: 'Latin',         emoji: '🌮', label: 'Latin',         pulls: ['mexican'] },
];

// Diet preference quick-toggles shown during onboarding (subset of DIETARY_OPTIONS).
const DIET_QUICK = ['Vegetarian','Vegan','Halal','Other'];

// Cuisine-aware quick suggestions. Each list orders by what someone cooking
// in that style would expect to keep on hand.
const CUISINE_QUICK: Record<string, string[]> = {
  Indian:        ['Onion','Tomato','Paneer','Dal','Atta','Coriander','Yogurt','Potato','Spinach','Methi','Bhindi','Chickpeas'],
  Mediterranean: ['Tomato','Cucumber','Yogurt','Feta','Lemon','Bell pepper','Chickpeas','Pasta','Bread','Olives'],
  Western:       ['Eggs','Milk','Bread','Cheese','Tomato','Spinach','Avocado','Lettuce','Pasta','Chicken','Bell pepper','Carrot'],
  'East Asian':  ['Rice','Eggs','Tofu','Cabbage','Ginger','Garlic','Cucumber','Spring onion','Carrot','Mushrooms'],
  Latin:         ['Tomato','Onion','Avocado','Lime','Beans','Rice','Cheese','Tortilla','Bell pepper','Corn'],
};

const VEG_EXCLUDE = ['Chicken','Fish','Salmon','Prawns','Mutton','Lamb','Beef','Pork'];
const VEGAN_EXCLUDE = ['Eggs','Milk','Cheese','Butter','Yogurt','Paneer','Mozzarella','Feta'];

// Quick-pick items for onboarding — tap to add
const QUICK_ITEMS: Omit<FoodItem,'id'|'added'>[] = [
  { name:'Eggs',       emoji:'🥚', shelf:'fridge',  category:'Dairy',   qty:6,   unit:'pcs', expiry:daysFromNow(14) },
  { name:'Chicken',    emoji:'🍗', shelf:'fridge',  category:'Meat',    qty:500, unit:'g',   expiry:daysFromNow(3)  },
  { name:'Milk',       emoji:'🥛', shelf:'fridge',  category:'Dairy',   qty:1,   unit:'L',   expiry:daysFromNow(5)  },
  { name:'Broccoli',   emoji:'🥦', shelf:'fridge',  category:'Produce', qty:1,   unit:'pcs', expiry:daysFromNow(7)  },
  { name:'Garlic',     emoji:'🧄', shelf:'pantry',  category:'Produce', qty:1,   unit:'pcs', expiry:daysFromNow(30) },
  { name:'Rice',       emoji:'🍚', shelf:'pantry',  category:'Grains',  qty:2,   unit:'kg',  expiry:daysFromNow(180)},
  { name:'Onion',      emoji:'🧅', shelf:'pantry',  category:'Produce', qty:3,   unit:'pcs', expiry:daysFromNow(30) },
  { name:'Spinach',    emoji:'🥬', shelf:'fridge',  category:'Produce', qty:200, unit:'g',   expiry:daysFromNow(5)  },
  { name:'Tomatoes',   emoji:'🍅', shelf:'fridge',  category:'Produce', qty:4,   unit:'pcs', expiry:daysFromNow(7)  },
  { name:'Cheese',     emoji:'🧀', shelf:'fridge',  category:'Dairy',   qty:200, unit:'g',   expiry:daysFromNow(14) },
  { name:'Fish',       emoji:'🐟', shelf:'fridge',  category:'Seafood', qty:300, unit:'g',   expiry:daysFromNow(2)  },
  { name:'Dal',        emoji:'🫘', shelf:'pantry',  category:'Grains',  qty:500, unit:'g',   expiry:daysFromNow(180)},
  { name:'Yogurt',     emoji:'🍶', shelf:'fridge',  category:'Dairy',   qty:400, unit:'g',   expiry:daysFromNow(7)  },
  { name:'Butter',     emoji:'🧈', shelf:'fridge',  category:'Dairy',   qty:100, unit:'g',   expiry:daysFromNow(30) },
  { name:'Coriander',  emoji:'🌿', shelf:'fridge',  category:'Produce', qty:50,  unit:'g',   expiry:daysFromNow(5)  },
  { name:'Bell pepper',emoji:'🫑', shelf:'fridge',  category:'Produce', qty:2,   unit:'pcs', expiry:daysFromNow(7)  },
  { name:'Paneer',     emoji:'🧀', shelf:'fridge',  category:'Dairy',   qty:200, unit:'g',   expiry:daysFromNow(7)  },
  { name:'Potato',     emoji:'🥔', shelf:'pantry',  category:'Produce', qty:4,   unit:'pcs', expiry:daysFromNow(21) },
  { name:'Carrot',     emoji:'🥕', shelf:'fridge',  category:'Produce', qty:3,   unit:'pcs', expiry:daysFromNow(14) },
  { name:'Lemon',      emoji:'🍋', shelf:'fridge',  category:'Produce', qty:3,   unit:'pcs', expiry:daysFromNow(14) },
  { name:'Atta',       emoji:'🌾', shelf:'pantry',  category:'Grains',  qty:1,   unit:'kg',  expiry:daysFromNow(180)},
  { name:'Methi',      emoji:'🌿', shelf:'fridge',  category:'Produce', qty:1,   unit:'bunch', expiry:daysFromNow(5) },
  { name:'Bhindi',     emoji:'🥒', shelf:'fridge',  category:'Produce', qty:500, unit:'g',   expiry:daysFromNow(7) },
  { name:'Chickpeas',  emoji:'🫘', shelf:'pantry',  category:'Grains',  qty:500, unit:'g',   expiry:daysFromNow(180)},
  { name:'Tofu',       emoji:'🥡', shelf:'fridge',  category:'Meat',    qty:300, unit:'g',   expiry:daysFromNow(7) },
  { name:'Pasta',      emoji:'🍝', shelf:'pantry',  category:'Grains',  qty:500, unit:'g',   expiry:daysFromNow(365)},
  { name:'Avocado',    emoji:'🥑', shelf:'fridge',  category:'Produce', qty:2,   unit:'pcs', expiry:daysFromNow(5) },
  { name:'Lettuce',    emoji:'🥬', shelf:'fridge',  category:'Produce', qty:1,   unit:'pcs', expiry:daysFromNow(7) },
  { name:'Cucumber',   emoji:'🥒', shelf:'fridge',  category:'Produce', qty:2,   unit:'pcs', expiry:daysFromNow(7) },
  { name:'Beans',      emoji:'🫘', shelf:'pantry',  category:'Grains',  qty:500, unit:'g',   expiry:daysFromNow(365)},
];

// Build the onboarding grid based on country + selected cuisines + diet.
// Cuisine matches go first (so "Indian" lands paneer/dal/atta before generic items),
// then country defaults, then everything else, with diet exclusions applied.
function pickContextualQuickItems(country: string, cuisines: string[], diets: string[], max: number): Omit<FoodItem,'id'|'added'>[] {
  const dietsLower = diets.map(d => d.toLowerCase());
  const isVegan = dietsLower.some(d => d.includes('vegan'));
  const isVegetarian = isVegan || dietsLower.some(d => d.includes('vegetarian'));
  const exclude = new Set<string>();
  if (isVegetarian) VEG_EXCLUDE.forEach(n => exclude.add(n));
  if (isVegan) VEGAN_EXCLUDE.forEach(n => exclude.add(n));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const c of cuisines) {
    for (const name of (CUISINE_QUICK[c] || [])) {
      if (!exclude.has(name) && !seen.has(name)) { seen.add(name); ordered.push(name); }
    }
  }
  for (const name of (QUICK_BY_COUNTRY[country] || QUICK_BY_COUNTRY.US)) {
    if (!exclude.has(name) && !seen.has(name)) { seen.add(name); ordered.push(name); }
  }
  for (const it of QUICK_ITEMS) {
    if (ordered.length >= max) break;
    if (!exclude.has(it.name) && !seen.has(it.name)) { seen.add(it.name); ordered.push(it.name); }
  }
  return ordered.slice(0, max).map(name => QUICK_ITEMS.find(it => it.name === name)).filter((x): x is Omit<FoodItem,'id'|'added'> => Boolean(x));
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function BeeSVG({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 48 62" fill="none">
      <ellipse cx="24" cy="36" rx="14" ry="18" fill="#F5A623"/>
      <ellipse cx="24" cy="31" rx="13.5" ry="4"   fill="#1A1208" opacity=".72"/>
      <ellipse cx="24" cy="39" rx="13"   ry="3.5" fill="#1A1208" opacity=".72"/>
      <ellipse cx="24" cy="46" rx="10"   ry="3"   fill="#1A1208" opacity=".5"/>
      <circle  cx="24" cy="18" r="10" fill="#F5C418"/>
      <circle  cx="20" cy="16" r="2.5" fill="#fff"/><circle cx="28" cy="16" r="2.5" fill="#fff"/>
      <circle  cx="20.5" cy="16.5" r="1.3" fill="#1A1208"/><circle cx="28.5" cy="16.5" r="1.3" fill="#1A1208"/>
      <path d="M20 22 Q24 26 28 22" stroke="#B87A10" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
      <ellipse cx="10" cy="27" rx="9" ry="5" fill="#BAE6FD" opacity=".9"
        style={{transformOrigin:'18px 27px', animation:'bee-wing .18s ease-in-out infinite'}}/>
      <ellipse cx="38" cy="27" rx="9" ry="5" fill="#BAE6FD" opacity=".9"
        style={{transformOrigin:'30px 27px', animation:'bee-wing .18s ease-in-out infinite', animationDelay:'.09s'}}/>
      <line x1="20" y1="9" x2="14" y2="3" stroke="#B87A10" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="13.5" cy="2.5" r="1.5" fill="#F5A623"/>
      <line x1="28" y1="9" x2="34" y2="3" stroke="#B87A10" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="34.5" cy="2.5" r="1.5" fill="#F5A623"/>
      <path d="M24 54 L22 60 L24 57.5 L26 60 Z" fill="#B87A10"/>
    </svg>
  );
}

function Confetti() {
  const items = Array.from({length:24},(_,i) => ({
    id:i, x:4+Math.random()*92, delay:Math.random()*.9,
    dur:1.5+Math.random()*1.2, size:6+Math.random()*8,
    color:['#F5A623','#4A7C59','#F5C418','#D1FAE5','#FDEAEA','#B87A10'][i%6],
  }));
  return (
    <div id="confetti-layer" aria-hidden="true">
      {items.map(c=>(
        <div key={c.id} style={{
          position:'absolute', left:`${c.x}%`, top:'-12px',
          width:c.size, height:c.size, background:c.color,
          borderRadius:c.id%3===0?'50%':'2px',
          animation:`cfFall ${c.dur}s ${c.delay}s ease-in forwards`,
        }}/>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const INIT: AppState = {
  onboarded:false, obStep:0, name:'', country:'US',
  cuisines:[], customCuisine:'', dietaryFilters:[], allergies:[],
  cookedMeals: [],
  notifTimes:{}, notifEnabled:false,
  items:[], members:[],
  wasteStreak:0, itemsUsed:0, itemsWasted:0,
  wastedByCategory:{},
  dislikedRecipes:[],
  paywallClicks:{},
  restockItems:[], restockRegion:'',
};

type Tab = 'fridge'|'meals'|'restock'|'insights'|'profile';
type Shelf = 'fridge'|'freezer'|'pantry';
type AddMode = 'manual'|'voice'|'scan';

const supabase = createClient();

function sanitizeState(input: Partial<AppState> | null | undefined): AppState | null {
  if (!input || typeof input !== 'object') return null;
  return {
    ...INIT,
    ...input,
    cuisines: Array.isArray(input.cuisines) ? input.cuisines : [],
    dietaryFilters: Array.isArray(input.dietaryFilters) ? input.dietaryFilters : [],
    allergies: Array.isArray(input.allergies) ? input.allergies : [],
    cookedMeals: Array.isArray(input.cookedMeals) ? input.cookedMeals : [],
    notifTimes: input.notifTimes && typeof input.notifTimes === 'object' ? input.notifTimes : {},
    items: Array.isArray(input.items) ? input.items : [],
    members: Array.isArray(input.members) ? input.members : [],
    restockItems: Array.isArray(input.restockItems) ? input.restockItems : [],
    restockRegion: typeof input.restockRegion === 'string' ? input.restockRegion : '',
    wastedByCategory: input.wastedByCategory && typeof input.wastedByCategory === 'object' ? input.wastedByCategory : {},
    dislikedRecipes: Array.isArray(input.dislikedRecipes) ? input.dislikedRecipes : [],
    paywallClicks: input.paywallClicks && typeof input.paywallClicks === 'object' ? input.paywallClicks : {},
  };
}

// Name-based emoji lookup so unrecognised items don't default to 📦.
const NAME_EMOJI: Record<string, string> = {
  okra:'🥒', bhindi:'🥒', cucumber:'🥒', kheera:'🥒',
  pumpkin:'🎃', kaddu:'🎃',
  methi:'🌿', fenugreek:'🌿', drumstick:'🌿', moringa:'🌿', sahjan:'🌿',
  lauki:'🥒', dudhi:'🥒', 'bottle gourd':'🥒', karela:'🥒', 'bitter gourd':'🥒',
  tinda:'🥒', tindora:'🥒', parwal:'🥒', turai:'🥒', 'ridge gourd':'🥒',
  baingan:'🍆', brinjal:'🍆', eggplant:'🍆',
  arbi:'🥔', taro:'🥔', shakarkandi:'🍠', 'sweet potato':'🍠',
  amaranth:'🥬', cholai:'🥬', sarson:'🥬', bathua:'🥬', 'mustard greens':'🥬',
  cauliflower:'🥦', gobhi:'🥦', gobi:'🥦', broccoli:'🥦',
  cabbage:'🥬', spinach:'🥬', palak:'🥬', lettuce:'🥬',
  onion:'🧅', pyaaz:'🧅',
  tomato:'🍅', tamatar:'🍅',
  potato:'🥔', aloo:'🥔',
  carrot:'🥕', gajar:'🥕',
  capsicum:'🫑', 'bell pepper':'🫑',
  garlic:'🧄', lehsun:'🧄', ginger:'🫚', adrak:'🫚',
  lemon:'🍋', lime:'🍋', nimbu:'🍋',
  apple:'🍎', banana:'🍌', kela:'🍌',
  mango:'🥭', aam:'🥭', orange:'🍊', avocado:'🥑',
  grapes:'🍇', berries:'🫐', strawberry:'🍓', strawberries:'🍓',
  peas:'🫛', matar:'🫛', beans:'🫛', corn:'🌽',
  mushroom:'🍄', mushrooms:'🍄',
  coriander:'🌿', dhania:'🌿', cilantro:'🌿', mint:'🌿', pudina:'🌿', basil:'🌿',
  milk:'🥛', doodh:'🥛', susu:'🥛',
  paneer:'🧀', cheese:'🧀', mozzarella:'🧀', feta:'🧀',
  butter:'🧈', makhan:'🧈', yogurt:'🥣', curd:'🥣', dahi:'🥣',
  eggs:'🥚', egg:'🥚', anda:'🥚', telur:'🥚',
  chicken:'🍗', murgh:'🍗', mutton:'🥩', lamb:'🥩', beef:'🥩', pork:'🥓',
  fish:'🐟', salmon:'🐟', machli:'🐟', prawns:'🦐', shrimp:'🦐', tofu:'🥡',
  bread:'🍞', roti:'🫓', rice:'🍚', chawal:'🍚', pasta:'🍝', noodles:'🍜',
  oats:'🥣', dal:'🫘', lentils:'🫘', rajma:'🫘', chickpeas:'🫘', chana:'🫘',
  tortilla:'🫓', pita:'🫓',
};
function emojiForName(name: string) {
  const key = name.toLowerCase().trim();
  return NAME_EMOJI[key] || NAME_EMOJI[key.split(/\s+/)[0]] || '';
}

function normalizeParsedItem(it: ParsedInputItem, country: string): Partial<FoodItem> {
  const rawName = (it.name || it.item_name || '').trim();
  const name = rawName
    ? rawName.split(/\s+/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : '';
  const category = it.category || 'Other';
  // If incoming emoji is missing or is the generic package, look it up by name first.
  const incoming = (it.emoji || '').trim();
  const emoji = (!incoming || incoming === '📦' || incoming === '🟨') ? (emojiForName(name) || '📦') : incoming;
  return {
    name,
    emoji,
    shelf: it.shelf || 'fridge',
    category,
    qty: it.qty ?? it.quantity ?? 1,
    unit: it.unit || 'pcs',
    expiry: it.expiry || daysFromNow(CATEGORY_EXPIRY[category] || 7),
    cost: typeof it.price === 'number' ? it.price : estimatePrice(name, country),
  };
}

function fallbackSplitItems(input: string): string[] {
  const cleaned = input.toLowerCase().replace(/[+\n]/g, ',').replace(/\s+/g, ' ').trim();
  const explicit = cleaned.split(/,|;|\band\b|\bthen\b|\bwith\b/).map(v => v.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit;

  const words = cleaned.split(' ').filter(Boolean);
  const matched = words.filter(word => INPUT_ALIASES.includes(word));
  if (matched.length > 1) return matched;
  return cleaned ? [cleaned] : [];
}

function toEditableFallbackItems(input: string, country: string) {
  return fallbackSplitItems(input).map(line => {
    const parts = line.split(/\s+/);
    const hasQty = !isNaN(parseFloat(parts[0]));
    const rawName = (hasQty ? parts.slice(1).join(' ') : line).trim();
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
    const qty = hasQty ? parseFloat(parts[0]) : 1;
    const unit = hasQty && parts[1]?.match(/^(g|kg|ml|L|pcs|l)$/i) ? parts[1] : 'pcs';
    return {
      name,
      qty,
      unit,
      shelf:'fridge' as const,
      category:'Other',
      emoji:'📦',
      expiry: daysFromNow(7),
      cost: estimatePrice(name, country),
      addedBy:'manual' as const,
    };
  });
}

function dayPlanMeta() {
  return [
    { id:'today', label:'Today', subtitle:'Best use-now pick', dayOffset:0 },
    { id:'tomorrow', label:'Tomorrow', subtitle:'Plan ahead', dayOffset:1 },
    { id:'day-after', label:'Day after', subtitle:'Use later items', dayOffset:2 },
  ] as const;
}

// Items that are liquids/condiments and should NOT be a curry/stir-fry hero
const LIQUID_OR_CONDIMENT = new Set([
  'milk','doodh','paal','susu','juice','water','cream','butter','oil','ghee',
  'yogurt','curd','dahi','vinegar','sauce','ketchup','mayonnaise','honey',
]);
function pickHeroItem(items: FoodItem[]): FoodItem | undefined {
  return (
    items.find(it =>
      it.category !== 'Drinks' &&
      it.category !== 'Condiments' &&
      !LIQUID_OR_CONDIMENT.has(it.name.toLowerCase())
    ) || items[0]
  );
}

type FallbackRecipe = {
  name: string; emoji: string; desc: string; kcal: number; protein: number; cookTime: number;
  ingredients: string[]; steps: string[]; tags: string[];
  isVeg: boolean; isVegan: boolean;
  contains: string[];   // ['Dairy','Eggs','Gluten','Nuts','Peanuts','Fish','Shellfish','Soy','Sesame']
  cuisine: string;      // 'Indian','American','Italian','Asian','Mexican','Mediterranean','Universal'
  anchors: string[];    // primary ingredients (lowercase) — recipe wants at least one in fridge
  kidSafe?: boolean;    // optional; defaults to true. Mark false for caffeine, whole nuts, very spicy, choking hazards.
};

// Pantry staples assumed available — don't count toward fridge overlap or anchor checks.
const STAPLES = new Set(['salt','sugar','water','oil','olive oil','ghee','butter','pepper','black pepper','spices','cumin','turmeric','chilli flakes','chilli','chili','chillies','curry leaves','mustard seeds','cardamom','soy sauce','vinegar','honey','flour','wheat flour','basmati rice','rice','pasta','bread','wrap','cheese']);

const SLOT_RECIPES: Record<'breakfast'|'lunch'|'snack'|'dinner', FallbackRecipe[]> = {
  breakfast: [
    // Indian
    { name:'Veggie Omelette', emoji:'🍳', desc:'Fluffy omelette with onion, tomato and herbs.', kcal:230, protein:14, cookTime:10, ingredients:['Eggs','Onion','Tomato','Salt','Oil'], steps:['Whisk 2 eggs with a pinch of salt.','Sauté chopped onion and tomato in oil for 1 min.','Pour eggs over, cook on low until set.','Fold and serve with toast.'], tags:['quick','protein'], isVeg:true, isVegan:false, contains:['Eggs'], cuisine:'Universal', anchors:['eggs','egg','onion','tomato'] },
    { name:'Masala Oats', emoji:'🥣', desc:'Savoury Indian-style oats with veg and spices.', kcal:220, protein:8, cookTime:12, ingredients:['Oats','Onion','Carrot','Peas','Turmeric'], steps:['Heat oil, sauté onion and chopped veg 3 min.','Add 1 cup water, salt and turmeric — bring to boil.','Stir in oats, cook 4 min stirring often.','Garnish with coriander, serve hot.'], tags:['savoury','filling'], isVeg:true, isVegan:true, contains:['Gluten'], cuisine:'Indian', anchors:['oats','onion','carrot'] },
    { name:'Aloo Paratha', emoji:'🫓', desc:'Stuffed potato flatbread — classic Indian breakfast.', kcal:320, protein:9, cookTime:25, ingredients:['Wheat flour','Potato','Onion','Coriander','Spices'], steps:['Mash boiled potato with chopped onion, coriander and spices.','Roll dough, stuff with potato mix and seal.','Roll out gently into a flat round.','Cook on a hot tawa with ghee until golden on both sides.'], tags:['indian','filling'], isVeg:true, isVegan:false, contains:['Gluten','Dairy'], cuisine:'Indian', anchors:['potato','aloo'] },
    { name:'Poha', emoji:'🥘', desc:'Light flattened-rice breakfast with peanuts and curry leaves.', kcal:240, protein:6, cookTime:15, ingredients:['Poha','Onion','Mustard seeds','Curry leaves','Peanuts'], steps:['Rinse poha and drain.','Heat oil, splutter mustard seeds and curry leaves with peanuts.','Add chopped onion, sauté 2 min.','Stir in poha with salt and turmeric, cook 2 min, garnish with lemon.'], tags:['indian','light'], isVeg:true, isVegan:true, contains:['Peanuts'], cuisine:'Indian', anchors:['poha','onion'] },
    // Universal / American
    { name:'Banana Smoothie Bowl', emoji:'🍌', desc:'Creamy banana smoothie topped with fruit.', kcal:260, protein:9, cookTime:5, ingredients:['Banana','Milk','Honey','Oats','Berries'], steps:['Blend banana with milk and a spoon of honey.','Pour into a bowl.','Top with oats and chopped berries.','Serve immediately.'], tags:['no-cook','sweet'], isVeg:true, isVegan:false, contains:['Dairy','Gluten'], cuisine:'Universal', anchors:['banana','milk','oats'] },
    { name:'Avocado Toast', emoji:'🥑', desc:'Mashed avocado on toast with chilli flakes.', kcal:290, protein:7, cookTime:7, ingredients:['Bread','Avocado','Lemon','Chilli flakes','Salt'], steps:['Toast 2 slices of bread.','Mash avocado with lemon juice and salt.','Spread on toast, top with chilli flakes.','Serve right away.'], tags:['quick','vegan'], isVeg:true, isVegan:true, contains:['Gluten'], cuisine:'American', anchors:['avocado','bread'] },
    { name:'Pancakes & Berries', emoji:'🥞', desc:'Fluffy pancakes topped with seasonal berries.', kcal:340, protein:9, cookTime:15, ingredients:['Flour','Milk','Eggs','Berries','Maple syrup'], steps:['Whisk flour, milk and eggs into a smooth batter.','Cook small ladles on a non-stick pan until bubbles form, then flip.','Stack and top with berries.','Drizzle maple syrup and serve.'], tags:['american','sweet'], isVeg:true, isVegan:false, contains:['Gluten','Dairy','Eggs'], cuisine:'American', anchors:['flour','milk','eggs','egg','berries'] },
    { name:'Greek Yogurt Parfait', emoji:'🥛', desc:'Layered Greek yogurt with granola and fruit.', kcal:240, protein:14, cookTime:5, ingredients:['Greek yogurt','Granola','Berries','Honey'], steps:['Spoon yogurt into a glass.','Layer with granola and berries.','Drizzle honey.','Serve chilled.'], tags:['no-cook','protein'], isVeg:true, isVegan:false, contains:['Dairy','Gluten','Nuts'], cuisine:'Mediterranean', anchors:['yogurt','berries','granola'] },
    { name:'Veggie Scramble Wrap', emoji:'🌯', desc:'Scrambled eggs with sautéed peppers and spinach in a wrap.', kcal:310, protein:18, cookTime:12, ingredients:['Eggs','Spinach','Bell pepper','Tortilla','Cheese'], steps:['Sauté pepper and spinach in oil 2 min.','Add beaten eggs and scramble until set.','Warm a tortilla, fill with eggs and cheese.','Roll tight, slice and serve.'], tags:['protein','portable'], isVeg:true, isVegan:false, contains:['Eggs','Dairy','Gluten'], cuisine:'American', anchors:['eggs','egg','spinach','bell pepper','capsicum'] },
    { name:'Congee with Veg', emoji:'🍚', desc:'Silky rice porridge with ginger, scallion and soy.', kcal:230, protein:6, cookTime:30, ingredients:['Rice','Ginger','Scallion','Soy sauce','Sesame oil'], steps:['Simmer rice in 6x water with sliced ginger 25 min.','Stir until silky.','Top with chopped scallion.','Drizzle soy and sesame oil; serve.'], tags:['asian','comfort'], isVeg:true, isVegan:true, contains:['Soy','Sesame'], cuisine:'Asian', anchors:['rice','ginger'] },
    { name:'Shakshuka', emoji:'🍳', desc:'Eggs poached in spiced tomato pepper sauce.', kcal:280, protein:14, cookTime:25, ingredients:['Eggs','Tomato','Bell pepper','Onion','Cumin'], steps:['Sauté onion and pepper in olive oil.','Add tomato and cumin, simmer 8 min.','Make wells, crack eggs into them.','Cover and cook 5 min until whites set; serve with bread.'], tags:['mediterranean','protein'], isVeg:true, isVegan:false, contains:['Eggs'], cuisine:'Mediterranean', anchors:['eggs','egg','tomato','bell pepper','capsicum'] },
    { name:'Tofu Scramble', emoji:'🥘', desc:'Vegan scramble with turmeric and veg.', kcal:240, protein:16, cookTime:10, ingredients:['Tofu','Turmeric','Onion','Spinach','Black pepper'], steps:['Crumble tofu into a hot pan with oil.','Add turmeric, salt and pepper, stir 2 min.','Add chopped onion and spinach.','Cook 3 more min and serve.'], tags:['vegan','protein'], isVeg:true, isVegan:true, contains:['Soy'], cuisine:'Universal', anchors:['tofu','spinach','onion'] },
  ],
  lunch: [
    // Indian
    { name:'Roti & Sabzi', emoji:'🫓', desc:'Soft wheat flatbread with a quick veg curry.', kcal:360, protein:11, cookTime:25, ingredients:['Wheat flour','Mixed veg','Onion','Tomato','Spices'], steps:['Cook onion-tomato masala in oil until soft.','Add chopped veg and Indian spices, cook covered 8 min.','Make rotis from wheat dough on a hot tawa.','Serve hot together.'], tags:['indian','home-style'], isVeg:true, isVegan:true, contains:['Gluten'], cuisine:'Indian', anchors:['onion','tomato','potato','cauliflower','okra','bhindi'] },
    { name:'Khichdi', emoji:'🍲', desc:'One-pot rice and lentil comfort dish.', kcal:300, protein:12, cookTime:25, ingredients:['Rice','Yellow dal','Ghee','Cumin','Turmeric'], steps:['Rinse rice and dal together.','Heat ghee, splutter cumin.','Add rice-dal, water (3:1), turmeric, salt.','Cover and cook 20 min until very soft.'], tags:['comfort','one-pot'], isVeg:true, isVegan:false, contains:['Dairy'], cuisine:'Indian', anchors:['rice','dal','lentils'] },
    { name:'Paneer Wrap', emoji:'🌯', desc:'Spiced paneer rolled in a flatbread with veggies.', kcal:380, protein:18, cookTime:15, ingredients:['Paneer','Wrap','Onion','Bell pepper','Yogurt'], steps:['Marinate cubed paneer in yogurt and spices 10 min.','Pan-fry until lightly charred.','Warm wrap, layer with sauce, paneer and sliced veg.','Roll tight and serve.'], tags:['portable','protein'], isVeg:true, isVegan:false, contains:['Dairy','Gluten'], cuisine:'Indian', anchors:['paneer','onion','bell pepper','capsicum'] },
    // Italian
    { name:'Veg Pasta Pomodoro', emoji:'🍝', desc:'Pasta in a simple garlic-tomato sauce.', kcal:380, protein:11, cookTime:20, ingredients:['Pasta','Tomato','Garlic','Olive oil','Basil'], steps:['Boil pasta in salted water until al dente.','Sauté garlic in olive oil, add chopped tomato.','Toss pasta in the sauce.','Finish with basil and serve.'], tags:['italian','quick'], isVeg:true, isVegan:true, contains:['Gluten'], cuisine:'Italian', anchors:['pasta','tomato','garlic'] },
    { name:'Caprese Salad', emoji:'🥗', desc:'Tomato, mozzarella and basil with olive oil.', kcal:280, protein:14, cookTime:5, ingredients:['Tomato','Mozzarella','Basil','Olive oil','Salt'], steps:['Slice tomato and mozzarella thick.','Layer alternating with basil leaves.','Drizzle olive oil and salt.','Serve immediately.'], tags:['italian','no-cook'], isVeg:true, isVegan:false, contains:['Dairy'], cuisine:'Italian', anchors:['tomato','cheese','mozzarella'] },
    // American
    { name:'Grilled Cheese & Tomato Soup', emoji:'🧀', desc:'Toasted cheese sandwich with a quick tomato soup.', kcal:420, protein:16, cookTime:20, ingredients:['Bread','Cheese','Butter','Tomato','Onion'], steps:['Sauté onion, add chopped tomato, simmer 8 min, blend.','Butter bread, layer cheese, toast on a pan until golden.','Slice sandwich.','Serve with the soup.'], tags:['american','comfort'], isVeg:true, isVegan:false, contains:['Dairy','Gluten'], cuisine:'American', anchors:['bread','cheese','tomato'] },
    { name:'Cobb Salad', emoji:'🥗', desc:'Crunchy salad with chicken, egg, avocado and cheese.', kcal:420, protein:30, cookTime:15, ingredients:['Lettuce','Chicken','Eggs','Avocado','Cheese'], steps:['Boil eggs and slice chicken.','Arrange lettuce with rows of chicken, egg, avocado, cheese.','Drizzle vinaigrette.','Serve cold.'], tags:['american','protein'], isVeg:false, isVegan:false, contains:['Eggs','Dairy'], cuisine:'American', anchors:['chicken','lettuce','eggs','egg','avocado'] },
    // Asian
    { name:'Vegetable Fried Rice', emoji:'🍚', desc:'Quick fried rice using whatever veg you have.', kcal:340, protein:9, cookTime:15, ingredients:['Rice','Mixed vegetables','Soy sauce','Garlic','Oil'], steps:['Heat oil in a wok on high heat.','Add garlic, then diced vegetables and stir-fry 2 min.','Add cooked rice and soy sauce, toss well.','Serve hot, garnished with spring onion.'], tags:['asian','quick'], isVeg:true, isVegan:true, contains:['Soy'], cuisine:'Asian', anchors:['rice','carrot','peas','bell pepper'] },
    { name:'Stir-fry Noodles', emoji:'🍜', desc:'Wok-tossed noodles with vegetables and soy.', kcal:380, protein:12, cookTime:15, ingredients:['Noodles','Cabbage','Carrot','Soy sauce','Garlic'], steps:['Boil noodles per pack and drain.','Stir-fry garlic, cabbage and carrot 3 min.','Add noodles and soy sauce, toss 2 min.','Serve hot.'], tags:['asian','quick'], isVeg:true, isVegan:true, contains:['Gluten','Soy'], cuisine:'Asian', anchors:['noodles','cabbage','carrot'] },
    // Mediterranean / Mexican
    { name:'Chickpea Salad Bowl', emoji:'🥗', desc:'Protein-packed chickpea bowl with crunchy veg.', kcal:320, protein:14, cookTime:10, ingredients:['Chickpeas','Cucumber','Tomato','Lemon','Olive oil'], steps:['Drain and rinse chickpeas.','Chop cucumber and tomato, mix with chickpeas.','Dress with lemon juice, olive oil, salt and pepper.','Toss well and serve.'], tags:['mediterranean','no-cook'], isVeg:true, isVegan:true, contains:[], cuisine:'Mediterranean', anchors:['chickpeas','cucumber','tomato'] },
    { name:'Black Bean Burrito Bowl', emoji:'🌯', desc:'Rice bowl with black beans, corn and salsa.', kcal:420, protein:15, cookTime:15, ingredients:['Rice','Black beans','Corn','Tomato','Lime'], steps:['Warm beans with cumin and salt.','Spoon rice into a bowl, top with beans and corn.','Add chopped tomato and a squeeze of lime.','Serve at once.'], tags:['mexican','filling'], isVeg:true, isVegan:true, contains:[], cuisine:'Mexican', anchors:['rice','black beans','beans','corn'] },
  ],
  snack: [
    // Indian
    { name:'Masala Chai & Biscuit', emoji:'☕', desc:'Spiced milk tea served with a biscuit on the side.', kcal:140, protein:4, cookTime:7, ingredients:['Tea','Milk','Sugar','Cardamom','Ginger'], steps:['Boil water with crushed cardamom and ginger.','Add tea leaves and simmer 1 min.','Pour in milk and sugar, bring to a brief boil.','Strain into cups, serve with a biscuit.'], tags:['drink','classic'], isVeg:true, isVegan:false, contains:['Dairy'], cuisine:'Indian', anchors:['tea','milk'], kidSafe:false },
    { name:'Masala Peanuts', emoji:'🥜', desc:'Crunchy spiced peanuts with onion and lemon.', kcal:230, protein:9, cookTime:6, ingredients:['Peanuts','Onion','Lemon','Coriander','Chaat masala'], steps:['Roast peanuts dry until crisp, cool.','Toss with finely chopped onion and coriander.','Squeeze lemon and sprinkle chaat masala.','Serve immediately.'], tags:['indian','crunch'], isVeg:true, isVegan:true, contains:['Peanuts'], cuisine:'Indian', anchors:['peanuts','onion'], kidSafe:false },
    { name:'Mango Lassi', emoji:'🥭', desc:'Cool mango yogurt smoothie.', kcal:200, protein:6, cookTime:5, ingredients:['Mango','Yogurt','Milk','Sugar','Cardamom'], steps:['Blend mango chunks, yogurt and milk smooth.','Add a little sugar and cardamom.','Pour into chilled glasses.','Serve cold.'], tags:['drink','sweet'], isVeg:true, isVegan:false, contains:['Dairy'], cuisine:'Indian', anchors:['mango','yogurt','milk'] },
    // Universal
    { name:'Fruit Yogurt Cup', emoji:'🍓', desc:'Greek yogurt layered with chopped fruit and honey.', kcal:180, protein:10, cookTime:5, ingredients:['Yogurt','Berries','Banana','Honey'], steps:['Spoon yogurt into a glass.','Layer chopped fruit on top.','Drizzle honey.','Serve chilled.'], tags:['no-cook','protein'], isVeg:true, isVegan:false, contains:['Dairy'], cuisine:'Universal', anchors:['yogurt','berries','banana'] },
    { name:'Hummus & Veg Sticks', emoji:'🥕', desc:'Creamy hummus with crunchy raw veg dippers.', kcal:190, protein:7, cookTime:5, ingredients:['Hummus','Carrot','Cucumber','Bell pepper'], steps:['Cut veg into long sticks.','Spoon hummus into a small bowl.','Arrange veg around the bowl.','Serve at room temperature.'], tags:['mediterranean','no-cook'], isVeg:true, isVegan:true, contains:[], cuisine:'Mediterranean', anchors:['hummus','carrot','cucumber'] },
    { name:'Cheese & Crackers', emoji:'🧀', desc:'Sliced cheese on crackers with grapes.', kcal:240, protein:9, cookTime:3, ingredients:['Crackers','Cheese','Grapes'], steps:['Slice cheese onto crackers.','Arrange on a plate with grapes.','Serve.'], tags:['american','no-cook'], isVeg:true, isVegan:false, contains:['Dairy','Gluten'], cuisine:'American', anchors:['cheese','crackers','grapes'] },
    { name:'Bruschetta', emoji:'🥖', desc:'Toasted bread with fresh tomato and basil.', kcal:200, protein:6, cookTime:10, ingredients:['Bread','Tomato','Basil','Garlic','Olive oil'], steps:['Toast slices of bread.','Rub with raw garlic.','Top with diced tomato, basil and olive oil.','Serve right away.'], tags:['italian','no-cook'], isVeg:true, isVegan:true, contains:['Gluten'], cuisine:'Italian', anchors:['bread','tomato','basil'] },
    { name:'Edamame', emoji:'🫛', desc:'Boiled soy beans tossed with sea salt.', kcal:180, protein:14, cookTime:7, ingredients:['Edamame','Salt'], steps:['Boil edamame pods 5 min.','Drain.','Toss with sea salt.','Serve warm.'], tags:['asian','protein'], isVeg:true, isVegan:true, contains:['Soy'], cuisine:'Asian', anchors:['edamame','soy'] },
    { name:'Apple Peanut Butter', emoji:'🍎', desc:'Crisp apple slices with peanut butter.', kcal:220, protein:7, cookTime:3, ingredients:['Apple','Peanut butter'], steps:['Slice apple into wedges.','Spoon peanut butter on the side.','Dip and eat.'], tags:['american','no-cook'], isVeg:true, isVegan:true, contains:['Peanuts'], cuisine:'American', anchors:['apple','peanut butter'] },
    { name:'Trail Mix', emoji:'🥜', desc:'Mixed nuts, seeds and dried fruit.', kcal:260, protein:8, cookTime:2, ingredients:['Almonds','Cashews','Raisins','Sunflower seeds'], steps:['Combine all in a bowl.','Toss to mix.','Portion into snack-size servings.'], tags:['american','no-cook'], isVeg:true, isVegan:true, contains:['Nuts'], cuisine:'American', anchors:['almonds','cashews','nuts','raisins'], kidSafe:false },
  ],
  dinner: [
    // Indian veg
    { name:'Dal Tadka', emoji:'🫘', desc:'Tempered lentil soup — comforting evening staple.', kcal:280, protein:14, cookTime:30, ingredients:['Toor dal','Onion','Tomato','Cumin','Garlic'], steps:['Pressure-cook dal until completely soft.','In a small pan heat ghee, add cumin, garlic and dried chilli.','Pour the sizzling tadka over the cooked dal.','Season and serve with steamed rice.'], tags:['indian','comfort'], isVeg:true, isVegan:false, contains:['Dairy'], cuisine:'Indian', anchors:['dal','lentils','onion','tomato'] },
    { name:'Rajma Chawal', emoji:'🍛', desc:'Red kidney beans in tomato gravy with rice.', kcal:380, protein:15, cookTime:35, ingredients:['Rajma','Onion','Tomato','Ginger-garlic','Spices'], steps:['Cook soaked rajma in water until soft.','Make a thick onion-tomato-ginger-garlic masala.','Add rajma with cooking liquid; simmer 15 min.','Serve hot with steamed rice.'], tags:['indian','filling'], isVeg:true, isVegan:true, contains:[], cuisine:'Indian', anchors:['rajma','kidney beans','beans','onion','tomato'] },
    { name:'Veg Pulao', emoji:'🍚', desc:'Fragrant rice cooked with vegetables and whole spices.', kcal:330, protein:8, cookTime:25, ingredients:['Basmati rice','Mixed veg','Whole spices','Onion','Ghee'], steps:['Sauté whole spices and onion in ghee.','Add chopped veg, stir 3 min.','Add rinsed rice with 2x water and salt.','Cover, cook on low 15 min, fluff and serve.'], tags:['indian','one-pot'], isVeg:true, isVegan:false, contains:['Dairy'], cuisine:'Indian', anchors:['rice','carrot','peas','beans'] },
    { name:'Paneer Butter Masala', emoji:'🍛', desc:'Paneer cubes in a creamy tomato gravy.', kcal:420, protein:18, cookTime:30, ingredients:['Paneer','Tomato','Cream','Butter','Cashews'], steps:['Blend tomato with soaked cashews.','Cook the puree in butter until thick.','Add cream and seasonings.','Add paneer cubes, simmer 5 min and serve.'], tags:['indian','rich'], isVeg:true, isVegan:false, contains:['Dairy','Nuts'], cuisine:'Indian', anchors:['paneer','tomato'] },
    { name:'Bhindi Masala', emoji:'🫛', desc:'Sautéed okra with onions and Indian spices.', kcal:220, protein:5, cookTime:25, ingredients:['Okra','Onion','Tomato','Cumin','Turmeric'], steps:['Slice okra into rounds.','Heat oil, splutter cumin, add onion and cook till golden.','Add tomato and spices, then okra.','Sauté uncovered 12 min until tender, serve with roti.'], tags:['indian','dry'], isVeg:true, isVegan:true, contains:[], cuisine:'Indian', anchors:['okra','bhindi','onion','tomato'] },
    // Indian non-veg
    { name:'Chicken Curry', emoji:'🍛', desc:'Classic home-style chicken curry.', kcal:400, protein:30, cookTime:40, ingredients:['Chicken','Onion','Tomato','Yogurt','Spices'], steps:['Marinate chicken in yogurt and spices for 20 min.','Cook onion-tomato-garlic masala until oil separates.','Add chicken, cook 10 min on medium.','Cover and simmer 15 min until tender; serve with rice.'], tags:['indian','protein'], isVeg:false, isVegan:false, contains:['Dairy'], cuisine:'Indian', anchors:['chicken'] },
    { name:'Fish Curry & Rice', emoji:'🐟', desc:'Light tomato-based fish curry over rice.', kcal:340, protein:26, cookTime:25, ingredients:['Fish','Onion','Tomato','Coconut milk','Curry leaves'], steps:['Coat fish lightly in turmeric and salt.','Cook onion-tomato-curry-leaf masala.','Add a splash of coconut milk; gently slide in fish.','Simmer 8 min on low; serve over rice.'], tags:['indian','coastal'], isVeg:false, isVegan:false, contains:['Fish'], cuisine:'Indian', anchors:['fish'] },
    // Italian
    { name:'Pasta Marinara', emoji:'🍝', desc:'Pasta in a chunky tomato-basil sauce.', kcal:400, protein:13, cookTime:20, ingredients:['Pasta','Tomato','Garlic','Basil','Olive oil'], steps:['Boil pasta in salted water until al dente.','Sauté garlic in olive oil, add crushed tomato, simmer 10 min.','Add fresh basil and salt to taste.','Toss pasta in sauce and serve.'], tags:['italian','classic'], isVeg:true, isVegan:true, contains:['Gluten'], cuisine:'Italian', anchors:['pasta','tomato','garlic'] },
    // American
    { name:'Roast Chicken & Veg', emoji:'🍗', desc:'Pan-roasted chicken with seasoned vegetables.', kcal:480, protein:36, cookTime:45, ingredients:['Chicken','Potato','Carrot','Garlic','Rosemary'], steps:['Season chicken with salt, pepper, garlic and rosemary.','Arrange in a tray with chopped potato and carrot.','Roast at 200°C/400°F for 35 min until cooked through.','Rest 5 min before serving.'], tags:['american','protein'], isVeg:false, isVegan:false, contains:[], cuisine:'American', anchors:['chicken','potato','carrot'] },
    { name:'Veggie Burger', emoji:'🍔', desc:'Bean patty in a bun with lettuce and cheese.', kcal:430, protein:18, cookTime:20, ingredients:['Bean patty','Bun','Lettuce','Tomato','Cheese'], steps:['Pan-fry bean patty 3 min each side.','Toast the bun.','Layer lettuce, patty, cheese and tomato.','Close and serve with sides.'], tags:['american','filling'], isVeg:true, isVegan:false, contains:['Gluten','Dairy'], cuisine:'American', anchors:['beans','lettuce','bun','bread'] },
    // Asian
    { name:'Vegetable Stir-fry & Rice', emoji:'🥦', desc:'Crisp veg stir-fry over steamed rice.', kcal:340, protein:9, cookTime:25, ingredients:['Mixed veg','Garlic','Soy sauce','Sesame oil','Rice'], steps:['Cook rice and keep hot.','Heat oil on high, sauté garlic, add chopped veg.','Stir-fry 5 min, season with soy sauce.','Spoon over rice and finish with sesame oil.'], tags:['asian','quick'], isVeg:true, isVegan:true, contains:['Soy','Sesame'], cuisine:'Asian', anchors:['rice','broccoli','carrot','bell pepper','peas'] },
    { name:'Tofu Stir-fry', emoji:'🥢', desc:'Crispy tofu with greens in soy-ginger sauce.', kcal:360, protein:22, cookTime:20, ingredients:['Tofu','Bok choy','Ginger','Garlic','Soy sauce'], steps:['Press and cube tofu.','Pan-fry until crisp on all sides.','Stir-fry ginger, garlic and bok choy.','Combine, splash soy sauce, serve over rice.'], tags:['asian','vegan-protein'], isVeg:true, isVegan:true, contains:['Soy'], cuisine:'Asian', anchors:['tofu','bok choy','spinach'] },
    // Mediterranean / Mexican
    { name:'Greek Salad with Pita', emoji:'🥗', desc:'Cucumber, tomato, olives and feta with warm pita.', kcal:340, protein:12, cookTime:10, ingredients:['Cucumber','Tomato','Olives','Feta','Pita'], steps:['Chop cucumber and tomato into chunks.','Toss with olives and crumbled feta.','Dress with olive oil, lemon and oregano.','Serve with warm pita.'], tags:['mediterranean','no-cook'], isVeg:true, isVegan:false, contains:['Dairy','Gluten'], cuisine:'Mediterranean', anchors:['cucumber','tomato','feta','olives','pita'] },
    { name:'Black Bean Tacos', emoji:'🌮', desc:'Soft tacos with seasoned black beans and salsa.', kcal:380, protein:14, cookTime:20, ingredients:['Tortilla','Black beans','Avocado','Salsa','Lime'], steps:['Warm beans with cumin, paprika and salt.','Heat tortillas on a dry pan.','Fill with beans, mashed avocado and salsa.','Squeeze lime and serve.'], tags:['mexican','filling'], isVeg:true, isVegan:true, contains:['Gluten'], cuisine:'Mexican', anchors:['black beans','beans','tortilla','avocado'] },
  ],
};

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function ingredientMatchesFridge(ing: string, fridgeWords: Set<string>) {
  const w = ing.toLowerCase().trim();
  if (STAPLES.has(w)) return false;
  for (const f of fridgeWords) {
    if (w === f || w.includes(f) || f.includes(w)) return true;
  }
  return false;
}

function buildFallbackMealsForDay(
  items: FoodItem[],
  mealType: string,
  safeName?: string,
  dayOffset = 0,
  cuisines: string[] = [],
  dietaryFilters: string[] = [],
  allergies: string[] = [],
) {
  const slot = (['breakfast','lunch','snack','dinner'].includes(mealType) ? mealType : 'dinner') as 'breakfast'|'lunch'|'snack'|'dinner';
  const pool = SLOT_RECIPES[slot];

  const dietsLower = dietaryFilters.map(d => d.toLowerCase());
  const isVegan = dietsLower.some(d => d.includes('vegan'));
  const isVegetarian = isVegan || dietsLower.some(d => d.includes('vegetarian')) || dietsLower.includes('jain');
  const allergyLower = allergies.map(a => a.toLowerCase());

  // Expand compass groupings to specific recipe cuisines.
  const expanded = new Set<string>();
  for (const c of cuisines) {
    const lc = c.toLowerCase();
    expanded.add(lc);
    const compass = CUISINE_COMPASS.find(g => g.id.toLowerCase() === lc);
    if (compass) compass.pulls.forEach(p => expanded.add(p));
  }
  const cuisinesLower = Array.from(expanded);

  const fridgeWords = new Set(
    items.flatMap(it => it.name.toLowerCase().split(/\s+/).filter(w => w.length >= 3))
  );
  // Also add the full lowercased item name so multi-word matches work.
  items.forEach(it => fridgeWords.add(it.name.toLowerCase()));

  // Hard filters: diet + allergies
  let candidates = pool.filter(r => {
    if (isVegan && !r.isVegan) return false;
    if (isVegetarian && !r.isVeg) return false;
    if (allergyLower.length && r.contains.some(c => allergyLower.includes(c.toLowerCase()))) return false;
    return true;
  });

  // Soft filter: prefer recipes whose cuisine matches user prefs (Universal always passes).
  if (cuisinesLower.length) {
    const preferred = candidates.filter(r => {
      const c = r.cuisine.toLowerCase();
      return c === 'universal' || cuisinesLower.includes(c);
    });
    if (preferred.length >= 3) candidates = preferred;
  }

  if (!candidates.length) candidates = pool.filter(r => (isVegetarian ? r.isVeg : true)); // last resort

  // Score: ingredient overlap with fridge + anchor present in fridge.
  const scored = candidates.map(r => {
    let score = 0;
    let anchorHit = false;
    for (const a of r.anchors) {
      if (ingredientMatchesFridge(a, fridgeWords)) { anchorHit = true; score += 3; break; }
    }
    for (const ing of r.ingredients) {
      if (ingredientMatchesFridge(ing, fridgeWords)) score += 1;
    }
    return { r, score, anchorHit };
  });

  // Hard requirement: the recipe's primary anchor MUST be in the fridge.
  // No more "Mango Lassi" suggestions when the user has no mango.
  // If the fridge is empty, fall back to anything in the slot pool so the user
  // sees something rather than an empty screen.
  const anchorMatches = scored.filter(s => s.anchorHit);
  const pickFrom = anchorMatches.length > 0
    ? anchorMatches
    : (fridgeWords.size === 0 ? scored : []);

  // Sort: highest score first, stable hash tiebreak so output is deterministic per slot/day.
  pickFrom.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return hashStr(`${a.r.name}|${dayOffset}|${slot}`) - hashStr(`${b.r.name}|${dayOffset}|${slot}`);
  });

  const picks = pickFrom.slice(0, 3).map(s => s.r);
  return picks.map((r, idx) => ({
    name: r.name,
    emoji: r.emoji,
    description: r.desc,
    cookTime: r.cookTime,
    kcal: r.kcal,
    protein: r.protein,
    mealType: slot,
    usesExpiring: idx === 0 && items.some(it => daysUntil(it.expiry) <= 3),
    // Only mark a dish kid-safe when the recipe is actually appropriate for toddlers.
    // Default kidSafe = true, but caffeinated drinks, whole nuts, very spicy or choking-hazard
    // dishes set kidSafe: false explicitly.
    safeFor: (r.kidSafe !== false) && safeName ? [safeName] : [],
    ingredients: r.ingredients,
    steps: r.steps,
    tags: r.tags,
  }));
}

async function withTimeout<T>(promise: PromiseLike<T>, label: string, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Paywall upsell — beta CTA. URL is env-configurable so the team can swap the
// Kafe link without redeploying. Click is tracked into AppState.paywallClicks
// keyed by `trigger` so we know which placement converted.
function PaywallChip({
  trigger,
  label,
  sublabel,
  compact,
  onTrack,
}: {
  trigger: string;
  label: string;
  sublabel?: string;
  compact?: boolean;
  onTrack: () => void;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_KAFE_URL || 'https://kafe.ai/p/fridgebee-pro';
  const sep = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${sep}from=${encodeURIComponent(trigger)}`;
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer" onClick={onTrack}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: compact ? '8px 12px' : '11px 13px',
        borderRadius: 14,
        background: 'linear-gradient(180deg, #FFF9EF 0%, #FFF1D8 100%)',
        border: '1.5px solid #F5C44E',
        textDecoration: 'none', color: 'var(--ink)',
        cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: '0 2px 6px rgba(245,166,35,.18)',
      }}
    >
      <span style={{ fontSize: compact ? 16 : 20, lineHeight: 1, flexShrink: 0 }}>🐝</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: compact ? 12 : 13, color: 'var(--ink)', lineHeight: 1.2 }}>{label}</div>
        {sublabel ? <div style={{ fontSize: compact ? 10 : 11, color: 'var(--mu)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sublabel}</div> : null}
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color: '#C0392B', flexShrink: 0, letterSpacing: '.4px' }}>30% OFF →</span>
    </a>
  );
}

function ProfileSection({
  isOpen,
  onToggle,
  title,
  extra,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  title: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{title}</div>
          {extra ? <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>{extra}</div> : null}
        </div>
        <span style={{ fontSize: 18, color: 'var(--mu)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s ease' }}>›</span>
      </button>
      {isOpen ? <div style={{ marginTop: 14 }}>{children}</div> : null}
    </div>
  );
}

export default function FridgeBee() {
  const [s, setS] = useState<AppState>(INIT);
  const [tab, setTab]             = useState<Tab>('fridge');
  const [shelf, setShelf]         = useState<Shelf>('fridge');
  const [showAdd, setShowAdd]     = useState(false);
  const [showFAB, setShowFAB]     = useState(false);
  const [editItem, setEditItem]   = useState<FoodItem|null>(null);
  const [cookItem, setCookItem]   = useState<FoodItem|null>(null);
  const [addMode, setAddMode]     = useState<AddMode>('manual');
  const [toast, setToast]         = useState('');
  const [confetti, setConfetti]   = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [parsed, setParsed]       = useState<Partial<FoodItem>[]>([]);
  const [scanFile, setScanFile]   = useState<File|null>(null);
  const [scanning, setScanning]   = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [addCount, setAddCount]   = useState(0);
  const [editMember, setEditMember] = useState<Member|null>(null);
  const [showMember, setShowMember] = useState(false);
  const [obPicks, setObPicks] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [fridgeView, setFridgeView] = useState<'list' | 'grid'>('list');
  const [parsedEditable, setParsedEditable] = useState<Partial<FoodItem>[]>([]);
  const [showManualTypeFallback, setShowManualTypeFallback] = useState(false);
  const [af, setAf] = useState({ name:'', emoji:'🥦', shelf:'fridge' as Shelf, category:'Produce', qty:'1', unit:'pcs', expiry:daysFromNow(7) });
  const [listView, setListView] = useState(false);
  const [activeProfile, setActiveProfile] = useState('me');
  const [cookDoneItem, setCookDoneItem] = useState<FoodItem|null>(null);
  const [cookConfirmed, setCookConfirmed] = useState(false);
  const [cookChoice, setCookChoice] = useState('');
  const [recipeScreen, setRecipeScreen] = useState<Meal|null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [plannedDays, setPlannedDays] = useState<PlannedDayMeals[]>([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [mealsViewMode, setMealsViewMode] = useState<'time'|'days'>('time');
  const [selectedPlanDay, setSelectedPlanDay] = useState<'today'|'tomorrow'|'day-after'>('today');
  const [mealPeriod, setMealPeriod] = useState<'breakfast'|'lunch'|'snack'|'dinner'>(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 18) return 'snack';
    return 'dinner';
  });
  const [itemQtyEdit, setItemQtyEdit] = useState<Record<string,number>>({});
  const [restockInput, setRestockInput] = useState('');
  const [localReady, setLocalReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'signup'|'signin'>('signup');
  const [emailMode, setEmailMode] = useState<'password'|'magic'>('password');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [openProfileSections, setOpenProfileSections] = useState({
    about: true,
    account: true,
    household: true,
    notifications: false,
    share: false,
    settings: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const typeTextRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef   = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const initialLocalStateRef = useRef<AppState>(INIT);
  const cloudHydratedUserRef = useRef<string | null>(null);

  // Load
  useEffect(() => {
    try {
      const country = detectCountry();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeState(JSON.parse(raw));
        if (parsed) {
          initialLocalStateRef.current = parsed;
          setS(parsed);
        }
      } else {
        const next = { ...INIT, country };
        initialLocalStateRef.current = next;
        setS(next);
      }
      setAddCount(parseInt(localStorage.getItem('fb_add_cnt')||'0'));
    } catch {}
    setLocalReady(true);
  }, []);

  // Save
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, [s]);

  useEffect(() => {
    if (!authUser) initialLocalStateRef.current = s;
  }, [authUser, s]);

  useEffect(() => {
    if (activeProfile === 'me') {
      setOpenProfileSections(prev => ({ ...prev, about: true }));
      return;
    }
    setOpenProfileSections(prev => ({ ...prev, household: true }));
  }, [activeProfile]);

  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSession(data.session);
      setAuthUser(data.session?.user ?? null);
      setAuthEmail(data.session?.user?.email ?? '');
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!live) return;
      setSession(nextSession);
      setAuthUser(nextSession?.user ?? null);
      setAuthEmail(nextSession?.user?.email ?? authEmail);
      if (nextSession?.user) setCloudReady(false);
      else {
        setCloudReady(false);
        cloudHydratedUserRef.current = null;
      }
    });

    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!localReady || !authReady) return;
    if (!authUser) {
      setCloudReady(true);
      setCloudStatus('');
      return;
    }

    const user = authUser;
    if (cloudHydratedUserRef.current === user.id) return;

    let cancelled = false;
    async function bootstrapCloud() {
      setCloudStatus('Connecting your fridge…');
      const now = new Date().toISOString();

      setCloudStatus('Saving your profile…');
      const { error: profileUpsertError } = await withTimeout(
        supabase.from('user_profiles').upsert({
          id: user.id,
          email: user.email ?? authEmail,
          trial_start_date: new Date().toISOString().slice(0,10),
          trial_active: true,
          created_at: now,
        }, { onConflict: 'id' }),
        'Profile save'
      );
      if (cancelled) return;
      if (profileUpsertError) throw profileUpsertError;

      setCloudStatus('Loading your saved fridge…');
      const { data: existingStateRows, error: existingStateError } = await withTimeout(
        supabase
          .from('user_app_state')
          .select('state')
          .eq('user_id', user.id)
          .limit(1),
        'App state load'
      );
      if (cancelled) return;
      if (existingStateError) throw existingStateError;

      const remoteState = sanitizeState(existingStateRows?.[0]?.state as Partial<AppState> | undefined);

      if (remoteState) {
        setS(remoteState);
        initialLocalStateRef.current = remoteState;
        setCloudStatus('Loaded your saved fridge.');
      } else {
        const guestState = sanitizeState(initialLocalStateRef.current) ?? { ...INIT };
        setCloudStatus('Saving your fridge…');
        const { error: insertStateError } = await withTimeout(
          supabase.from('user_app_state').upsert({
            user_id: user.id,
            state: guestState,
            created_at: now,
            updated_at: now,
          }, { onConflict: 'user_id' }),
          'App state save'
        );
        if (insertStateError) throw insertStateError;
        if (cancelled) return;
        setCloudStatus('Saved your fridge to your account.');
      }

      setCloudReady(true);
      cloudHydratedUserRef.current = user.id;
      setTimeout(() => setCloudStatus(''), 2600);
    }

    bootstrapCloud().catch((error: unknown) => {
      if (cancelled) return;
      cloudHydratedUserRef.current = null;
      setCloudReady(true);
      setCloudStatus(error instanceof Error ? error.message : 'We could not sync with the cloud yet.');
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, authUser, localReady]);

  useEffect(() => {
    if (!authUser || !cloudReady) return;
    const timeout = window.setTimeout(async () => {
      const now = new Date().toISOString();
      const { error } = await withTimeout(
        supabase.from('user_app_state').upsert({
          user_id: authUser.id,
          state: s,
          created_at: now,
          updated_at: now,
        }, { onConflict: 'user_id' }),
        'Background save'
      );
      if (error) {
        setCloudStatus(error.message);
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [authUser, cloudReady, s]);

  // Fetch meals when meals tab is active
  useEffect(() => {
    if (tab !== 'meals' || s.items.length === 0) return;
    const mealMembers = [
      ...(s.name || s.dietaryFilters.length || s.allergies.length ? [{
        name: s.name || 'You',
        isKid: false,
        dietaryFilters: s.dietaryFilters,
        allergies: s.allergies,
        dislikes: [] as string[],
      }] : []),
      ...s.members.map(m => ({
        name: m.name,
        isKid: m.isKid,
        age: m.age,
        dietaryFilters: m.dietaryFilters,
        allergies: m.allergies,
        dislikes: m.dislikes,
      })),
    ];
    const hiddenNames = new Set([
      ...s.cookedMeals
        .filter(meal => Date.now() - new Date(meal.cookedAt).getTime() < 3 * 86400000)
        .map(meal => meal.name.toLowerCase()),
      ...s.dislikedRecipes.map(n => n.toLowerCase()),
    ]);
    let cancelled = false;

    async function loadMeals() {
      setMealsLoading(true);
      if (mealsViewMode === 'days') {
        const nextPlan: PlannedDayMeals[] = [];
        const rollingExclude = new Set(hiddenNames);
        for (const meta of dayPlanMeta()) {
          const response = await fetch('/api/meals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: s.items,
              cuisines: s.cuisines,
              members: mealMembers,
              mealType: mealPeriod,
              excludeMeals: Array.from(rollingExclude),
              count: 2,
              planningDay: meta.label,
              dayOffset: meta.dayOffset,
            }),
          });
          const data = response.ok ? await response.json() : { meals: [] };
          let dayMeals = (data.meals || []).filter((meal: Meal) => !rollingExclude.has(meal.name.toLowerCase()));
          if (!dayMeals.length) {
            const rotatedItems = [...s.items]
              .sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry))
              .slice(meta.dayOffset);
            const householdAllergies = Array.from(new Set([...(s.allergies||[]), ...s.members.flatMap(m => m.allergies||[])]));
            const householdDiets = Array.from(new Set([...(s.dietaryFilters||[]), ...s.members.flatMap(m => m.dietaryFilters||[])]));
            dayMeals = buildFallbackMealsForDay(rotatedItems, mealPeriod, s.members.find(member => (member.age ?? 99) < 5)?.name, meta.dayOffset, s.cuisines, householdDiets, householdAllergies)
              .filter((meal: Meal) => !rollingExclude.has(meal.name.toLowerCase()));
          }
          dayMeals.forEach((meal: Meal) => rollingExclude.add(meal.name.toLowerCase()));
          nextPlan.push({ id: meta.id, label: meta.label, subtitle: meta.subtitle, meals: dayMeals });
        }
        if (!cancelled) setPlannedDays(nextPlan);
      } else {
        const response = await fetch('/api/meals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: s.items,
            cuisines: s.cuisines,
            members: mealMembers,
            mealType: mealPeriod,
            excludeMeals: Array.from(hiddenNames),
          }),
        });
        const data = response.ok ? await response.json() : { meals: [] };
        if (!cancelled) setMeals(data.meals || []);
      }
      if (!cancelled) setMealsLoading(false);
    }

    loadMeals().catch(() => {
      if (!cancelled) setMealsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mealPeriod, mealsViewMode]);

  function up(p: Partial<AppState>) { setS(prev => ({...prev,...p})); }
  function showT(msg: string) { setToast(msg); setTimeout(()=>setToast(''), 2800); }
  // Track which paywall placement the user tapped, so we can see which CTA converts.
  function trackPaywall(trigger: string) {
    setS(prev => ({ ...prev, paywallClicks: { ...prev.paywallClicks, [trigger]: (prev.paywallClicks[trigger] || 0) + 1 } }));
  }

  async function continueWithGoogle() {
    setAuthBusy(true);
    setCloudStatus('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setAuthBusy(false);
      setCloudStatus(error.message);
    }
  }

  async function submitEmailAuth() {
    if (!authEmail.trim()) {
      setCloudStatus('Enter your email first.');
      return;
    }
    setAuthBusy(true);
    setCloudStatus('');

    if (emailMode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      setAuthBusy(false);
      if (error) setCloudStatus(error.message);
      else setCloudStatus('Magic link sent. Check your inbox.');
      return;
    }

    if (!authPassword.trim()) {
      setAuthBusy(false);
      setCloudStatus('Enter your password too.');
      return;
    }

    const authCall = authMode === 'signup'
      ? supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { emailRedirectTo: window.location.origin },
        })
      : supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });

    const { error, data } = await authCall;
    setAuthBusy(false);
    if (error) {
      setCloudStatus(error.message);
      return;
    }

    if (data.user && !data.session && authMode === 'signup') {
      setCloudStatus('Check your inbox to confirm your email.');
      return;
    }

    setCloudStatus(authMode === 'signup' ? 'Account created. Saving your fridge…' : 'Welcome back. Syncing your fridge…');
  }

  async function signOutUser() {
    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      setCloudStatus(error.message);
      return;
    }
    setCloudStatus('Signed out. Guest mode is still available on this device.');
    setTimeout(() => setCloudStatus(''), 2600);
  }

  async function requestParsedItems(params: { text?: string; audio?: Blob; image?: File }) {
    const fd = new FormData();
    if (params.text) fd.append('text', params.text);
    if (params.audio) {
      const mt = params.audio.type || '';
      const ext = mt.includes('mp4') ? 'voice.mp4' : mt.includes('ogg') ? 'voice.ogg' : 'voice.webm';
      fd.append('audio', params.audio, ext);
    }
    if (params.image) {
      const preparedImage = await normalizeScanImage(params.image);
      fd.append('image', preparedImage, preparedImage.name);
    }
    fd.append('dietary', JSON.stringify({ country: s.country }));
    fd.append('lang', typeof navigator !== 'undefined' ? (navigator.language || 'en-IN') : 'en-IN');

    const endpoint = params.image ? '/api/scan' : '/api/transcribe';
    const res = await fetch(endpoint, { method: 'POST', body: fd });
    if (!res.ok) {
      let message = params.image ? 'Scan failed' : 'Input parse failed';
      try {
        const errorData = await res.json();
        if (errorData?.error) {
          const raw = String(errorData.error).toLowerCase();
          if (raw.includes('not configured'))
            message = 'AI is offline — set OPENAI_API_KEY in Vercel project settings.';
          else if (raw.includes('quota') || raw.includes('insufficient') || raw.includes('limit'))
            message = 'OpenAI quota reached — add items manually for now.';
          else if (raw.includes('key') || raw.includes('auth') || raw.includes('invalid'))
            message = 'OpenAI API key invalid — check your Vercel env vars.';
          else
            message = errorData.error;
        }
      } catch {}
      throw new Error(message);
    }
    return res.json();
  }

  // ── Onboarding ──────────────────────────────────────────────────────────────
  function finishOB() {
    const today = new Date().toISOString().slice(0,10);
    const country = s.country || detectCountry();
    const items = (obPicks.length > 0 ? obPicks : QUICK_ITEMS.slice(0,5).map(it => it.name)).map(name => {
      const known = QUICK_ITEMS.find(it => it.name.toLowerCase() === name.toLowerCase());
      if (known) return { ...known, id: uid(), added: today };
      // Custom-typed item — guess emoji from NAME_EMOJI; default to Produce / fridge.
      const lc = name.toLowerCase();
      const emoji = NAME_EMOJI[lc] || NAME_EMOJI[lc.split(/\s+/)[0]] || '📦';
      const category = 'Produce';
      return {
        id: uid(),
        added: today,
        name,
        emoji,
        shelf: 'fridge' as Shelf,
        category,
        qty: 1,
        unit: 'pcs',
        expiry: daysFromNow(CATEGORY_EXPIRY[category] || 7),
        cost: estimatePrice(name, country),
      };
    });
    up({ onboarded:true, items, country });
  }

  function OB() {
    const step = s.obStep;

    // ── Step 0: Splash (dark)
    if (step === 0) return (
      <div style={{
        position:'absolute', inset:0, background:'#1A1208',
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', padding:'40px 32px', textAlign:'center',
        animation:'fadeIn .4s both',
      }}>
        <div style={{animation:'dropIn .9s ease-out both'}}>
          <div style={{fontSize:72, marginBottom:20, lineHeight:1}}>🐝</div>
          <h1 style={{
            fontFamily:'Fraunces, Georgia, serif', fontSize:38, fontWeight:500,
            color:'#FFFFFF', marginBottom:16, letterSpacing:'-0.5px',
          }}>FridgeBee</h1>
          <p style={{
            fontFamily:'Fraunces, Georgia, serif', fontStyle:'italic',
            fontSize:20, color:'#F5A623', lineHeight:1.5,
            marginBottom:16, fontWeight:400,
          }}>
            &ldquo;Bought it Sunday.<br/>Forgot it by Thursday.&rdquo;
          </p>
          <p style={{color:'rgba(255,255,255,0.65)', fontSize:14, lineHeight:1.6, maxWidth:260, margin:'0 auto 40px'}}>
            FridgeBee remembers what&apos;s in your fridge &mdash; and tells you what to cook before it goes bad.
          </p>
          <button
            onClick={()=>up({obStep:1})}
            style={{
              background:'#F5A623', color:'#1A1208', border:'none',
              borderRadius:999, padding:'16px 32px', fontSize:16,
              fontWeight:700, fontFamily:'inherit', cursor:'pointer',
              width:'100%', maxWidth:300,
            }}>
            Start FridgeBeeing →
          </button>
          <p style={{color:'rgba(255,255,255,0.35)', fontSize:12, marginTop:14}}>No signup needed yet</p>
        </div>
      </div>
    );

    // ── Step 1: Quick fridge setup
    const obCountry = s.country || detectCountry();
    // Reactive: picks change as the user toggles diet / cuisine.
    const localItems = pickContextualQuickItems(obCountry, s.cuisines, s.dietaryFilters, 8);
    return (
      <div className="ob-wrap" style={{background:'var(--cr)'}}>
        <div style={{padding:'20px 20px 8px', flexShrink:0}}>
          <h2 style={{
            fontFamily:'Fraunces, Georgia, serif', fontSize:28, fontWeight:600,
            color:'var(--ink)', textAlign:'center', lineHeight:1.2, marginBottom:6,
            letterSpacing:'-0.3px',
          }}>
            <span style={{color:'var(--bee)', fontStyle:'italic'}}>Smarter</span> meals start here.
          </h2>
          <p style={{color:'var(--mu)', fontSize:12, textAlign:'center', lineHeight:1.5, marginBottom:10}}>
            Tell us a few things and we&apos;ll tailor recipes for you.
          </p>
          <div style={{display:'flex', justifyContent:'center', gap:6}}>
            <div style={{width:24, height:5, borderRadius:3, background:'var(--bee)'}}/>
            <div style={{width:8,  height:5, borderRadius:3, background:'var(--bd)'}}/>
            <div style={{width:8,  height:5, borderRadius:3, background:'var(--bd)'}}/>
          </div>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'14px 20px 8px'}}>
          {/* Diet preference row */}
          <div style={{fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8}}>
            DIET PREFERENCE
          </div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:18}}>
            {DIET_QUICK.map(d => {
              const on = s.dietaryFilters.includes(d) || (d === 'Other' && s.dietaryFilters.some(f => !DIET_QUICK.includes(f)));
              return (
                <button key={d}
                  onClick={() => {
                    if (d === 'Other') return;
                    up({ dietaryFilters: on
                      ? s.dietaryFilters.filter(f => f !== d)
                      : [...s.dietaryFilters.filter(f => !['Vegan','Vegetarian'].includes(f) || f === d || (d !== 'Vegan' && d !== 'Vegetarian')), d]
                    });
                  }}
                  style={{
                    padding:'7px 14px', borderRadius:999, border:'1.5px solid',
                    fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                    borderColor: on ? 'var(--sage)' : 'var(--bd)',
                    background:  on ? 'var(--sagel)' : 'var(--white)',
                    color:       on ? 'var(--sage)' : 'var(--mu)',
                  }}>
                  {d}
                </button>
              );
            })}
          </div>

          {/* Cuisine compass + custom cuisine input */}
          <div style={{fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8}}>
            CUISINE COMPASS
          </div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:8}}>
            {CUISINE_COMPASS.map(c => {
              const on = s.cuisines.includes(c.id);
              return (
                <button key={c.id}
                  onClick={() => up({ cuisines: on ? s.cuisines.filter(x => x !== c.id) : [...s.cuisines, c.id] })}
                  style={{
                    display:'flex', alignItems:'center', gap:6,
                    padding:'7px 12px', borderRadius:999, border:'1.5px solid',
                    fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                    borderColor: on ? 'var(--bee)' : 'var(--bd)',
                    background:  on ? 'var(--beel)' : 'var(--white)',
                    color:       on ? 'var(--beed)' : 'var(--mu)',
                  }}>
                  <span style={{fontSize:15}}>{c.emoji}</span>{c.label}
                </button>
              );
            })}
          </div>
          {/* Custom-cuisine pills + add input */}
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:6}}>
            {s.cuisines.filter(c => !CUISINE_COMPASS.find(x => x.id === c)).map(c => (
              <span key={c} className="pill pill-bee" style={{cursor:'pointer', fontSize:12}}
                onClick={()=>up({cuisines:s.cuisines.filter(x=>x!==c)})}>{c} ×</span>
            ))}
          </div>
          <input type="text"
            placeholder="Add another cuisine and press Enter…"
            value={s.customCuisine}
            onChange={e=>up({customCuisine:e.target.value})}
            onKeyDown={e=>{ if(e.key==='Enter' && s.customCuisine.trim()){ up({cuisines:[...s.cuisines, s.customCuisine.trim()], customCuisine:''}); }}}
            style={{width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--bd)', fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--white)', marginBottom:18}}
          />

          {/* What's in your fridge right now? — 6 location items + free text */}
          <div style={{fontSize:13, fontWeight:800, color:'var(--ink)', marginBottom:10, fontFamily:'Fraunces, Georgia, serif'}}>
            What&apos;s in your fridge right now?
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:10}}>
            {localItems.map(it => {
              const sel = obPicks.includes(it.name);
              return (
                <button key={it.name}
                  onClick={()=>setObPicks(prev => sel ? prev.filter(n=>n!==it.name) : [...prev, it.name])}
                  style={{
                    display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                    padding:'8px 2px', borderRadius:11, border:'1.5px solid',
                    fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                    transition:'all .12s',
                    borderColor: sel ? 'var(--bee)' : 'var(--bd)',
                    background:  sel ? 'var(--beel)' : 'var(--white)',
                    color:       sel ? 'var(--beed)' : 'var(--ink)',
                  }}>
                  <span style={{fontSize:20, lineHeight:1}}>{it.emoji}</span>
                  <span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%'}}>{it.name}</span>
                </button>
              );
            })}
          </div>
          {/* Custom-typed picks chips */}
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:6}}>
            {obPicks.filter(p => !QUICK_ITEMS.find(x => x.name === p)).map(p => (
              <span key={p} className="pill pill-bee" style={{cursor:'pointer', fontSize:12}}
                onClick={()=>setObPicks(prev=>prev.filter(n=>n!==p))}>{p} ×</span>
            ))}
          </div>
          <input type="text"
            placeholder="Type"
            onKeyDown={e=>{
              if (e.key==='Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) {
                  const titled = v.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  setObPicks(prev => prev.includes(titled) ? prev : [...prev, titled]);
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
            style={{width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--bd)', fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--white)', marginBottom:8}}
          />
        </div>
        <div style={{
          flexShrink:0, padding:'12px 20px 28px',
          background:'var(--cr)', borderTop: obPicks.length>0 ? '1.5px solid var(--bd)' : 'none',
        }}>
          {obPicks.length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8, display:'flex', justifyContent:'space-between'}}>
                <span>YOUR SELECTION</span>
                <span>{obPicks.length} selected</span>
              </div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {obPicks.map(name => {
                  const it = QUICK_ITEMS.find(x=>x.name===name);
                  return (
                    <span key={name} className="pill pill-bee" style={{cursor:'pointer', fontSize:12}}
                      onClick={()=>setObPicks(prev=>prev.filter(n=>n!==name))}>
                      {it?.emoji} {name} ×
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <button
            onClick={finishOB}
            disabled={obPicks.length < 1}
            style={{
              width:'100%', padding:'16px', borderRadius:999,
              background: obPicks.length >= 1 ? '#1A1208' : 'var(--bd)',
              color: obPicks.length >= 1 ? '#FFFFFF' : 'var(--mu)',
              border:'none', fontWeight:700, fontSize:16,
              fontFamily:'inherit', cursor: obPicks.length >= 1 ? 'pointer' : 'default',
              transition:'all .15s',
            }}>
            {obPicks.length >= 1 ? `Show me my fridge →` : 'Pick a few items to continue'}
          </button>
        </div>
      </div>
    );
  }

  // ── Add item ─────────────────────────────────────────────────────────────────
  function addItem(item: Omit<FoodItem,'id'|'added'>) {
    addItems([item]);
  }
  // Batch-add. Uses a functional setState so calling this with an array of N items
  // appends all N atomically — avoids the closure bug where a forEach with addItem()
  // would only land the last item because each call read s.items from a stale snapshot.
  function addItems(list: Omit<FoodItem,'id'|'added'>[]) {
    if (!list.length) return;
    const cntAfter = addCount + list.length;
    setAddCount(cntAfter);
    localStorage.setItem('fb_add_cnt', String(cntAfter));
    if (cntAfter > 30) { setShowPaywall(true); return; }
    const today = new Date().toISOString().slice(0,10);
    const stamped: FoodItem[] = list.map(it => ({ ...it, id: uid(), added: today }));
    setS(prev => ({ ...prev, items: [...prev.items, ...stamped] }));
    showT(list.length === 1 ? `Added ${list[0].name} ✓` : `Added ${list.length} items ✓`);
  }
  function removeItem(id: string) {
    const it = s.items.find(i=>i.id===id);
    const cat = it?.category || 'Other';
    up({
      items:s.items.filter(i=>i.id!==id),
      itemsWasted:s.itemsWasted+1,
      wastedByCategory:{...s.wastedByCategory, [cat]:(s.wastedByCategory[cat]||0)+1},
    });
    showT(`Removed ${it?.name||'item'}`);
  }
  function markUsed(id: string) {
    const it = s.items.find(i=>i.id===id);
    up({items:s.items.filter(i=>i.id!==id), itemsUsed:s.itemsUsed+1, wasteStreak:s.wasteStreak+1});
    showT(`Used ${it?.name} 🍳`);
  }

  // ── Voice ────────────────────────────────────────────────────────────────────
  async function startVoice() {
    if (isListening) {
      srRef.current?.stop?.();
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      // Detect best supported MIME type (iOS needs mp4, others prefer webm)
      const MIME_PRIORITY = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus',''];
      const chosenMime = MIME_PRIORITY.find(m => !m || MediaRecorder.isTypeSupported(m)) ?? '';
      const recorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : {});
      mediaRecorderRef.current = recorder;
      setIsListening(true);
      recorder.ondataavailable = event => { if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsListening(false);
        if (!audioChunksRef.current.length) { showT('No audio captured — try again'); return; }
        const mimeType = recorder.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 500) { showT('Recording too short — try again'); return; }
        await parseVoice('', blob);
      };
      recorder.start(250); // timeslice ensures ondataavailable fires on iOS
      return;
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec: any = new SR();
        srRef.current = rec;
        rec.lang = typeof navigator !== 'undefined' ? (navigator.language || 'en-IN') : 'en-IN';
        rec.interimResults = false;
        rec.continuous = false;
        setIsListening(true);
        rec.onresult = async (e: { results: { 0: { 0: { transcript: string } } } }) => {
          const transcript = e.results[0][0].transcript.trim();
          setVoiceText(transcript);
          setIsListening(false);
          await parseVoice(transcript);
        };
        rec.onerror = () => {
          setIsListening(false);
          showT('Could not hear — try again');
        };
        rec.onend = () => setIsListening(false);
        rec.start();
        return;
      }

      setIsListening(false);
      showT('Microphone access needed');
    }
  }
  async function parseVoice(text: string, audio?: Blob) {
    const cleaned = text.replace(/\n/g,', ').replace(/\s+/g,' ').trim();
    setVoiceLoading(true);
    try {
      const d = await requestParsedItems(audio ? { audio } : { text: cleaned });
      const transcriptStr = (d.transcript || '').trim();
      if (transcriptStr) setVoiceText(transcriptStr);
      if (d.items?.length) {
        const normalized = d.items.map((it: ParsedInputItem) => normalizeParsedItem(it, s.country));
        if (normalized.length === 1 && fallbackSplitItems(cleaned).length > 1) {
          setParsed(toEditableFallbackItems(cleaned, s.country));
          setVoiceLoading(false);
          return;
        }
        setParsed(normalized);
        setVoiceLoading(false);
        return;
      }
      // Got a transcript but no items — fall back to splitting the transcript locally.
      const sourceText = cleaned || transcriptStr;
      if (sourceText) {
        setParsed(toEditableFallbackItems(sourceText, s.country));
      } else if (audio) {
        showT("Couldn't hear anything — try again");
      }
    } catch (err) {
      if (err instanceof Error && err.message) showT(err.message);
    }
    setVoiceLoading(false);
  }
  async function handleScan() {
    if (!scanFile) return;
    setScanning(true);
    try {
      const d = await requestParsedItems({ image: scanFile });
      if (d.items?.length) setParsed(d.items.map((it: ParsedInputItem) => normalizeParsedItem(it, s.country)));
      else showT('Could not read — try a clearer photo');
    } catch (error) { showT(error instanceof Error ? error.message : 'Scan failed'); }
    setScanning(false);
  }
  function confirmParsed() {
    const tally: Record<Shelf, number> = { fridge: 0, freezer: 0, pantry: 0 };
    const batch = parsed.filter(it => it.name).map(it => {
      const sh = (it.shelf || 'fridge') as Shelf;
      tally[sh] = (tally[sh] || 0) + 1;
      return { name: it.name!, emoji: it.emoji || '📦', shelf: sh, category: it.category || 'Other', qty: it.qty || 1, unit: it.unit || 'pcs', expiry: it.expiry || daysFromNow(7) };
    });
    addItems(batch);
    // Switch to the shelf tab where most items landed so user actually sees what was added.
    const dominantShelf = (Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] as Shelf) || 'fridge';
    if (tally[dominantShelf] > 0) {
      setShelf(dominantShelf);
      setTab('fridge');
      setSearch('');
      setCatFilter('All');
    }
    setParsed([]); setShowAdd(false); setVoiceText(''); setScanFile(null);
  }

  // ── Fridge screen ─────────────────────────────────────────────────────────────
  function ScreenFridge() {
    const currency = COUNTRY_CURRENCY[s.country]?.symbol || '$';
    const allShelfItems = s.items.filter(it => it.shelf === shelf);
    const welcomeName = s.name.trim() ? `Welcome ${s.name.trim()}` : 'Welcome';

    // Filter by search + category
    const filtered = allShelfItems.filter(it => {
      const matchSearch = !search || it.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === 'All' || it.category === catFilter;
      return matchSearch && matchCat;
    });

    // Groups
    const expiredItems = filtered.filter(it => daysUntil(it.expiry) <= 0);
    const useSoonItems = filtered.filter(it => { const d = daysUntil(it.expiry); return d > 0 && d <= 5; });
    const freshItems   = filtered.filter(it => daysUntil(it.expiry) > 5);

    // Categories present
    const cats = ['All', ...Array.from(new Set(allShelfItems.map(i => i.category)))];
    const quickCats = cats.filter(c => ['All', 'Produce', 'Dairy', 'Other'].includes(c));
    const gridItems = [
      ...expiredItems,
      ...useSoonItems.filter(item => !expiredItems.some(expired => expired.id === item.id)),
      ...freshItems.filter(item => !expiredItems.some(expired => expired.id === item.id) && !useSoonItems.some(soon => soon.id === item.id)),
    ];

    function ItemRow({ item }: { item: FoodItem }) {
      const d = daysUntil(item.expiry);
      const tint = CAT_TINT[item.category] || 'var(--wa)';
      const borderCol = d <= 0 ? '#EF4444' : d <= 3 ? '#F5A623' : '#4A7C59';
      return (
        <div onClick={() => setEditItem(item)} style={{
          display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
          background:'linear-gradient(180deg, #FFFFFF 0%, #FFFCF8 100%)', borderRadius:18, marginBottom:8, cursor:'pointer',
          border:'1.5px solid #EFE4D5', borderLeft:`4px solid ${borderCol}`,
          boxShadow:'0 10px 24px rgba(122,107,85,.06)',
        }}>
          <div style={{ width:46, height:46, borderRadius:12, background:tint, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>
            {item.emoji}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--ink)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.name}</div>
            <div style={{ fontSize:11, color:'var(--mu)', marginTop:2 }}>
              {item.qty}{item.unit} · {item.category} · {item.addedBy || 'manual'}
            </div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color: d <= 0 ? '#EF4444' : d <= 3 ? '#F5A623' : 'var(--sage)' }}>
              {d < 0 ? 'Expired' : d === 0 ? 'Today' : `${d} days`}
            </div>
            {item.cost ? <div style={{ fontSize:11, color:'var(--mu)', marginTop:1 }}>{currency}{item.cost.toFixed(1)}</div> : null}
          </div>
        </div>
      );
    }

    function ItemGridCard({ item }: { item: FoodItem }) {
      const d = daysUntil(item.expiry);
      const tint = CAT_TINT[item.category] || 'var(--wa)';
      const borderCol = d <= 0 ? '#EF4444' : d <= 3 ? '#F5A623' : '#4A7C59';
      const suggestion = d <= 3 ? 'Use today' : 'Still fresh';
      return (
        <button
          onClick={() => setEditItem(item)}
          style={{
            display:'flex',
            flexDirection:'column',
            alignItems:'flex-start',
            gap:10,
            padding:'15px',
            background:'linear-gradient(180deg, #FFFFFF 0%, #FFF9F1 100%)',
            borderRadius:22,
            border:`1.5px solid ${borderCol}33`,
            cursor:'pointer',
            fontFamily:'inherit',
            textAlign:'left',
            minHeight:164,
            boxShadow:'0 14px 30px rgba(122,107,85,.08)',
            position:'relative',
            overflow:'hidden',
          }}
        >
          <div style={{ position:'absolute', top:0, left:0, right:0, height:5, background:borderCol, opacity:.85 }} />
          <div style={{ width:50, height:50, borderRadius:14, background:tint, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>
            {item.emoji}
          </div>
          <div style={{ fontWeight:800, fontSize:15, color:'var(--ink)', lineHeight:1.15 }}>{item.name}</div>
          <div style={{ fontSize:12, color: d <= 0 ? '#EF4444' : d <= 3 ? '#B45309' : 'var(--sage)', fontWeight:800 }}>
            {d < 0 ? 'Expired' : d === 0 ? 'Use today' : `${d} days left`}
          </div>
          <div style={{ marginTop:'auto', fontSize:10, color:d <= 3 ? '#B45309' : 'var(--mu)', fontWeight:800, letterSpacing:'.6px', textTransform:'uppercase', background:d <= 3 ? '#FFF1DB' : '#F7F0E6', borderRadius:999, padding:'6px 10px' }}>{suggestion}</div>
        </button>
      );
    }

    function Group({ label, dot, items }: { label: string; dot: string; items: FoodItem[] }) {
      if (items.length === 0) return null;
      return (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ width:8, height:8, borderRadius:4, background:dot }} />
            <span style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px' }}>
              {label} · {items.length}
            </span>
          </div>
          {items.map(it => <ItemRow key={it.id} item={it} />)}
        </div>
      );
    }

    return (
      <div className="screen" style={{ background:'linear-gradient(180deg, #FFFDF9 0%, var(--cr) 14%, var(--cr) 100%)', paddingBottom:80 }}>
        <div style={{ padding:'18px 16px 14px', background:'linear-gradient(180deg, #FFFFFF 0%, #FFFCF8 100%)', borderBottom:'1.5px solid var(--bd)' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)', marginBottom:4 }}>{welcomeName}</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <h1 style={{ fontSize:26, color:'var(--ink)', fontFamily:'Fraunces,Georgia,serif', fontWeight:500, lineHeight:1.05 }}>Your fridge</h1>
                <div style={{ animation:'bee-bob 2s ease-in-out infinite', display:'inline-flex', marginTop:2 }}>
                  <BeeSVG size={22} />
                </div>
              </div>
              <div style={{ fontSize:11.5, color:'var(--mu)', fontWeight:700, marginTop:4 }}>Your little bee is keeping watch over what to use next.</div>
            </div>
            {s.items.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all fridge items? This cannot be undone.')) {
                    up({ items: [] });
                    setEditItem(null);
                    showT('All items removed');
                  }
                }}
                style={{ background:'#FFF7F5', color:'#C94A3A', border:'1.5px solid #F1D2CB', borderRadius:16, padding:'10px 12px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'inherit', flexShrink:0, boxShadow:'0 8px 18px rgba(201,74,58,.08)' }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div style={{ padding:'12px 16px 10px', background:'linear-gradient(180deg, #FFFFFF 0%, #FFFCF8 100%)', borderBottom:'1.5px solid var(--bd)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'linear-gradient(180deg, #FBF5EC 0%, #F6EEDF 100%)', borderRadius:16, padding:'12px 14px', border:'1px solid #EFE4D5', boxShadow:'inset 0 1px 0 rgba(255,255,255,.55)' }}>
            <span style={{ fontSize:16, color:'var(--mu)' }}>⌕</span>
            <input type="text" placeholder="Search your items..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex:1, border:'none', background:'transparent', fontSize:15, fontFamily:'inherit', outline:'none', color:'var(--ink)' }}
            />
            {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--mu)', fontSize:16 }}>×</button>}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            {(['fridge','freezer','pantry'] as Shelf[]).map(sh => (
              <button key={sh} onClick={() => setShelf(sh)}
                style={{ flex:1, padding:'7px 4px', borderRadius:12, border:'1.5px solid', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                  borderColor: shelf===sh ? '#E9C26A' : '#EFE4D5',
                  background:  shelf===sh ? 'linear-gradient(180deg, #FFF0CC 0%, #FDEBC2 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #FFFCF8 100%)',
                  color:       shelf===sh ? 'var(--beed)' : 'var(--ink)' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                  <span style={{ fontSize:18 }}>{SHELF_ICONS[sh]}</span>
                  <span style={{ fontSize:12, fontWeight:800 }}>{SHELF_LABELS[sh]}</span>
                  <span style={{ fontSize:10, color: shelf===sh ? 'var(--beed)' : 'var(--mu)', fontWeight:700 }}>{s.items.filter(i => i.shelf === sh).length} items</span>
                </div>
              </button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop:12 }}>
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2, flex:1 }}>
            {quickCats.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                style={{ padding:'8px 14px', borderRadius:999, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
                  borderColor: catFilter===c ? '#2B2115' : '#E9DED0',
                  background:  catFilter===c ? '#2B2115' : '#FFFCF8',
                  color:       catFilter===c ? '#fff' : 'var(--ink)' }}>
                {c === 'All' ? `All ${allShelfItems.length}` : c}
              </button>
            ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              <button
                onClick={() => setFridgeView(fridgeView === 'list' ? 'grid' : 'list')}
                aria-label={fridgeView === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                title={fridgeView === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                style={{
                  width:38,
                  height:38,
                  borderRadius:14,
                  border:'1.5px solid',
                  borderColor: '#2B2115',
                  background: '#2B2115',
                  color: '#fff',
                  cursor:'pointer',
                  boxShadow:'0 10px 20px rgba(26,18,8,.12)',
                  fontSize:16,
                  fontWeight:800,
                }}
              >
                {fridgeView === 'list' ? '⊞' : '☰'}
              </button>
            </div>
          </div>
        </div>

        {/* Item groups */}
        <div style={{ padding:'12px 16px' }}>
          {filtered.length === 0
            ? <div style={{ textAlign:'center', padding:'50px 0', color:'var(--mu)' }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📭</div>
                <div style={{ fontWeight:700 }}>Nothing found</div>
                <div style={{ fontSize:13, marginTop:4 }}>Tap + to add items</div>
              </div>
            : fridgeView === 'grid'
            ? <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {gridItems.map(it => <ItemGridCard key={it.id} item={it} />)}
              </div>
            : <>
                <Group label="EXPIRED"         dot="#EF4444" items={expiredItems} />
                <Group label="USE IN A FEW DAYS" dot="#F5A623" items={useSoonItems} />
                <Group label="STILL FRESH"     dot="#4A7C59" items={freshItems} />
              </>
          }
        </div>
      </div>
    );
  }

  // ── Meals screen ──────────────────────────────────────────────────────────────
  function ScreenMeals() {
    const expiring = s.items.filter(it => daysUntil(it.expiry) <= 2);
    const hiddenMealNames = new Set(
      s.cookedMeals
        .filter(meal => Date.now() - new Date(meal.cookedAt).getTime() < 3 * 86400000)
        .map(meal => meal.name.toLowerCase())
    );
    const dislikedSet = new Set(s.dislikedRecipes.map(n => n.toLowerCase()));
    const toddler = s.members.find(member => (member.age ?? 99) < 5);
    const safeName = toddler?.name || 'little one';
    const fallbackItems = [...(expiring.length ? expiring : s.items)]
      .sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry));
    const fallbackHouseholdAllergies = Array.from(new Set([...(s.allergies||[]), ...s.members.flatMap(m => m.allergies||[])]));
    const fallbackHouseholdDiets = Array.from(new Set([...(s.dietaryFilters||[]), ...s.members.flatMap(m => m.dietaryFilters||[])]));
    const fallback: Meal[] = buildFallbackMealsForDay(fallbackItems, mealPeriod, safeName, 0, s.cuisines, fallbackHouseholdDiets, fallbackHouseholdAllergies);
    const displayMeals = (meals.length > 0 ? meals : fallback).filter(meal => !hiddenMealNames.has(meal.name.toLowerCase()) && !dislikedSet.has(meal.name.toLowerCase()));
    const markNotForMe = (recipeName: string) => {
      const lower = recipeName.toLowerCase();
      up({ dislikedRecipes: [...s.dislikedRecipes.filter(n => n.toLowerCase() !== lower), recipeName] });
      setMeals(prev => prev.filter(m => m.name.toLowerCase() !== lower));
      setPlannedDays(prev => prev.map(day => ({ ...day, meals: day.meals.filter(m => m.name.toLowerCase() !== lower) })));
      showT(`"${recipeName}" hidden — won’t suggest again`);
    };
    const refreshMeals = () => {
      const mealMembers = [
        ...(s.name || s.dietaryFilters.length || s.allergies.length ? [{
          name: s.name || 'You',
          isKid: false,
          dietaryFilters: s.dietaryFilters,
          allergies: s.allergies,
          dislikes: [] as string[],
        }] : []),
        ...s.members.map(m => ({
          name: m.name,
          isKid: m.isKid,
          age: m.age,
          dietaryFilters: m.dietaryFilters,
          allergies: m.allergies,
          dislikes: m.dislikes,
        })),
      ];
      setMealsLoading(true);
      fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: s.items,
          cuisines: s.cuisines,
          members: mealMembers,
          mealType: mealPeriod,
          excludeMeals: Array.from(hiddenMealNames),
        }),
      })
        .then(r => r.ok ? r.json() : { meals: [] })
        .then(d => setMeals(d.meals || []))
        .finally(() => setMealsLoading(false));
    };

    if (recipeScreen) {
      return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Header is OUTSIDE the scroll container so back-button always works on mobile */}
          <div style={{ background:'#C94A3A', padding:'14px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <button
              onClick={() => setRecipeScreen(null)}
              onTouchEnd={e => { e.preventDefault(); setRecipeScreen(null); }}
              style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:12, width:44, height:44, cursor:'pointer', color:'#fff', fontSize:22, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor:'transparent' }}
            >‹</button>
            <div style={{ flex:1 }}>
              <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>{recipeScreen.name}</div>
              <div style={{ color:'#FEE2E2', fontSize:12, marginTop:2 }}>⏱ {recipeScreen.cookTime} min · 🔥 {recipeScreen.kcal} kcal</div>
            </div>
            <span style={{ fontSize:32 }}>{recipeScreen.emoji}</span>
          </div>
          <div className="screen" style={{ flex:1, background:'var(--cr)', paddingBottom:100 }}>
          <div style={{ padding:'16px' }}>
            {(recipeScreen.safeFor && recipeScreen.safeFor.length > 0) && (
              <div style={{ background:'#DCFCE7', border:'1px solid #86A87A', borderRadius:16, padding:'12px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18 }}>👶</span>
                <div style={{ fontWeight:700, fontSize:13, color:'#14532D' }}>
                  Safe for {recipeScreen.safeFor[0]} — mild, no choking hazards
                </div>
              </div>
            )}
            {recipeScreen.usesExpiring && (
              <div style={{ background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:16, padding:'12px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18 }}>⚠️</span>
                <div style={{ fontSize:13, color:'#92400E', fontWeight:700 }}>Uses items expiring today — great choice!</div>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
              {[
                { label:'🔥', value:`${recipeScreen.kcal} kcal`, color:'#C94A3A' },
                { label:'💪', value:`${recipeScreen.protein} g P`, color:'#C94A3A' },
                { label:'⏱', value:`${recipeScreen.cookTime} min`, color:'#4A6B3A' },
              ].map(stat => (
                <div key={stat.label} style={{ background:'var(--white)', border:'1px solid var(--bd)', borderRadius:16, padding:'12px 8px', textAlign:'center' }}>
                  <div style={{ fontSize:12, color:'var(--mu)' }}>{stat.label}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:stat.color, marginTop:4 }}>{stat.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--mu)', letterSpacing:'1px', marginBottom:8 }}>INGREDIENTS</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:18 }}>
              {recipeScreen.ingredients.map((ingredient, index) => (
                <span key={`${ingredient}-${index}`} style={{ background:'var(--wa)', borderRadius:999, padding:'6px 12px', fontSize:12, fontWeight:700, color:'var(--ink)' }}>
                  {ingredient}
                </span>
              ))}
            </div>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--mu)', letterSpacing:'1px', marginBottom:8 }}>RECIPE</div>
            <div style={{ background:'var(--cr)', borderRadius:14, marginBottom:18 }}>
              <ol style={{ margin:0, paddingLeft:26, fontFamily:'Fraunces,Georgia,serif', fontSize:15, color:'var(--ink)', lineHeight:1.7 }}>
                {recipeScreen.steps.map((step, i) => <li key={i} style={{ marginBottom: i < recipeScreen.steps.length - 1 ? 12 : 0 }}>{step}</li>)}
              </ol>
            </div>
            <button
              onClick={() => {
                const cookedName = recipeScreen.name.toLowerCase();
                up({
                  cookedMeals: [
                    ...s.cookedMeals.filter(meal => meal.name.toLowerCase() !== cookedName),
                    { name: recipeScreen.name, cookedAt: new Date().toISOString() },
                  ],
                });
                setMeals(prev => prev.filter(meal => meal.name.toLowerCase() !== cookedName));
                setPlannedDays(prev => prev.map(day => ({
                  ...day,
                  meals: day.meals.filter(meal => meal.name.toLowerCase() !== cookedName),
                })));
                // Pick a hero that's actually used in this recipe AND in the fridge — not just
                // the first expiring item. Prevents "I cooked Pancakes" removing Bell Pepper.
                const recipeWords = (recipeScreen.ingredients || [])
                  .flatMap(ing => ing.toLowerCase().split(/[\s,/]+/))
                  .filter(w => w.length >= 3);
                const recipeWordSet = new Set(recipeWords);
                const matchingItems = s.items.filter(item => {
                  const itemName = item.name.toLowerCase();
                  return recipeWordSet.has(itemName) || recipeWords.some(w => itemName.includes(w) || w.includes(itemName));
                });
                // Prefer the matching item that's expiring soonest. Fall back to nothing —
                // better to skip the cook-done modal than ask about a wrong item.
                const hero = matchingItems.sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry))[0];
                if (hero) setCookDoneItem(hero);
                setRecipeScreen(null);
              }}
              style={{ width:'100%', background:'#4A6B3A', color:'#fff', border:'none', borderRadius:18, padding:'15px', fontWeight:800, fontSize:16, cursor:'pointer', fontFamily:'inherit' }}
            >
              ✓ I cooked this — update my fridge
            </button>
            <div style={{ marginTop:8, fontSize:11.5, color:'var(--mu)', textAlign:'center' }}>Ingredients will be marked as used. Hidden from suggestions for 3 days.</div>
          </div>
          </div>
        </div>
      );
    }

    // Build a human-readable summary of active preferences for the banner
    const activePrefs: string[] = [];
    if (s.cuisines.length) activePrefs.push(s.cuisines.slice(0,2).join(', '));
    if (s.dietaryFilters.length) activePrefs.push(s.dietaryFilters.join(', '));
    if (s.allergies.length) activePrefs.push(`no ${s.allergies.slice(0,2).join('/')}`);
    s.members.forEach(m => {
      const age = m.age;
      if (age != null && age < 3) activePrefs.push(`infant rules for ${m.name}`);
      else if (age != null && age < 12) activePrefs.push(`kid-safe for ${m.name}`);
      else if (m.isKid) activePrefs.push(`child-safe for ${m.name}`);
      if (m.allergies.length) activePrefs.push(`no ${m.allergies[0]} (${m.name})`);
      if (m.dietaryFilters.length) activePrefs.push(`${m.dietaryFilters[0]} (${m.name})`);
    });
    const hasPrefs = activePrefs.length > 0;

    return (
      <div className="screen" style={{ background:'var(--cr)', paddingBottom:20 }}>
        <div style={{ padding:'18px 16px 10px', background:'var(--white)', borderBottom:'1.5px solid var(--bd)' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div>
              <h1 style={{ fontSize:28, fontWeight:800, color:'var(--ink)' }}>Meal Ideas</h1>
              <p style={{ fontSize:12, color:'var(--mu)', marginTop:4 }}>From your fridge · auto-generated</p>
            </div>
            <button
              onClick={refreshMeals}
              style={{ display:'flex', alignItems:'center', gap:8, background:'#FFF5F0', border:'1.5px solid #F4C8C1', borderRadius:16, padding:'10px 14px', cursor:'pointer', fontFamily:'inherit', color:'#C94A3A', fontWeight:700, fontSize:14 }}
            >
              ↻ Refresh
            </button>
          </div>
          {/* Preferences banner */}
          {hasPrefs && (
            <div style={{ marginTop:10, display:'flex', alignItems:'flex-start', gap:8, background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:14, padding:'10px 12px' }}>
              <span style={{ fontSize:16, flexShrink:0 }}>✅</span>
              <div style={{ fontSize:12, color:'#14532D', fontWeight:600, lineHeight:1.5 }}>
                <strong>Preferences applied:</strong> {activePrefs.slice(0,4).join(' · ')}
                {activePrefs.length > 4 && ` · +${activePrefs.length - 4} more`}
              </div>
            </div>
          )}
          {/* Paywall — meals page hero */}
          <div style={{ marginTop:10 }}>
            <PaywallChip
              trigger="meals_top"
              label="Unlimited AI recipes — Pro Beta"
              sublabel="Smarter weekly variety · 30% off forever"
              onTrack={() => trackPaywall('meals_top')}
            />
          </div>
          {!hasPrefs && (
            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8, background:'var(--wa)', borderRadius:14, padding:'10px 12px' }}>
              <span style={{ fontSize:14 }}>💡</span>
              <div style={{ fontSize:12, color:'var(--mu)' }}>
                Add dietary preferences &amp; family members in <strong>Profile</strong> for personalised meals.
              </div>
            </div>
          )}
        </div>

        <div style={{ padding:'12px 16px', background:'var(--white)', borderBottom:'1px solid var(--bd)' }}>
          <div style={{ display:'flex', gap:8 }}>
            {([
              ['time', 'By time'],
              ['days', '3-day plan'],
            ] as const).map(([mode, label]) => {
              const active = mealsViewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setMealsViewMode(mode)}
                  style={{
                    flex:1,
                    padding:'10px 12px',
                    borderRadius:14,
                    border:'1.5px solid',
                    borderColor: active ? '#C94A3A' : 'var(--bd)',
                    background: active ? '#FFF5F0' : 'var(--wa)',
                    color: active ? '#C94A3A' : 'var(--ink)',
                    fontWeight:800,
                    fontSize:13,
                    cursor:'pointer',
                    fontFamily:'inherit',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {mealsViewMode === 'days' && (
          <>
            <div style={{ padding:'10px 16px 0', background:'var(--white)' }}>
              <PaywallChip
                trigger="meals_3day_plan"
                label="3-day meal plan — Pro Beta"
                sublabel="Plan a week of meals · 30% off forever"
                onTrack={() => trackPaywall('meals_3day_plan')}
              />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, padding:'14px 16px', background:'var(--white)', borderBottom:'1px solid var(--bd)' }}>
              {dayPlanMeta().map(day => {
                const active = selectedPlanDay === day.id;
                return (
                  <button
                    key={day.id}
                    onClick={() => setSelectedPlanDay(day.id)}
                    style={{
                      background: active ? '#FFF5F0' : 'var(--wa)',
                      border:`1.5px solid ${active ? '#F4C8C1' : 'var(--bd)'}`,
                      borderRadius:18,
                      padding:'12px 8px',
                      cursor:'pointer',
                      fontFamily:'inherit',
                    }}
                  >
                    <div style={{ fontSize:13, fontWeight:800, color: active ? '#C94A3A' : 'var(--ink)' }}>{day.label}</div>
                    <div style={{ fontSize:10, marginTop:4, color: active ? '#C94A3A' : 'var(--mu)' }}>{day.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {mealsViewMode === 'time' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, padding:'14px 16px', background:'var(--white)', borderBottom:'1px solid var(--bd)' }}>
            {MEAL_PERIODS.map(period => {
              const active = mealPeriod === period.id;
              return (
                <button
                  key={period.id}
                  onClick={() => setMealPeriod(period.id)}
                  style={{
                    background: active ? '#FFF5F0' : 'var(--wa)',
                    border:`1.5px solid ${active ? '#F4C8C1' : 'var(--bd)'}`,
                    borderRadius:18,
                    padding:'12px 6px',
                    cursor:'pointer',
                    fontFamily:'inherit',
                  }}
                >
                  <div style={{ fontSize:20, marginBottom:6 }}>{period.emoji}</div>
                  <div style={{ fontSize:12, fontWeight:800, color: active ? '#C94A3A' : 'var(--ink)' }}>{period.label}</div>
                  <div style={{ fontSize:10, marginTop:3, color: active ? '#C94A3A' : 'var(--mu)' }}>{period.time}</div>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ padding:'16px' }}>
          {s.items.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--mu)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🍽️</div>
              <div style={{ fontWeight:700 }}>Add items to your fridge first</div>
            </div>
          ) : mealsLoading ? (
            <div style={{ textAlign:'center', padding:'40px 0' }}>
              <div style={{ animation:'bee-bob 1.5s ease-in-out infinite', display:'inline-block', marginBottom:12 }}><BeeSVG size={48}/></div>
              <div style={{ fontSize:14, color:'var(--mu)', fontWeight:600 }}>Finding meal ideas…</div>
            </div>
          ) : mealsViewMode === 'days' ? (
            (() => {
              const activeDay = plannedDays.find(day => day.id === selectedPlanDay) || plannedDays[0];
              const topPick = activeDay?.meals?.[0];
              const otherMeals = activeDay?.meals?.slice(1) || [];

              if (!activeDay) {
                return (
                  <div style={{ background:'var(--white)', border:'1.5px solid var(--bd)', borderRadius:20, padding:'26px 18px', textAlign:'center' }}>
                    <div style={{ fontSize:34, marginBottom:10 }}>🍳</div>
                    <div style={{ fontWeight:800, fontSize:16, color:'var(--ink)', marginBottom:6 }}>No 3-day plan yet</div>
                    <div style={{ fontSize:13, color:'var(--mu)', lineHeight:1.5 }}>Refresh to generate meal ideas for the next few days.</div>
                  </div>
                );
              }

              return (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12 }}>
                    <div>
                      <div style={{ fontSize:22, fontWeight:800, color:'var(--ink)' }}>{activeDay.label}</div>
                      <div style={{ fontSize:12, color:'var(--mu)', marginTop:3 }}>{activeDay.subtitle}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:800, color:'#C94A3A' }}>{activeDay.meals.length ? `${activeDay.meals.length} ideas` : 'No ideas'}</span>
                  </div>

                  {topPick ? (
                    <div style={{ background:'var(--white)', border:'1.5px solid #F4C8C1', borderRadius:24, padding:18, position:'relative' }}>
                      <div style={{ position:'absolute', top:16, right:16, background:'#FFF5F0', color:'#C94A3A', fontSize:10, fontWeight:800, padding:'4px 10px', borderRadius:999 }}>
                        TOP PICK
                      </div>
                      <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:12 }}>
                        <span style={{ fontSize:48, lineHeight:1 }}>{topPick.emoji}</span>
                        <div style={{ flex:1, minWidth:0, paddingRight:80 }}>
                          <div style={{ fontWeight:800, fontSize:18, color:'var(--ink)', lineHeight:1.25 }}>{topPick.name}</div>
                          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:8 }}>
                            <span style={{ fontSize:12, color:'var(--mu)' }}>⏱ {topPick.cookTime} min</span>
                            <span style={{ fontSize:12, color:'var(--mu)' }}>🔥 {topPick.kcal} kcal</span>
                            <span style={{ fontSize:12, color:'#C94A3A', fontWeight:700 }}>💪 {topPick.protein}g P</span>
                          </div>
                        </div>
                      </div>
                      <p style={{ fontSize:13, color:'var(--mu)', lineHeight:1.55, marginBottom:14 }}>{topPick.description}</p>
                      <div style={{ display:'flex', gap:8 }}>
                        <button
                          onClick={() => setRecipeScreen(topPick)}
                          style={{ flex:1, background:'#C94A3A', color:'#fff', border:'none', borderRadius:16, padding:'14px', fontSize:15, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}
                        >
                          ▶ Open recipe
                        </button>
                        <button
                          onClick={() => markNotForMe(topPick.name)}
                          title="Hide this recipe — won't suggest again"
                          style={{ background:'var(--white)', color:'var(--mu)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'14px 14px', fontSize:13, fontWeight:700, fontFamily:'inherit', cursor:'pointer', flexShrink:0 }}
                        >
                          ✕ Not for me
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background:'var(--white)', border:'1.5px solid var(--bd)', borderRadius:20, padding:'24px 18px', textAlign:'center', color:'var(--mu)', fontSize:13 }}>
                      Nothing new for this day yet.
                    </div>
                  )}

                  {otherMeals.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      {otherMeals.map((meal, index) => (
                        <div key={`${activeDay.id}-${meal.name}-${index}`} style={{ background:'var(--white)', border:'1.5px solid var(--bd)', borderRadius:20, padding:14 }}>
                          <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:10 }}>
                            <span style={{ fontSize:36 }}>{meal.emoji}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)', lineHeight:1.25 }}>{meal.name}</div>
                              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:6 }}>
                                <span style={{ fontSize:12, color:'var(--mu)' }}>⏱ {meal.cookTime} min</span>
                                <span style={{ fontSize:12, color:'var(--mu)' }}>🔥 {meal.kcal} kcal</span>
                                <span style={{ fontSize:12, color:'#C94A3A', fontWeight:700 }}>💪 {meal.protein}g P</span>
                              </div>
                            </div>
                          </div>
                          <p style={{ fontSize:13, color:'var(--mu)', lineHeight:1.5, marginBottom:10 }}>{meal.description}</p>
                          <div style={{ display:'flex', gap:8 }}>
                            <button
                              onClick={() => setRecipeScreen(meal)}
                              style={{ flex:1, background:'#C94A3A', color:'#fff', border:'none', borderRadius:14, padding:'12px', fontSize:14, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}
                            >
                              ▶ Open recipe
                            </button>
                            <button
                              onClick={() => markNotForMe(meal.name)}
                              title="Hide this recipe — won't suggest again"
                              style={{ background:'var(--white)', color:'var(--mu)', border:'1.5px solid var(--bd)', borderRadius:14, padding:'12px', fontSize:12, fontWeight:700, fontFamily:'inherit', cursor:'pointer', flexShrink:0 }}
                            >
                              ✕ Not for me
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          ) : displayMeals.length === 0 ? (
            <div style={{ background:'var(--white)', border:'1.5px solid var(--bd)', borderRadius:20, padding:'26px 18px', textAlign:'center' }}>
              <div style={{ fontSize:34, marginBottom:10 }}>🍳</div>
              <div style={{ fontWeight:800, fontSize:16, color:'var(--ink)', marginBottom:6 }}>No fresh meal ideas right now</div>
              <div style={{ fontSize:13, color:'var(--mu)', lineHeight:1.5 }}>You already cooked the current suggestions. Refresh for new ideas or wait until the cooldown ends.</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
              {displayMeals.slice(0, 4).map((meal, index) => (
                <div key={`${meal.name}-${index}`} style={{ background:'var(--white)', border:'1.5px solid #F4C8C1', borderRadius:24, padding:18, position:'relative' }}>
                  {meal.usesExpiring && (
                    <div style={{ position:'absolute', top:16, right:16, background:'#FEE2E2', color:'#C94A3A', fontSize:10, fontWeight:800, padding:'4px 10px', borderRadius:999 }}>
                      USE TODAY
                    </div>
                  )}
                  <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:12 }}>
                    <span style={{ fontSize:50, lineHeight:1 }}>{meal.emoji}</span>
                    <div style={{ flex:1, minWidth:0, paddingRight: meal.usesExpiring ? 86 : 0 }}>
                      <div style={{ fontWeight:800, fontSize:18, color:'var(--ink)', lineHeight:1.25 }}>{meal.name}</div>
                      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:8 }}>
                        <span style={{ fontSize:12, color:'var(--mu)' }}>⏱ {meal.cookTime} min</span>
                        <span style={{ fontSize:12, color:'var(--mu)' }}>🔥 {meal.kcal} kcal</span>
                        <span style={{ fontSize:12, color:'#C94A3A', fontWeight:700 }}>💪 {meal.protein}g P</span>
                      </div>
                      {(meal.safeFor && meal.safeFor.length > 0) && (
                        <div style={{ marginTop:10, fontSize:12, color:'#15803D' }}>👶 {meal.safeFor[0]}-safe</div>
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize:13, color:'var(--mu)', lineHeight:1.55, marginBottom:14 }}>{meal.description}</p>
                  <div style={{ fontSize:11, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8 }}>FROM YOUR FRIDGE</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
                    {meal.ingredients.slice(0, 5).map((ingredient, idx) => (
                      <span key={`${ingredient}-${idx}`} style={{ background:'var(--wa)', borderRadius:999, padding:'6px 12px', fontSize:12, fontWeight:700, color:'var(--ink)' }}>
                        {ingredient.split(' ').slice(0, 2).join(' ')}
                      </span>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button
                      onClick={() => setRecipeScreen(meal)}
                      style={{ flex:1, background:'#C94A3A', color:'#fff', border:'none', borderRadius:16, padding:'14px', fontSize:15, fontWeight:800, fontFamily:'inherit', cursor:'pointer' }}
                    >
                      ▶ Cook this
                    </button>
                    <button
                      onClick={() => markNotForMe(meal.name)}
                      title="Hide this recipe — won't suggest again"
                      style={{ background:'var(--white)', color:'var(--mu)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'14px 16px', fontSize:13, fontWeight:700, fontFamily:'inherit', cursor:'pointer', flexShrink:0 }}
                    >
                      ✕ Not for me
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Restock screen ────────────────────────────────────────────────────────────
  function ScreenRestock() {
    const currency = COUNTRY_CURRENCY[s.country]?.symbol || '$';
    // Determine region: use s.restockRegion if set, otherwise derive from country
    const countryToRegion: Record<string,string> = { IN:'IN', SG:'SG', US:'US', AU:'US', GB:'US', MY:'SG', PK:'IN', AE:'SG' };
    const effectiveRegion = s.restockRegion || countryToRegion[s.country] || 'US';

    const REGION_STORES: Record<string, { name:string; color:string; url:(q:string)=>string }[]> = {
      IN: [
        { name:'BigBasket',        color:'#DE3B3B', url:q=>`https://www.bigbasket.com/ps/?q=${encodeURIComponent(q)}` },
        { name:'Blinkit',          color:'#F7BA02', url:q=>`https://blinkit.com/s/?q=${encodeURIComponent(q)}` },
        { name:'Swiggy Instamart', color:'#F97316', url:q=>`https://www.swiggy.com/instamart/search?query=${encodeURIComponent(q)}` },
        { name:'Amazon Fresh',     color:'#146EB4', url:q=>`https://www.amazon.in/s?k=${encodeURIComponent(q)}&i=amazonfresh` },
      ],
      SG: [
        { name:'Shopee',    color:'#F5832A', url:q=>`https://shopee.sg/search?keyword=${encodeURIComponent(q)}` },
        { name:'GrabMart',  color:'#00B14F', url:q=>`https://mart.grab.com/search?q=${encodeURIComponent(q)}` },
        { name:'Amazon SG', color:'#146EB4', url:q=>`https://www.amazon.sg/s?k=${encodeURIComponent(q)}` },
        { name:'RedMart',   color:'#E8192C', url:q=>`https://redmart.lazada.sg/catalog/?q=${encodeURIComponent(q)}` },
      ],
      US: [
        { name:'Amazon Fresh', color:'#146EB4', url:q=>`https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=amazonfresh` },
        { name:'Instacart',    color:'#43A832', url:q=>`https://www.instacart.com/store/search/${encodeURIComponent(q)}` },
        { name:'Walmart',      color:'#0071CE', url:q=>`https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
        { name:'Whole Foods',  color:'#00674B', url:q=>`https://www.wholefoodsmarket.com/search?text=${encodeURIComponent(q)}` },
      ],
    };
    const stores = REGION_STORES[effectiveRegion] || REGION_STORES['US'];
    const REGION_FLAGS: Record<string,string> = { IN:'🇮🇳', SG:'🇸🇬', US:'🇺🇸' };
    const REGION_LABELS: Record<string,string> = { IN:'India', SG:'Singapore', US:'USA' };

    const items = s.restockItems;
    const toBuy = items.filter(it => !it.checked).length;
    const checked = items.filter(it => it.checked).length;
    const estTotal = items.reduce((sum, it) => sum + (it.cost ?? 0) * it.qty, 0);

    function addRestockItem() {
      const name = restockInput.trim();
      if (!name) return;
      const newItem: RestockItem = {
        id: uid(), name: name.charAt(0).toUpperCase() + name.slice(1),
        qty: 1, unit: 'pcs',
        cost: estimatePrice(name, s.country),
        checked: false, addedFrom: 'manual',
      };
      up({ restockItems: [...s.restockItems, newItem] });
      setRestockInput('');
    }

    function toggleCheck(id: string) {
      up({ restockItems: s.restockItems.map(it => it.id === id ? { ...it, checked: !it.checked } : it) });
    }

    function removeRestockItem(id: string) {
      up({ restockItems: s.restockItems.filter(it => it.id !== id) });
    }

    function openAllStores() {
      const names = items.filter(it => !it.checked).map(it => it.name);
      if (!names.length) { showT('Add items first'); return; }
      const query = names.join(' ');
      stores.forEach(st => window.open(st.url(query), '_blank'));
    }

    const regionNames = { IN: 'INDIA', SG: 'SINGAPORE', US: 'USA' };

    return (
      <div className="screen" style={{ background:'var(--cr)', paddingBottom:100 }}>
        {/* Header */}
        <div style={{ padding:'16px 16px 12px', background:'var(--white)', borderBottom:'1.5px solid var(--bd)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'1.2px', marginBottom:4 }}>SHOPPING · THIS WEEK</div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'var(--ink)', marginBottom:12 }}>Restock list</h1>
          {/* Stats row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
            {[
              { label:'TO BUY',          val: String(toBuy) },
              { label:'CHECKED',         val: String(checked) },
              { label:'EST. TOTAL',      val: estTotal > 0 ? `${currency}${estTotal.toFixed(0)}` : '—' },
            ].map(stat => (
              <div key={stat.label} style={{ background:'var(--wa)', border:'1.5px solid var(--bd)', borderRadius:14, padding:'10px 10px 8px' }}>
                <div style={{ fontSize:9, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:4 }}>{stat.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--ink)' }}>{stat.val}</div>
              </div>
            ))}
          </div>
          {/* Region selector */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--mu)', letterSpacing:'.6px' }}>REGION</span>
            {(['IN','SG','US'] as const).map(r => (
              <button key={r} onClick={() => up({ restockRegion: r })}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:999, border:`1.5px solid ${effectiveRegion===r?'#C94A3A':'var(--bd)'}`, background: effectiveRegion===r?'#FFF5F0':'var(--white)', color: effectiveRegion===r?'#C94A3A':'var(--ink)', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                <span>{REGION_FLAGS[r]}</span> {REGION_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Add input */}
        <div style={{ padding:'14px 16px', background:'var(--white)', borderBottom:'1.5px solid var(--bd)', display:'flex', gap:10 }}>
          <input
            type="text"
            inputMode="text"
            placeholder="Add item…"
            value={restockInput}
            onChange={e => setRestockInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addRestockItem(); }}
            style={{ flex:1, padding:'13px 16px', borderRadius:14, border:'1.5px solid var(--bd)', fontSize:15, fontFamily:'inherit', outline:'none', background:'var(--wa)', color:'var(--ink)' }}
          />
          <button onClick={addRestockItem}
            style={{ padding:'13px 20px', borderRadius:14, border:'none', background:'#C94A3A', color:'#fff', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
            Add
          </button>
        </div>

        <div style={{ padding:'14px 16px' }}>
          {/* Empty state */}
          {items.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 24px' }}>
              <div style={{ fontSize:52, marginBottom:16 }}>🛒</div>
              <div style={{ fontWeight:800, fontSize:18, color:'var(--ink)', marginBottom:8 }}>Nothing to buy yet</div>
              <div style={{ fontSize:14, color:'var(--mu)', lineHeight:1.6 }}>
                Items you use from your fridge will show up here for easy restocking.
              </div>
            </div>
          ) : (
            <>
              {/* Unchecked items */}
              {items.filter(it => !it.checked).length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:10 }}>TO BUY</div>
                  {items.filter(it => !it.checked).map(it => (
                    <div key={it.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--white)', borderRadius:16, marginBottom:8, border:'1.5px solid var(--bd)' }}>
                      <button onClick={() => toggleCheck(it.id)}
                        style={{ width:24, height:24, borderRadius:12, border:'2px solid var(--bd)', background:'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:'var(--ink)' }}>{it.name}</div>
                        <div style={{ fontSize:11, color:'var(--mu)', marginTop:2 }}>{it.qty} {it.unit}{it.cost ? ` · ${currency}${it.cost.toFixed(2)}` : ''}</div>
                      </div>
                      <button onClick={() => removeRestockItem(it.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--mu)', padding:'4px' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Checked items */}
              {items.filter(it => it.checked).length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:10 }}>IN CART ✓</div>
                  {items.filter(it => it.checked).map(it => (
                    <div key={it.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--wa)', borderRadius:16, marginBottom:8, border:'1.5px solid var(--bd)', opacity:.7 }}>
                      <button onClick={() => toggleCheck(it.id)}
                        style={{ width:24, height:24, borderRadius:12, border:'2px solid var(--sage)', background:'var(--sagel)', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'var(--sage)' }}>✓</button>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:'var(--mu)', textDecoration:'line-through' }}>{it.name}</div>
                      </div>
                      <button onClick={() => removeRestockItem(it.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--mu)', padding:'4px' }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => up({ restockItems: s.restockItems.filter(it => !it.checked) })}
                    style={{ width:'100%', padding:'10px', borderRadius:12, border:'1.5px solid var(--bd)', background:'var(--white)', color:'var(--mu)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', marginTop:4 }}>
                    Clear checked items
                  </button>
                </div>
              )}
            </>
          )}

          {/* Order from stores */}
          <div style={{ marginTop:4 }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'1px', marginBottom:4 }}>
              ORDER FROM {regionNames[effectiveRegion as keyof typeof regionNames] || effectiveRegion}
            </div>
            <div style={{ fontSize:13, color:'var(--mu)', marginBottom:12, lineHeight:1.5 }}>
              {items.filter(i=>!i.checked).length > 0
                ? 'Tap a store to search your list. Or tap "Open all" to open all at once.'
                : 'Add items above, then tap a store to open search tabs.'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              {stores.map(st => (
                <button key={st.name}
                  onClick={() => {
                    const query = items.filter(i=>!i.checked).map(i=>i.name).join(' ') || 'groceries';
                    window.open(st.url(query), '_blank');
                  }}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 12px', background:'var(--white)', border:'1.5px solid var(--bd)', borderRadius:16, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
                  <div style={{ width:18, height:18, borderRadius:9, background:st.color, flexShrink:0 }} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--ink)' }}>{st.name}</div>
                    <div style={{ fontSize:11, color:'var(--mu)', marginTop:1 }}>Open in new tab →</div>
                  </div>
                </button>
              ))}
            </div>
            {items.filter(i=>!i.checked).length > 0 && (
              <button onClick={openAllStores}
                style={{ width:'100%', padding:'13px', borderRadius:14, border:'1.5px solid var(--bd)', background:'var(--white)', color:'var(--ink)', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginBottom:8 }}>
                Open all stores at once
              </button>
            )}
            <div style={{ fontSize:11, color:'var(--mu)', textAlign:'center', lineHeight:1.5 }}>
              Search links only. Your browser may block multi-tab popups — allow them if prompted.
            </div>
          </div>

          {/* Share */}
          <div style={{ marginTop:16, padding:'16px', background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:'var(--beel)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🛍️</div>
            <div>
              <div style={{ fontWeight:800, fontSize:15, color:'var(--ink)', marginBottom:2 }}>Share list with family</div>
              <div style={{ fontSize:12, color:'var(--mu)' }}>Send to anyone — syncs live in v2.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Insights screen ───────────────────────────────────────────────────────────
  function ScreenInsights() {
    const currency = COUNTRY_CURRENCY[s.country]?.symbol || '$';

    // ── Data derivations ──
    // cost on each item is the TOTAL price for that item as listed (not per gram/unit)
    // never multiply by qty — that would turn $6 chicken (500g) into $3000
    const fridgeValue = parseFloat(
      s.items.reduce((sum, it) => sum + (it.cost ?? estimatePrice(it.name, s.country)), 0).toFixed(2)
    );
    const avgCost = s.items.length > 0 ? fridgeValue / s.items.length : 3;
    const usedValue   = parseFloat((s.itemsUsed   * avgCost).toFixed(2));
    const wastedValue = parseFloat((s.itemsWasted  * avgCost).toFixed(2));
    const total = usedValue + wastedValue;
    const effPct = total > 0 ? Math.round((usedValue / total) * 100) : 0;

    // Most wasted category — derived from items the user actually marked as wasted
    const wastedEntries = Object.entries(s.wastedByCategory || {}).filter(([, n]) => n > 0);
    const mostWasted = wastedEntries.length > 0
      ? wastedEntries.sort((a,b)=>b[1]-a[1])[0][0]
      : null;
    const mostWastedCount = wastedEntries.length > 0
      ? wastedEntries.sort((a,b)=>b[1]-a[1])[0][1]
      : 0;

    // Saved this month (items used × avg price)
    const savedThisMonth = parseFloat((s.itemsUsed * avgCost).toFixed(2));

    // Has enough data for 7-day chart? (≥3 distinct added days OR ≥3 items used)
    const addedDays = new Set(s.items.map(it => (it.added || '').slice(0, 10)).filter(Boolean));
    const hasChartData = addedDays.size >= 3 || s.itemsUsed >= 3;

    // Build 7-day bar chart data
    const days7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return { label: d.toLocaleDateString('en', { weekday:'short' }), used:0, wasted:0 };
    });
    // (future: hydrate from event log; for now bars stay at 0 showing the structure)
    const barMax = Math.max(...days7.map(d => d.used + d.wasted), 1);

    // Weekly digest text
    let digestText = '"Get started — log a meal this week and we\'ll track your kitchen efficiency."';
    if (s.itemsUsed > 0 || s.itemsWasted > 0) {
      if (s.itemsWasted === 0) digestText = `"Zero waste this week — great job! You used ${s.itemsUsed} item${s.itemsUsed!==1?'s':''}."`;
      else if (effPct >= 70) digestText = `"Solid week — ${effPct}% efficiency. Keep using items before they expire."`;
      else digestText = `"${s.itemsWasted} item${s.itemsWasted!==1?'s':''} wasted this week. Try planning meals around expiring items."`;
    }

    // Circular efficiency ring
    const R = 40, CIRC = 2 * Math.PI * R;
    const dash = CIRC * (effPct / 100);

    const isNewUser = s.itemsUsed === 0 && s.itemsWasted === 0 && s.items.length < 4;
    const subheadline = isNewUser
      ? 'Start logging what you use and waste.'
      : effPct >= 70 ? 'Great kitchen efficiency this week!'
      : s.itemsWasted > 2 ? 'Some waste this week — use expiring items first.'
      : 'Your kitchen summary.';

    return (
      <div className="screen" style={{ background:'var(--cr)', paddingBottom:40 }}>
        {/* Header */}
        <div style={{ padding:'16px 16px 14px', background:'var(--white)', borderBottom:'1.5px solid var(--bd)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'1.2px', marginBottom:6 }}>INSIGHTS · THIS WEEK</div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'var(--ink)', lineHeight:1.25 }}>{subheadline}</h1>
        </div>

        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>

          {/* Fridge Efficiency card */}
          <div style={{ background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', padding:'18px 16px', display:'flex', alignItems:'center', gap:18 }}>
            {/* Circular ring */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <svg width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r={R} fill="none" stroke="#EDE5D8" strokeWidth="10"/>
                <circle cx="48" cy="48" r={R} fill="none" stroke={effPct > 0 ? '#4A7C59' : '#EDE5D8'}
                  strokeWidth="10" strokeDasharray={`${dash} ${CIRC - dash}`}
                  strokeLinecap="round" transform="rotate(-90 48 48)"/>
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:20, fontWeight:800, color:'var(--ink)', lineHeight:1 }}>{effPct}</span>
                <span style={{ fontSize:9, color:'var(--mu)', fontWeight:700, marginTop:2 }}>%</span>
              </div>
            </div>
            {/* Text */}
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8 }}>FRIDGE EFFICIENCY</div>
              <div style={{ fontSize:22, fontWeight:800, color:'var(--ink)', marginBottom:2 }}>{currency}{usedValue.toFixed(0)} used</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#C94A3A' }}>{currency}{wastedValue.toFixed(0)} wasted</div>
            </div>
          </div>

          {/* 7-day bar chart */}
          <div style={{ background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', padding:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px' }}>LAST 7 DAYS · {currency}</div>
              <div style={{ display:'flex', gap:10 }}>
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, color:'var(--mu)' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:'#4A7C59', display:'inline-block' }}/>used
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, color:'var(--mu)' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:'#C94A3A', display:'inline-block' }}/>wasted
                </span>
              </div>
            </div>
            {!hasChartData ? (
              <div style={{ textAlign:'center', padding:'28px 0', color:'var(--mu)' }}>
                <div style={{ fontSize:22, marginBottom:8 }}>📊</div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)', marginBottom:4 }}>Check back later</div>
                <div style={{ fontSize:12, color:'var(--mu)' }}>Your pattern will appear here once you've tracked a few days.</div>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:80 }}>
                {days7.map((d, i) => (
                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                    <div style={{ width:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-end', height:60, gap:2 }}>
                      {d.wasted > 0 && <div style={{ width:'100%', height:`${(d.wasted/barMax)*56}px`, background:'#C94A3A', borderRadius:'4px 4px 0 0', minHeight:4 }}/>}
                      {d.used > 0 && <div style={{ width:'100%', height:`${(d.used/barMax)*56}px`, background:'#4A7C59', borderRadius:'4px 4px 0 0', minHeight:4 }}/>}
                      {d.used === 0 && d.wasted === 0 && <div style={{ width:'100%', height:3, background:'var(--bd)', borderRadius:2, marginTop:'auto' }}/>}
                    </div>
                    <div style={{ fontSize:9, color:'var(--mu)', fontWeight:700 }}>{d.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Streak + Saved */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', padding:'16px' }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8 }}>STREAK</div>
              <div style={{ fontSize:32, fontWeight:800, color:'var(--ink)', lineHeight:1, marginBottom:4 }}>{s.wasteStreak}</div>
              <div style={{ fontSize:12, color:'var(--mu)' }}>days used &gt; wasted</div>
            </div>
            <div style={{ background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', padding:'16px' }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8 }}>SAVED THIS MONTH</div>
              <div style={{ fontSize:26, fontWeight:800, color:'#4A7C59', lineHeight:1, marginBottom:4 }}>{currency}{savedThisMonth.toFixed(0)}</div>
              <div style={{ fontSize:12, color:'var(--mu)' }}>food actually used</div>
            </div>
          </div>

          {/* Most Wasted + Fridge Value */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', padding:'16px' }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8 }}>MOST WASTED</div>
              {mostWasted
                ? <div style={{ fontSize:18, fontWeight:800, color:'#C94A3A', marginBottom:4 }}>{mostWasted}</div>
                : <div style={{ width:28, height:4, background:'#C94A3A', borderRadius:2, marginBottom:8 }}/>}
              <div style={{ fontSize:12, color:'var(--mu)' }}>{mostWasted ? `${mostWastedCount} item${mostWastedCount!==1?'s':''} thrown` : 'no waste yet'}</div>
            </div>
            <div style={{ background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', padding:'16px' }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:8 }}>FRIDGE VALUE</div>
              <div style={{ fontSize:26, fontWeight:800, color:'var(--ink)', lineHeight:1, marginBottom:4 }}>{currency}{fridgeValue.toFixed(0)}</div>
              <div style={{ fontSize:12, color:'var(--mu)' }}>{s.items.length} item{s.items.length!==1?'s':''} tracked</div>
            </div>
          </div>

          {/* Weekly Digest */}
          <div style={{ background:'var(--white)', borderRadius:18, border:'1.5px solid var(--bd)', padding:'18px 16px' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.8px', marginBottom:10 }}>WEEKLY DIGEST</div>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--ink)', lineHeight:1.4, marginBottom:8 }}>{digestText}</div>
            <div style={{ fontSize:12, color:'var(--mu)' }}>— Sent every Sunday, 9 PM</div>
          </div>

          {/* Paywall — full insights breakdown */}
          <PaywallChip
            trigger="insights_full_breakdown"
            label="Full insights — Pro Beta"
            sublabel="Per-item waste history, monthly savings · 30% off forever"
            onTrack={() => trackPaywall('insights_full_breakdown')}
          />

        </div>
      </div>
    );
  }

  // ── Profile screen ────────────────────────────────────────────────────────────
  function ScreenProfile() {
    const planLabel = authUser ? 'Saved account' : 'Guest demo';
    const detectedCountry = s.country || detectCountry();
    const countryName = COUNTRY_CURRENCY[detectedCountry]?.name || detectedCountry;
    const COUNTRY_FLAGS: Record<string,string> = { IN:'🇮🇳', PK:'🇵🇰', SG:'🇸🇬', MY:'🇲🇾', AE:'🇦🇪', GB:'🇬🇧', AU:'🇦🇺', US:'🇺🇸' };
    const countryFlag = COUNTRY_FLAGS[detectedCountry] || '🌍';
    function toggleSection(key: keyof typeof openProfileSections) {
      setOpenProfileSections(prev => ({ ...prev, [key]: !prev[key] }));
    }

    return (
      <div className="screen" style={{background:'var(--cr)',paddingBottom:200}}>
        <div style={{padding:'16px 16px 0',background:'var(--white)',borderBottom:'1.5px solid var(--bd)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{fontSize:20}}>🐝</span>
            <span style={{fontSize:11,color:'var(--mu)',fontWeight:600}}>personalised for everyone</span>
            <span style={{marginLeft:'auto', fontSize:11, color:'var(--mu)', fontWeight:600, display:'flex', alignItems:'center', gap:4}}>
              <span style={{fontSize:14}}>{countryFlag}</span>{countryName}
            </span>
          </div>
          <h1 style={{fontSize:24,color:'var(--ink)',marginBottom:2}}>fridge<span style={{color:'var(--bee)'}}>Bee</span></h1>
          <p style={{fontSize:14,color:'var(--mu)',marginBottom:10}}>Who&apos;s eating tonight?</p>
          <div style={{ marginBottom:14 }}>
            <PaywallChip
              trigger="profile_top_banner"
              label="Pro Beta — early-bird pricing"
              sublabel="Lock in 30% off forever before launch"
              onTrack={() => trackPaywall('profile_top_banner')}
            />
          </div>
          {/* Avatar row */}
          <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:16}}>
            {/* You (main user) */}
            <div onClick={()=>setActiveProfile('me')} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer',flexShrink:0}}>
              <div style={{width:52,height:52,borderRadius:26,
                background:activeProfile==='me'?'var(--bee)':'var(--beel)',
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,
                border:`2.5px solid ${activeProfile==='me'?'var(--beed)':'transparent'}`,
                transition:'all .15s',
              }}>🧑</div>
              <span style={{fontSize:11,fontWeight:700,color:activeProfile==='me'?'var(--beed)':'var(--mu)'}}>You</span>
            </div>
            {s.members.map(mb=>(
              <div key={mb.id} onClick={()=>setActiveProfile(mb.id)} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer',flexShrink:0}}>
                <div style={{width:52,height:52,borderRadius:26,
                  background:activeProfile===mb.id?'var(--bee)':'var(--beel)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,
                  border:`2.5px solid ${activeProfile===mb.id?'var(--beed)':'transparent'}`,
                  transition:'all .15s',
                }}>{mb.isKid?'👧':'👤'}</div>
                <span style={{fontSize:11,fontWeight:700,color:activeProfile===mb.id?'var(--beed)':'var(--mu)'}}>{mb.name}</span>
              </div>
            ))}
            {/* Add button */}
            <div onClick={()=>{setEditMember({id:'',name:'',isKid:false,allergies:[],dislikes:[],dietaryFilters:[]});setShowMember(true);}}
              style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer',flexShrink:0}}>
              <div style={{width:52,height:52,borderRadius:26,background:'var(--wa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,border:'2px dashed var(--bd)'}}>+</div>
              <span style={{fontSize:11,fontWeight:700,color:'var(--mu)'}}>Add</span>
            </div>
          </div>
        </div>
        <div style={{padding:'16px'}}>
          <ProfileSection isOpen={openProfileSections.about} onToggle={()=>toggleSection('about')} title="🧑 You" extra={`${COUNTRY_CURRENCY[s.country]?.name||s.country} · ${planLabel}`}>
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
              <div style={{width:52,height:52,borderRadius:26,background:'var(--beel)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>🐝</div>
              <div>
                <div style={{fontWeight:700,fontSize:17,color:'var(--ink)'}}>{s.name||'Bee Keeper'}</div>
                <div style={{fontSize:12,color:'var(--mu)'}}>These preferences shape meal ideas.</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:6}}>Name</label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="name"
                  value={s.name}
                  onChange={e=>up({name:e.target.value})}
                  onFocus={e => setTimeout(()=>e.target.scrollIntoView({behavior:'smooth',block:'center'}),300)}
                  style={{width:'100%',padding:'14px',borderRadius:12,border:'1.5px solid var(--bd)',fontSize:16,fontFamily:'inherit',outline:'none',background:'var(--white)',color:'var(--ink)',WebkitAppearance:'none'}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:8}}>Favourite cuisines</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                  {s.cuisines.map(c=>(
                    <span key={c} className="pill pill-bee" style={{cursor:'pointer'}} onClick={()=>up({cuisines:s.cuisines.filter(x=>x!==c)})}>
                      {c} ×
                    </span>
                  ))}
                </div>
                <input type="text" placeholder="Add cuisine and press Enter…"
                  value={s.customCuisine} onChange={e=>up({customCuisine:e.target.value})}
                  onKeyDown={e=>{if(e.key==='Enter'&&s.customCuisine.trim())up({cuisines:[...s.cuisines,s.customCuisine.trim()],customCuisine:''});}}
                  style={{width:'100%',padding:'10px 12px',borderRadius:12,border:'1.5px solid var(--bd)',fontSize:14,fontFamily:'inherit',outline:'none',background:'var(--white)'}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:8}}>Dietary preferences</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {DIETARY_OPTIONS.map(d=>{
                    const on = s.dietaryFilters.includes(d);
                    return (
                      <button key={d} onClick={()=>up({dietaryFilters:on?s.dietaryFilters.filter(x=>x!==d):[...s.dietaryFilters,d]})}
                        style={{padding:'6px 12px',borderRadius:999,border:'1.5px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                          borderColor:on?'var(--sage)':'var(--bd)',background:on?'var(--sagel)':'transparent',color:on?'var(--sage)':'var(--mu)'}}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:8}}>Allergies</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {ALLERGY_OPTIONS.map(a=>{
                    const on = s.allergies.includes(a);
                    return (
                      <button key={a} onClick={()=>up({allergies:on?s.allergies.filter(x=>x!==a):[...s.allergies,a]})}
                        style={{padding:'6px 12px',borderRadius:999,border:'1.5px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                          borderColor:on?'var(--red)':'var(--bd)',background:on?'var(--rl)':'transparent',color:on?'var(--red)':'var(--mu)'}}>
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ProfileSection>

          <ProfileSection isOpen={openProfileSections.account} onToggle={()=>toggleSection('account')} title={authUser ? '☁️ Account connected' : '🔐 Save your fridge'} extra={authUser ? `Signed in as ${authUser.email || 'your account'}` : 'Turn your demo into a saved account'}>
            <div className="card" style={{marginBottom:0, borderColor: authUser ? 'var(--sagel)' : 'var(--beel)', background: authUser ? '#F8FFFA' : '#FFF9EF', boxShadow:'none'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:12}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:'var(--ink)',marginBottom:4}}>
                  {authUser ? '☁️ Account connected' : '🔐 Save your fridge'}
                </div>
                <div style={{fontSize:12,color:'var(--mu)',lineHeight:1.5}}>
                  {authUser
                    ? `Signed in as ${authUser.email || 'your account'}. Your guest demo now syncs to Supabase.`
                    : 'You have already done the fun part. Create an account now so your fridge, members, and preferences stay with you.'}
                </div>
              </div>
              <span className={`pill ${authUser ? 'pill-sage' : 'pill-bee'}`}>
                {authUser ? 'Cloud on' : 'Guest mode'}
              </span>
            </div>

            {!authUser ? (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <button
                  onClick={continueWithGoogle}
                  disabled={authBusy}
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,width:'100%',padding:'14px 16px',borderRadius:14,border:'1.5px solid var(--bd)',background:'#fff',cursor:authBusy?'wait':'pointer',fontFamily:'inherit',fontWeight:700,fontSize:14,color:'var(--ink)'}}
                >
                  <span style={{fontSize:18}}>🟢</span>
                  Continue with Google
                </button>

                <div style={{display:'flex',gap:8}}>
                  {(['signup','signin'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={()=>setAuthMode(mode)}
                      style={{flex:1,padding:'10px 12px',borderRadius:12,border:'1.5px solid',borderColor:authMode===mode?'var(--ink)':'var(--bd)',background:authMode===mode?'var(--ink)':'#fff',color:authMode===mode?'#fff':'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}
                    >
                      {mode === 'signup' ? 'Create account' : 'Sign in'}
                    </button>
                  ))}
                </div>

                <div style={{display:'flex',gap:8}}>
                  {(['password','magic'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={()=>setEmailMode(mode)}
                      style={{flex:1,padding:'9px 12px',borderRadius:12,border:'1.5px solid',borderColor:emailMode===mode?'var(--bee)':'var(--bd)',background:emailMode===mode?'var(--beel)':'#fff',color:emailMode===mode?'var(--beed)':'var(--ink)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}
                    >
                      {mode === 'password' ? 'Email + password' : 'Magic link'}
                    </button>
                  ))}
                </div>

                <input
                  type="email"
                  value={authEmail}
                  onChange={e=>setAuthEmail(e.target.value)}
                  placeholder="Email address"
                  autoCapitalize="none"
                  autoCorrect="off"
                  style={{width:'100%',padding:'12px',borderRadius:12,border:'1.5px solid var(--bd)',fontSize:15,fontFamily:'inherit',outline:'none',background:'#fff'}}
                />

                {emailMode === 'password' && (
                  <input
                    type="password"
                    value={authPassword}
                    onChange={e=>setAuthPassword(e.target.value)}
                    placeholder={authMode === 'signup' ? 'Create a password' : 'Password'}
                    style={{width:'100%',padding:'12px',borderRadius:12,border:'1.5px solid var(--bd)',fontSize:15,fontFamily:'inherit',outline:'none',background:'#fff'}}
                  />
                )}

                <button className="btn-bee" onClick={submitEmailAuth} disabled={authBusy} style={{opacity:authBusy ? 0.7 : 1}}>
                  {authBusy
                    ? 'Working…'
                    : emailMode === 'magic'
                      ? 'Email me a magic link'
                      : authMode === 'signup'
                        ? 'Create account & save my fridge'
                        : 'Sign in & load my fridge'}
                </button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div style={{padding:'12px',borderRadius:12,background:'#fff',border:'1.5px solid var(--sagel)'}}>
                    <div style={{fontSize:10,fontWeight:800,color:'var(--mu)',letterSpacing:'.08em',marginBottom:5}}>ACCOUNT</div>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--ink)',wordBreak:'break-word'}}>{authUser.email}</div>
                  </div>
                  <div style={{padding:'12px',borderRadius:12,background:'#fff',border:'1.5px solid var(--sagel)'}}>
                    <div style={{fontSize:10,fontWeight:800,color:'var(--mu)',letterSpacing:'.08em',marginBottom:5}}>SYNC</div>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--sage)'}}>{cloudReady ? 'Up to date' : 'Syncing…'}</div>
                  </div>
                </div>
                <button className="btn-ghost" onClick={signOutUser}>
                  Sign out
                </button>
              </div>
            )}

            {cloudStatus && (
              <div style={{marginTop:12,fontSize:12,color:cloudStatus.includes('could not') || cloudStatus.includes('Enter') ? 'var(--red)' : 'var(--mu)'}}>
                {cloudStatus}
              </div>
            )}
          </div>
          </ProfileSection>

          <ProfileSection isOpen={openProfileSections.household} onToggle={()=>toggleSection('household')} title="👨‍👩‍👧 Household" extra="Kids, allergies, and restrictions also guide recipe safety">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <button onClick={()=>{setEditMember({id:'',name:'',isKid:false,allergies:[],dislikes:[],dietaryFilters:[]});setShowMember(true);}}
                style={{background:'var(--beel)',border:'none',color:'var(--beed)',fontWeight:700,fontSize:13,padding:'6px 12px',borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>
                + Add
              </button>
            </div>
            {s.members.length===0
              ? <div style={{textAlign:'center',color:'var(--mu)',fontSize:13,padding:'10px 0'}}>No members added yet</div>
              : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {s.members.map(mb=>(
                    <div key={mb.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px',background:'var(--wa)',borderRadius:10}}>
                      <div onClick={()=>{setEditMember(mb);setShowMember(true);}}
                        style={{display:'flex',alignItems:'center',gap:12,flex:1,cursor:'pointer',minWidth:0}}>
                        <div style={{width:36,height:36,borderRadius:18,background:'var(--beel)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                          {mb.isKid?'👧':'👤'}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:14,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{mb.name}</div>
                          <div style={{fontSize:11,color:'var(--mu)'}}>
                            {mb.age!==undefined?`Age ${mb.age}`:'Age not set'}
                            {mb.allergies.length>0?` · ${mb.allergies.length} allergy`:''}
                            {mb.dietaryFilters.length>0?` · ${mb.dietaryFilters.join(', ')}`:''}
                          </div>
                        </div>
                        <span style={{color:'var(--mu)',fontSize:20,flexShrink:0}}>›</span>
                      </div>
                      <button
                        onClick={(e)=>{
                          e.stopPropagation();
                          if (!confirm(`Remove ${mb.name} from household?`)) return;
                          up({members:s.members.filter(x=>x.id!==mb.id)});
                          if (activeProfile===mb.id) setActiveProfile('me');
                          showT(`${mb.name} removed`);
                        }}
                        title={`Remove ${mb.name}`}
                        aria-label={`Remove ${mb.name}`}
                        style={{width:30,height:30,borderRadius:8,background:'#FFF5F5',border:'1px solid #F4C8C1',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,padding:0}}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
            }
            <div style={{ marginTop:12 }}>
              <PaywallChip
                trigger="profile_household_addmore"
                label="Family mode — Pro Beta"
                sublabel="Add more members with separate diets · 30% off forever"
                onTrack={() => trackPaywall('profile_household_addmore')}
              />
            </div>
          </ProfileSection>

          <ProfileSection isOpen={openProfileSections.notifications} onToggle={()=>toggleSection('notifications')} title="🔔 Notifications">
            {NOTIF_OPTIONS.map(opt=>{
              const on = s.notifTimes[opt.key]!==undefined;
              return (
                <div key={opt.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{opt.icon} {opt.label}</div>
                    <div style={{fontSize:11,color:'var(--mu)'}}>{opt.desc}</div>
                  </div>
                  <div onClick={()=>{const nt={...s.notifTimes};if(on)delete nt[opt.key];else nt[opt.key]='08:00';up({notifTimes:nt,notifEnabled:Object.keys(nt).length>0});}}
                    style={{width:44,height:24,borderRadius:12,cursor:'pointer',background:on?'var(--bee)':'var(--bd)',position:'relative',transition:'background .2s',flexShrink:0}}>
                    <div style={{width:18,height:18,borderRadius:9,background:'#fff',position:'absolute',top:3,left:on?23:3,transition:'left .2s'}}/>
                  </div>
                </div>
              );
            })}
          </ProfileSection>

          <ProfileSection isOpen={openProfileSections.share} onToggle={()=>toggleSection('share')} title="📤 Share & Invite">
            <button
              onClick={()=>{
                const msg = encodeURIComponent(`Hey! I'm using FridgeBee to track what's in my fridge and get AI recipe ideas before food expires 🐝🍽️\n\nCheck it out: ${window.location.origin}`);
                window.open(`https://wa.me/?text=${msg}`, '_blank');
              }}
              style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'14px 16px',borderRadius:14,border:'1.5px solid #25D366',background:'#F0FFF4',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
              <div style={{width:40,height:40,borderRadius:10,background:'#25D366',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                💬
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:'#1A7A36'}}>Share via WhatsApp</div>
                <div style={{fontSize:12,color:'var(--mu)',marginTop:1}}>Invite friends & family to FridgeBee</div>
              </div>
            </button>
          </ProfileSection>

          <ProfileSection isOpen={openProfileSections.settings} onToggle={()=>toggleSection('settings')} title="⚙️ Reset & Sign out">
            {authUser && (
              <button
                onClick={signOutUser}
                style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'14px 16px',borderRadius:14,border:'1.5px solid var(--bd)',background:'#fff',cursor:'pointer',fontFamily:'inherit',textAlign:'left',marginBottom:8}}>
                <span style={{fontSize:20}}>👋</span>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--ink)'}}>Sign out only</div>
                  <div style={{fontSize:12,color:'var(--mu)',marginTop:1}}>Keep local guest data on this device</div>
                </div>
              </button>
            )}
            <button
              onClick={async ()=>{
                if(!confirm('This will clear all your fridge data and preferences. Are you sure?')) return;
                if (authUser) {
                  await supabase.from('user_app_state').delete().eq('user_id', authUser.id);
                  await supabase.auth.signOut();
                }
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem('fb_add_cnt');
                setS(INIT);
                // Clear UI state too, otherwise the next onboarding still shows previous picks/cuisines.
                setObPicks([]);
                setSearch('');
                setCatFilter('All');
                setTab('fridge');
                setShelf('fridge');
                setActiveProfile('me');
                setMeals([]);
                setPlannedDays([]);
                setEditItem(null);
                setEditMember(null);
                setShowMember(false);
                setShowAdd(false);
                setShowPaywall(false);
                setRecipeScreen(null);
                setVoiceText('');
                setParsed([]);
                setParsedEditable([]);
                setScanFile(null);
              }}
              style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'14px 16px',borderRadius:14,border:'1.5px solid #EF4444',background:'#FFF5F5',cursor:'pointer',fontFamily:'inherit',textAlign:'left',marginBottom:8}}>
              <span style={{fontSize:20}}>🚪</span>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:'#DC2626'}}>Log out &amp; reset</div>
                  <div style={{fontSize:12,color:'var(--mu)',marginTop:1}}>Clear all data and start fresh</div>
                </div>
              </button>
          </ProfileSection>
        </div>
      </div>
    );
  }

  // ── Modals ────────────────────────────────────────────────────────────────────
  function ModalItemSheet() {
    if (!editItem) return null;
    const d = daysUntil(editItem.expiry);
    const currency = COUNTRY_CURRENCY[s.country]?.symbol || '$';
    const estimatedCost = editItem.cost ?? estimatePrice(editItem.name, s.country);
    return (
      <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEditItem(null); }}>
        <div className="modal-sheet" style={{ maxHeight:'80%' }}>
          <div className="modal-handle"/>
          <div className="modal-body" style={{ padding:'14px 16px 28px' }}>
            {/* Compact header: emoji + name + delete on one row */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ width:56, height:56, borderRadius:14, background: CAT_TINT[editItem.category] || 'var(--wa)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, flexShrink:0 }}>
                {editItem.emoji}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <h2 style={{ fontSize:22, color:'var(--ink)', fontFamily:'Fraunces,Georgia,serif', fontWeight:500, lineHeight:1.15 }}>{editItem.name}</h2>
                <div style={{ fontSize:11, color:'var(--mu)', marginTop:4, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <span>{editItem.qty}{editItem.unit}</span>
                  <span>·</span>
                  <span>{d < 0 ? 'Expired' : d === 0 ? 'Today' : `${d} days`}</span>
                  <span>·</span>
                  <span style={{ color:'var(--ink)', fontWeight:600 }}>{currency}</span>
                  <input
                    type="number" min="0" step="0.1"
                    value={editItem.cost ?? ''}
                    placeholder={estimatedCost.toFixed(1)}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      const nextCost = isNaN(v) ? undefined : v;
                      up({ items: s.items.map(i => i.id === editItem.id ? { ...i, cost: nextCost } : i) });
                      setEditItem({ ...editItem, cost: nextCost });
                    }}
                    style={{ width:62, padding:'2px 6px', borderRadius:6, border:'1px solid var(--bd)', fontSize:11, fontFamily:'inherit', outline:'none', background:'var(--white)', color:'var(--ink)', textAlign:'right' }}
                    aria-label="Edit cost"
                  />
                  <span style={{ color:'var(--mu)' }}>(tap to edit)</span>
                </div>
              </div>
              <button onClick={() => { removeItem(editItem.id); setEditItem(null); }}
                style={{ width:34, height:34, borderRadius:10, background:'var(--wa)', border:'1.5px solid var(--bd)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mu)" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>

            {/* Quantity stepper — compact */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.6px', marginBottom:6 }}>HOW MUCH IS LEFT</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button
                  onClick={() => {
                    const nextQty = Math.max(1, editItem.qty - 1);
                    up({ items: s.items.map(i => i.id === editItem.id ? { ...i, qty: nextQty } : i) });
                    setEditItem({ ...editItem, qty: nextQty });
                  }}
                  style={{ width:38, height:38, borderRadius:10, border:'1.5px solid var(--bd)', background:'var(--white)', fontSize:20, cursor:'pointer', fontFamily:'inherit', color:'var(--ink)' }}
                >−</button>
                <input
                  type="number" min="1" value={editItem.qty}
                  onChange={e => {
                    const nextQty = Math.max(1, parseFloat(e.target.value) || 1);
                    up({ items: s.items.map(i => i.id === editItem.id ? { ...i, qty: nextQty } : i) });
                    setEditItem({ ...editItem, qty: nextQty });
                  }}
                  style={{ flex:1, padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--bd)', fontSize:15, fontWeight:700, fontFamily:'inherit', outline:'none', background:'var(--white)', textAlign:'center', color:'var(--ink)' }}
                />
                <button
                  onClick={() => {
                    const nextQty = editItem.qty + 1;
                    up({ items: s.items.map(i => i.id === editItem.id ? { ...i, qty: nextQty } : i) });
                    setEditItem({ ...editItem, qty: nextQty });
                  }}
                  style={{ width:38, height:38, borderRadius:10, border:'1.5px solid var(--bd)', background:'var(--white)', fontSize:20, cursor:'pointer', fontFamily:'inherit', color:'var(--ink)' }}
                >+</button>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
              <button onClick={() => { markUsed(editItem.id); setEditItem(null); }}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'#2D6A4F', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', color:'#fff' }}>
                ✓ Ate it / Used it all
              </button>
              <button onClick={() => {
                const cat = editItem.category || 'Other';
                up({
                  items: s.items.filter(i => i.id !== editItem.id),
                  itemsWasted: s.itemsWasted + 1,
                  wastedByCategory: {...s.wastedByCategory, [cat]: (s.wastedByCategory[cat]||0) + 1},
                });
                setEditItem(null); showT(`Removed ${editItem.name}`);
              }} style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid #EF4444', background:'#FFF5F5', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', color:'#EF4444' }}>
                ✕ Threw it / wasted
              </button>
            </div>

            <div style={{ fontSize:11, color:'var(--mu)', textAlign:'center' }}>
              Added via {editItem.addedBy === 'scan' ? '📷 scan' : editItem.addedBy === 'voice' ? '🎤 voice' : '✍️ manual'} · expiry auto-set from category
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ModalCook() {
    if (!cookItem) return null;
    return (
      <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setCookItem(null);}}>
        <div className="modal-sheet">
          <div className="modal-handle"/>
          <div className="modal-body" style={{padding:'20px 16px 36px'}}>
            <h3 style={{marginBottom:6}}>Meal ideas for {cookItem.name}</h3>
            <p style={{color:'var(--mu)',fontSize:13,marginBottom:24}}>Based on your fridge + cuisine preferences.</p>
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <div style={{animation:'bee-bob 2s infinite',display:'inline-block',marginBottom:12}}><BeeSVG size={44}/></div>
              <div style={{color:'var(--mu)',fontSize:13}}>AI meal suggestions — connect your OpenAI key to enable.</div>
            </div>
            <button className="btn-ghost" onClick={()=>setCookItem(null)} style={{marginTop:16}}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  function ModalCookDone() {
    if (!cookDoneItem) return null;
    function pick(c: string) {
      setCookChoice(c);
      if (c === 'all') {
        markUsed(cookDoneItem!.id);
      } else if (c === 'little') {
        up({ items: s.items.map(i => i.id === cookDoneItem!.id ? {...i, expiry:daysFromNow(1), qty:Math.max(1,Math.floor(i.qty*0.3))} : i), itemsUsed:s.itemsUsed+1, wasteStreak:s.wasteStreak+1 });
      } else {
        up({ items: s.items.map(i => i.id === cookDoneItem!.id ? {...i, expiry:daysFromNow(3)} : i), itemsUsed:s.itemsUsed+1, wasteStreak:s.wasteStreak+1 });
      }
      setCookConfirmed(true);
      setTimeout(() => {
        setCookDoneItem(null); setCookConfirmed(false); setCookChoice('');
        setTab('fridge');
      }, 1800);
    }
    const opts = [
      { id:'plenty', dot:'#22C55E', label:'Plenty left',   sub:'More than half still there' },
      { id:'little', dot:'#F5A623', label:'A little left', sub:'Less than a handful remaining' },
      { id:'all',    dot:'#EF4444', label:'Used it all',   sub:`${cookDoneItem.name} is finished` },
    ];
    return (
      <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setCookDoneItem(null); setCookConfirmed(false); setCookChoice(''); } }}>
        <div className="modal-sheet" style={{ maxHeight:'55%' }}>
          <div className="modal-handle"/>
          <div className="modal-body" style={{ padding:'20px 20px 36px' }}>
            {!cookConfirmed ? (
              <>
                <div style={{ textAlign:'center', marginBottom:20 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🎉</div>
                  <h3 style={{ fontSize:26, color:'var(--ink)', fontFamily:'Fraunces,Georgia,serif', fontWeight:500, marginBottom:4 }}>Nice</h3>
                  <p style={{ fontSize:14, color:'var(--mu)' }}>How much <strong>{cookDoneItem.name}</strong> is left in your fridge?</p>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {opts.map(opt => (
                    <button key={opt.id} onClick={() => pick(opt.id)}
                      style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:`1.5px solid ${cookChoice===opt.id?'var(--bee)':'var(--bd)'}`, background:cookChoice===opt.id?'var(--beel)':'var(--white)', cursor:'pointer', fontFamily:'inherit', textAlign:'left', width:'100%' }}>
                      <div style={{ width:18, height:18, borderRadius:9, background:opt.dot, flexShrink:0 }}/>
                      <div>
                        <div style={{ fontWeight:700, fontSize:15, color:'var(--ink)' }}>{opt.label}</div>
                        <div style={{ fontSize:12, color:'var(--mu)' }}>{opt.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ width:56, height:56, borderRadius:28, background:'var(--sagel)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 12px' }}>✓</div>
                <div style={{ fontWeight:700, fontSize:16, color:'var(--sage)', marginBottom:6 }}>Fridge updated!</div>
                <div style={{ fontSize:13, color:'var(--mu)', lineHeight:1.5 }}>
                  {cookChoice==='all' ? `${cookDoneItem.name} marked as used.` : cookChoice==='little' ? `${cookDoneItem.name} marked as low.` : `${cookDoneItem.name} still has plenty.`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function ModalAdd() {
    if (!showAdd) return null;
    const currency = COUNTRY_CURRENCY[s.country]?.symbol || '$';
    const recentSuggestions = Array.from(
      new Map(
        [...s.items]
          .sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime())
          .map(item => [item.name.toLowerCase(), item])
      ).values()
    ).slice(0, 8);
    const frequentSuggestions = Array.from(
      s.items.reduce((acc, item) => {
        const key = item.name.toLowerCase();
        const current = acc.get(key);
        if (!current) acc.set(key, { ...item, hits: 1 });
        else acc.set(key, { ...current, hits: current.hits + 1 });
        return acc;
      }, new Map<string, FoodItem & { hits: number }>())
        .values()
    ).sort((a, b) => b.hits - a.hits).slice(0, 8);
    const stapleSuggestions = QUICK_ITEMS.filter(item => ['Produce', 'Dairy', 'Grains'].includes(item.category)).slice(0, 10);

    function queueInstantItem(item: Partial<FoodItem>) {
      if (!item.name) return;
      setParsedEditable(prev => {
        const existingIndex = prev.findIndex(entry => entry.name?.toLowerCase() === item.name?.toLowerCase() && entry.unit === item.unit);
        if (existingIndex >= 0) {
          return prev.map((entry, index) => index === existingIndex ? { ...entry, qty: (entry.qty || 1) + (item.qty || 1) } : entry);
        }
        return [...prev, {
          ...item,
          addedBy: 'manual',
          cost: item.cost ?? estimatePrice(item.name || '', s.country),
        }];
      });
    }

    function InstantChip({ item }: { item: Partial<FoodItem> }) {
      return (
        <button
          onClick={() => queueInstantItem(item)}
          style={{
            display:'flex',
            alignItems:'center',
            gap:8,
            padding:'10px 12px',
            borderRadius:999,
            border:'1.5px solid #EADFD0',
            background:'#FFFDF9',
            cursor:'pointer',
            fontFamily:'inherit',
            flexShrink:0,
            boxShadow:'0 8px 16px rgba(122,107,85,.05)',
          }}
        >
          <span style={{ fontSize:18 }}>{item.emoji || '📦'}</span>
          <span style={{ fontSize:13, fontWeight:800, color:'var(--ink)' }}>{item.name}</span>
          <span style={{ fontSize:11, color:'var(--mu)', fontWeight:700 }}>{item.qty}{item.unit}</span>
        </button>
      );
    }

    async function handleParse() {
      const inputText = (typeTextRef.current?.value || '').trim();
      if (!inputText) return;
      try {
        const data = await requestParsedItems({ text: inputText });
        if (data.items?.length) {
          const withPrices = data.items.map((it: ParsedInputItem) => ({
            ...normalizeParsedItem(it, s.country),
            addedBy: 'manual' as const,
          }));
          if (withPrices.length === 1 && fallbackSplitItems(inputText).length > 1) {
            setParsedEditable(toEditableFallbackItems(inputText, s.country));
          } else {
            setParsedEditable(withPrices);
          }
          return;
        }
      } catch {}
      setParsedEditable(toEditableFallbackItems(inputText, s.country));
    }

    function confirmAll() {
      const batch = parsedEditable.filter(it => it.name).map(it => ({
        name: it.name!,
        emoji: it.emoji || '📦',
        shelf: (it.shelf || 'fridge') as Shelf,
        category: it.category || 'Other',
        qty: it.qty || 1,
        unit: it.unit || 'pcs',
        expiry: it.expiry || daysFromNow(7),
        cost: it.cost,
        addedBy: (it.addedBy || 'manual') as 'manual' | 'voice' | 'scan',
      }));
      addItems(batch);
      // Land the user on the fridge tab where the items appear, with filters cleared.
      const dominantShelf = (() => {
        const tally: Record<Shelf, number> = { fridge: 0, freezer: 0, pantry: 0 };
        batch.forEach(it => { tally[it.shelf] = (tally[it.shelf] || 0) + 1; });
        return (Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] as Shelf) || 'fridge';
      })();
      if (batch.length > 0) {
        setShelf(dominantShelf);
        setTab('fridge');
        setSearch('');
        setCatFilter('All');
      }
      setParsedEditable([]); setParsed([]); setShowAdd(false); setScanFile(null); setShowManualTypeFallback(false); setVoiceLoading(false); setVoiceText('');
    }

    return (
      <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setParsedEditable([]); setParsed([]); setShowManualTypeFallback(false); setVoiceLoading(false); setVoiceText(''); } }}>
        <div className="modal-sheet" style={{ maxHeight:'93%' }}>
          <div className="modal-handle"/>
          <div style={{ padding:'16px 20px 10px', borderBottom:'1px solid var(--bd)' }}>
            <h2 style={{ fontSize:22, color:'var(--ink)', fontFamily:'Fraunces,Georgia,serif', fontWeight:500, marginBottom:12 }}>Add to fridge</h2>
            {/* Mode tabs */}
            <div style={{ display:'flex', gap:8 }}>
              {(['voice','manual','scan'] as AddMode[]).map(m => (
                <button key={m} onClick={() => { setAddMode(m); setParsedEditable([]); setParsed([]); setShowManualTypeFallback(false); }}
                  style={{ flex:1, padding:'9px 4px', borderRadius:12, border:'2px solid', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                    borderColor: addMode===m ? '#C0392B' : 'var(--bd)',
                    background:  addMode===m ? '#FFF0EE' : 'transparent',
                    color:       addMode===m ? '#C0392B' : 'var(--ink)' }}>
                  {m==='voice'?'🎤 Voice':m==='manual'?'⚡ Instant add':'📷 Scan'}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-body" style={{ padding:'16px 20px' }}>

            {/* ── Voice ── */}
            {addMode === 'voice' && (
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <p style={{ color:'var(--mu)', fontSize:13, marginBottom:20 }}>
                  Say items naturally — &ldquo;2 litres milk, 500g chicken, some spinach&rdquo;
                </p>
                <button
                  onClick={() => { if (!voiceLoading) startVoice(); }}
                  disabled={voiceLoading}
                  style={{ width:80, height:80, borderRadius:40, background:isListening?'#C0392B':voiceLoading?'#ccc':'var(--bee)', border:'none', cursor: voiceLoading?'default':'pointer', fontSize:30, marginBottom:14,
                    boxShadow: isListening?'0 0 0 8px rgba(192,57,43,.2)':'0 4px 20px rgba(245,166,35,.4)',
                    animation: isListening?'pulseOp 1s ease-in-out infinite':voiceLoading?'pulseOp 0.8s ease-in-out infinite':'none' }}>
                  {voiceLoading ? '⏳' : isListening ? '⏹' : '🎤'}
                </button>
                <p style={{ fontSize:13, fontWeight:600, color:isListening?'#C0392B':voiceLoading?'var(--mu)':'var(--mu)', marginBottom:16 }}>
                  {voiceLoading ? 'Transcribing…' : isListening ? 'Listening… tap to stop' : 'Tap to start'}
                </p>
                {voiceText && !parsed.length && !voiceLoading && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ background:'var(--wa)', borderRadius:12, padding:'12px 14px', textAlign:'left', fontSize:14, color:'var(--ink)' }}>&ldquo;{voiceText}&rdquo;</div>
                    <button className="btn-bee" onClick={() => parseVoice(voiceText)}>Parse items →</button>
                  </div>
                )}
                {parsed.length > 0 && (
                  <div style={{ textAlign:'left' }}>
                    {parsed.map((it, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--white)', borderRadius:10, border:'1.5px solid var(--bd)', marginBottom:6 }}>
                        <span>{it.emoji||'📦'}</span>
                        <span style={{ fontWeight:600, fontSize:14, flex:1 }}>{it.name}</span>
                        <span style={{ fontSize:12, color:'var(--mu)' }}>{it.qty} {it.unit}</span>
                      </div>
                    ))}
                    <button className="btn-bee" onClick={() => {
                      const batch = parsed.filter(it => it.name).map(it => ({
                        name: it.name!,
                        emoji: it.emoji || '📦',
                        shelf: (it.shelf || 'fridge') as Shelf,
                        category: it.category || 'Other',
                        qty: it.qty || 1,
                        unit: it.unit || 'pcs',
                        expiry: it.expiry || daysFromNow(7),
                        addedBy: 'voice' as const,
                      }));
                      addItems(batch);
                      if (batch.length) { setTab('fridge'); setSearch(''); setCatFilter('All'); }
                      setParsed([]); setShowAdd(false); setVoiceText('');
                    }} style={{ marginTop:8 }}>Add {parsed.length} items →</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Instant add ── */}
            {addMode === 'manual' && (
              <div>
                <div style={{ background:'linear-gradient(180deg, #FFF9F1 0%, #FFFDF9 100%)', border:'1.5px solid #EFE4D5', borderRadius:18, padding:'14px', marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:'var(--ink)', marginBottom:4 }}>Fastest way to add</div>
                  <div style={{ fontSize:12, color:'var(--mu)', lineHeight:1.5 }}>
                    Tap the things you buy often. We&apos;ll queue them below so you can tweak quantity before adding.
                  </div>
                </div>
                {parsedEditable.length > 0 ? (
                  <div>
                    <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.7px', marginBottom:10 }}>
                      {parsedEditable.length} ITEM{parsedEditable.length > 1 ? 'S' : ''} READY TO ADD
                    </div>
                    {parsedEditable.map((item, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--white)', borderRadius:12, border:'1.5px solid var(--bd)', marginBottom:8 }}>
                        <span style={{ fontSize:20 }}>{item.emoji || '📦'}</span>
                        <span style={{ fontWeight:700, fontSize:14, flex:1, color:'var(--ink)' }}>{item.name}</span>
                        <input type="number" value={item.qty || 1} min="1"
                          onChange={e => { const v = parseFloat(e.target.value)||1; setParsedEditable(prev => prev.map((x,j) => j===i ? {...x,qty:v} : x)); }}
                          style={{ width:52, padding:'6px 4px', borderRadius:8, border:'1.5px solid var(--bd)', fontSize:13, fontFamily:'inherit', textAlign:'center', background:'var(--wa)' }}
                        />
                        <select value={item.unit || 'pcs'}
                          onChange={e => setParsedEditable(prev => prev.map((x,j) => j===i ? {...x,unit:e.target.value} : x))}
                          style={{ padding:'6px 4px', borderRadius:8, border:'1.5px solid var(--bd)', fontSize:12, fontFamily:'inherit', background:'var(--wa)' }}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                        <button onClick={() => setParsedEditable(prev => prev.filter((_,j) => j !== i))}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--mu)', fontSize:18, padding:'0 2px' }}>×</button>
                      </div>
                    ))}
                    <div style={{ fontSize:12, color:'var(--mu)', marginBottom:12 }}>
                      Adjust quantity if needed · price estimates in {currency}
                    </div>
                    <button onClick={confirmAll}
                      style={{ width:'100%', padding:'14px', borderRadius:14, background:'#C0392B', color:'#fff', border:'none', fontWeight:700, fontSize:16, cursor:'pointer', fontFamily:'inherit' }}>
                      Add {parsedEditable.length} item{parsedEditable.length > 1 ? 's' : ''} to fridge
                    </button>
                    <button
                      onClick={() => setParsedEditable([])}
                      style={{ width:'100%', marginTop:8, padding:'12px', borderRadius:14, background:'#FFF7F5', color:'#C0392B', border:'1.5px solid #F1D2CB', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}
                    >
                      Clear selection
                    </button>
                  </div>
                ) : (
                  <>
                    {[
                      {
                        label:'From your fridge history',
                        items: recentSuggestions.map(item => ({ name:item.name, emoji:item.emoji, shelf:item.shelf, category:item.category, qty:item.qty, unit:item.unit, expiry:daysFromNow(CATEGORY_EXPIRY[item.category] || 7) })),
                      },
                      {
                        label:'You add often',
                        items: frequentSuggestions.map(item => ({ name:item.name, emoji:item.emoji, shelf:item.shelf, category:item.category, qty:item.qty, unit:item.unit, expiry:daysFromNow(CATEGORY_EXPIRY[item.category] || 7) })),
                      },
                      {
                        label:'Quick staples',
                        items: stapleSuggestions.map(item => ({ name:item.name, emoji:item.emoji, shelf:item.shelf, category:item.category, qty:item.qty, unit:item.unit, expiry:item.expiry })),
                      },
                    ].filter(section => section.items.length > 0).map(section => (
                      <div key={section.label} style={{ marginBottom:16 }}>
                        <div style={{ fontSize:10, fontWeight:800, color:'var(--mu)', letterSpacing:'.9px', marginBottom:10 }}>{section.label.toUpperCase()}</div>
                        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
                          {section.items.map(item => <InstantChip key={`${section.label}-${item.name}-${item.unit}`} item={item} />)}
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowManualTypeFallback(v => !v)}
                      style={{ width:'100%', marginTop:6, padding:'12px 14px', borderRadius:14, background:'var(--white)', color:'var(--ink)', border:'1.5px solid var(--bd)', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}
                    >
                      {showManualTypeFallback ? 'Hide manual typing' : 'Type manually instead'}
                    </button>
                    {showManualTypeFallback && (
                      <div style={{ marginTop:12, padding:'14px', background:'var(--wa)', borderRadius:16, border:'1.5px solid var(--bd)' }}>
                        <textarea ref={typeTextRef}
                          defaultValue=""
                          placeholder="2 tomatoes, 1L milk, 500g paneer, bunch coriander"
                          rows={4}
                          style={{ width:'100%', padding:'14px', borderRadius:14, border:'1.5px solid var(--bd)', fontSize:15, fontFamily:'inherit', background:'#FFFDF9', color:'var(--ink)', outline:'none', resize:'vertical', marginBottom:8 }}
                        />
                        <p style={{ fontSize:12, color:'var(--mu)', marginBottom:12, lineHeight:1.5 }}>
                          Type naturally and we&apos;ll still parse it for you.
                        </p>
                        <button onClick={handleParse}
                          style={{ width:'100%', padding:'14px', borderRadius:14, background:'#C0392B', color:'#fff', border:'none', fontWeight:700, fontSize:16, cursor:'pointer', fontFamily:'inherit' }}>
                          Parse typed items
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Scan ── */}
            {addMode === 'scan' && (
              <div>
                {!scanFile ? (
                  <>
                    <p style={{ color:'var(--mu)', fontSize:13, lineHeight:1.6, marginBottom:20 }}>
                      Snap a receipt, a grocery-app screenshot, or open your fridge and shoot the shelf. AI identifies every item.
                    </p>
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
                      onChange={e => { if (e.target.files?.[0]) setScanFile(e.target.files[0]); }}
                    />
                    <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
                      onChange={e => { if (e.target.files?.[0]) setScanFile(e.target.files[0]); }}
                    />
                    <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                      <button onClick={() => cameraRef.current?.click()}
                        style={{ display:'flex', alignItems:'center', gap:14, padding:'16px', background:'var(--white)', borderRadius:16, border:'1.5px solid var(--bd)', cursor:'pointer', fontFamily:'inherit', textAlign:'left', width:'100%' }}>
                        <div style={{ width:44, height:44, borderRadius:12, background:'#C0392B', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4" fill="none" stroke="white" strokeWidth="2"/></svg>
                        </div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:15, color:'var(--ink)' }}>Take photo now</div>
                          <div style={{ fontSize:12, color:'var(--mu)', marginTop:2 }}>Opens your camera (mobile) — point at fridge or receipt</div>
                        </div>
                      </button>
                      <button onClick={() => fileRef.current?.click()}
                        style={{ display:'flex', alignItems:'center', gap:14, padding:'16px', background:'var(--white)', borderRadius:16, border:'1.5px solid var(--bd)', cursor:'pointer', fontFamily:'inherit', textAlign:'left', width:'100%' }}>
                        <div style={{ width:44, height:44, borderRadius:12, background:'var(--wa)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#C0392B" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="#C0392B"/><polyline points="21 15 16 10 5 21" stroke="#C0392B"/></svg>
                        </div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:15, color:'var(--ink)' }}>Upload from library</div>
                          <div style={{ fontSize:12, color:'var(--mu)', marginTop:2 }}>Pick a receipt, order screenshot, or fridge photo</div>
                        </div>
                      </button>
                    </div>
                    <p style={{ color:'var(--mu)', fontSize:12, textAlign:'center', lineHeight:1.5 }}>
                      Works with receipts, Delivery app screenshots, or a photo of your fridge shelf.
                    </p>
                  </>
                ) : (
                  <div>
                    <div style={{ padding:'12px', background:'var(--wa)', borderRadius:12, marginBottom:12, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:20 }}>📸</span>
                      <span style={{ flex:1, fontWeight:600 }}>{scanFile.name}</span>
                      <button onClick={() => { setScanFile(null); setParsed([]); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--mu)', fontSize:16 }}>×</button>
                    </div>
                    {parsedEditable.length === 0
                      ? <button className="btn-bee" onClick={async () => {
                          setScanning(true);
                          try {
                            const d = await requestParsedItems({ image: scanFile });
                            if (d.items?.length) {
                              const withPrices = d.items.map((it: ParsedInputItem) => ({ ...normalizeParsedItem(it, s.country), addedBy:'scan' as const }));
                              setParsed([]); setParsedEditable(withPrices);
                            } else showT('Could not read — try a clearer photo');
                          } catch (error) { showT(error instanceof Error ? error.message : 'Scan failed'); }
                          setScanning(false);
                        }} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan this image →'}</button>
                      : <div>
                          {parsedEditable.map((it, i) => (
                            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--white)', borderRadius:10, border:'1.5px solid var(--bd)', marginBottom:6 }}>
                              <span>{it.emoji||'📦'}</span>
                              <span style={{ fontWeight:600, fontSize:14, flex:1 }}>{it.name}</span>
                              <span style={{ fontSize:12, color:'var(--mu)' }}>{it.qty} {it.unit}</span>
                            </div>
                          ))}
                          <button className="btn-bee" onClick={confirmAll} style={{ marginTop:8 }}>Add {parsedEditable.length} items →</button>
                        </div>
                    }
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  function ModalMember() {
    if (!showMember || !editMember) return null;
    const isNew = !editMember.id;
    const m = editMember;
    function setM(p: Partial<Member>) { setEditMember(prev => prev ? {...prev,...p} : null); }
    return (
      <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget){setShowMember(false);setEditMember(null);}}}>
        <div className="modal-sheet">
          <div className="modal-handle"/>
          <div className="modal-body" style={{padding:'20px 16px 36px'}}>
            <h3 style={{marginBottom:16}}>{isNew?'Add member':'Edit member'}</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:6}}>Name *</label>
                <input type="text" value={m.name} onChange={e=>setM({name:e.target.value})} placeholder="Member's name"
                  style={{width:'100%',padding:'12px',borderRadius:12,border:'1.5px solid var(--bd)',fontSize:15,fontFamily:'inherit',outline:'none',background:'var(--white)'}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:6}}>Age (optional)</label>
                <input type="number" min="0" max="120" value={m.age??''} placeholder="e.g. 8"
                  onChange={e=>{
                    const age = e.target.value===''?undefined:parseInt(e.target.value);
                    setM({age, isKid:age!==undefined&&age<13});
                  }}
                  style={{width:'100%',padding:'12px',borderRadius:12,border:'1.5px solid var(--bd)',fontSize:15,fontFamily:'inherit',outline:'none',background:'var(--white)'}}/>
                {m.age!==undefined&&m.age<13&&(
                  <div style={{marginTop:6,padding:'8px 12px',background:'var(--beel)',borderRadius:10,fontSize:12,color:'var(--beed)',fontWeight:600}}>
                    👧 Kid mode — safe food filters enabled
                  </div>
                )}
              </div>
              {m.isKid&&(
                <div>
                  <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:8}}>Kid-safe filters</label>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {KID_FILTERS.map(f=>{
                      const on = m.dietaryFilters.includes(f);
                      return (
                        <div key={f} onClick={()=>setM({dietaryFilters:on?m.dietaryFilters.filter(x=>x!==f):[...m.dietaryFilters,f]})}
                          style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',borderRadius:10,border:'1.5px solid',cursor:'pointer',
                            borderColor:on?'var(--bee)':'var(--bd)',background:on?'var(--beel)':'var(--white)'}}>
                          <span style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{f}</span>
                          <div style={{width:20,height:20,borderRadius:5,border:'2px solid',borderColor:on?'var(--bee)':'var(--bd)',background:on?'var(--bee)':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            {on&&<span style={{color:'#fff',fontSize:11}}>✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:8}}>Dietary preferences</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {DIETARY_OPTIONS.map(d=>{
                    const on = m.dietaryFilters.includes(d);
                    return (
                      <button key={d} onClick={()=>setM({dietaryFilters:on?m.dietaryFilters.filter(x=>x!==d):[...m.dietaryFilters,d]})}
                        style={{padding:'6px 12px',borderRadius:999,border:'1.5px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                          borderColor:on?'var(--sage)':'var(--bd)',background:on?'var(--sagel)':'transparent',color:on?'var(--sage)':'var(--mu)'}}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--mu)',display:'block',marginBottom:8}}>Allergies</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {ALLERGY_OPTIONS.map(a=>{
                    const on = m.allergies.includes(a);
                    return (
                      <button key={a} onClick={()=>setM({allergies:on?m.allergies.filter(x=>x!==a):[...m.allergies,a]})}
                        style={{padding:'6px 12px',borderRadius:999,border:'1.5px solid',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                          borderColor:on?'var(--red)':'var(--bd)',background:on?'var(--rl)':'transparent',color:on?'var(--red)':'var(--mu)'}}>
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button className="btn-ghost" onClick={()=>{setShowMember(false);setEditMember(null);}}>Cancel</button>
              <button className="btn-bee" disabled={!m.name.trim()} style={{opacity:m.name.trim()?1:.45}}
                onClick={()=>{
                  if(!m.name.trim())return;
                  const saved = isNew?{...m,id:uid()}:m;
                  up({members:isNew?[...s.members,saved]:s.members.map(mb=>mb.id===m.id?saved:mb)});
                  setShowMember(false); setEditMember(null);
                  showT(isNew?`Added ${m.name} ✓`:`Updated ${m.name} ✓`);
                }}>
                {isNew?'Add member':'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ModalPaywall() {
    if (!showPaywall) return null;
    return (
      <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowPaywall(false);}}>
        <div className="modal-sheet">
          <div className="modal-handle"/>
          <div className="modal-body" style={{padding:'28px 24px 40px',textAlign:'center'}}>
            <div style={{animation:'bee-bob 2s infinite',display:'inline-block',marginBottom:14}}><BeeSVG size={72}/></div>
            <h3 style={{fontSize:24,marginBottom:10}}>Upgrade to Pro 🚀</h3>
            <p style={{color:'var(--mu)',fontSize:14,lineHeight:1.6,marginBottom:28}}>
              You&apos;ve tracked 30+ items — you&apos;re a real bee keeper! Unlock unlimited tracking, AI recipes, and shared fridge.
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <button className="btn-bee" onClick={()=>{setShowPaywall(false);showT('Upgrade coming soon!');}}>
                Upgrade for $2.99/month
              </button>
              <button className="btn-ghost" onClick={()=>setShowPaywall(false)}>Maybe later</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── FAB menu ──────────────────────────────────────────────────────────────────
  function FABMenu() {
    if (!showFAB) return null;
    return (
      <>
        <div style={{position:'absolute',inset:0,zIndex:59}} onClick={()=>setShowFAB(false)}/>
        <div style={{position:'absolute',bottom:148,right:16,display:'flex',flexDirection:'column',gap:8,zIndex:60,animation:'fadeUp .2s both'}}>
          {([['manual','✍️','Type manually'],['voice','🎤','Voice input'],['scan','📷','Scan / photo']] as [AddMode,string,string][]).map(([mode,icon,label])=>(
            <button key={mode}
              onClick={()=>{setAddMode(mode);setShowFAB(false);setShowAdd(true);}}
              style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px 10px 12px',background:'var(--white)',borderRadius:14,border:'1.5px solid var(--bd)',boxShadow:'0 4px 16px rgba(0,0,0,.1)',cursor:'pointer',whiteSpace:'nowrap',fontFamily:'inherit',fontWeight:600,fontSize:14,color:'var(--ink)'}}>
              <span style={{fontSize:20}}>{icon}</span>{label}
            </button>
          ))}
        </div>
      </>
    );
  }

  // ── Nav ───────────────────────────────────────────────────────────────────────
  const NAV = [
    { id:'fridge' as Tab, label:'Fridge', icon:(a:boolean)=>(
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <rect x="4" y="2" width="16" height="20" rx="3" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2"/>
        <line x1="4" y1="10" x2="20" y2="10" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2"/>
        <line x1="9" y1="6"  x2="9"  y2="8"  stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round"/>
        <line x1="9" y1="14" x2="9"  y2="18" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )},
    { id:'meals' as Tab, label:'Meals', icon:(a:boolean)=>(
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M6 2v6c0 2.2 1.8 4 4 4s4-1.8 4-4V2" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round"/>
        <line x1="10" y1="12" x2="10" y2="22" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round"/>
        <line x1="18" y1="2"  x2="18" y2="22" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )},
    { id:'restock' as Tab, label:'Restock', icon:(a:boolean)=>(
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <circle cx="9" cy="21" r="1.5" fill={a?'var(--bee)':'#B0A898'}/>
        <circle cx="19" cy="21" r="1.5" fill={a?'var(--bee)':'#B0A898'}/>
        <path d="M1 1h3l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )},
    { id:'insights' as Tab, label:'Insights', icon:(a:boolean)=>(
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M3 20h18M7 10v10M12 6v14M17 14v6" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )},
    { id:'profile' as Tab, label:'Profile', icon:(a:boolean)=>(
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={a?'var(--bee)':'#B0A898'} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )},
  ];

  // ── Root render ───────────────────────────────────────────────────────────────
  if (!s.onboarded) return <div id="app">{OB()}</div>;

  return (
    <div id="app">
      {tab==='fridge'   && ScreenFridge()}
      {tab==='meals'    && ScreenMeals()}
      {tab==='restock'  && ScreenRestock()}
      {tab==='insights' && ScreenInsights()}
      {tab==='profile'  && ScreenProfile()}

      <nav id="bottom-nav">
        {NAV.map(n=>(
          <button key={n.id} className={`nav-btn${tab===n.id?' active':''}`}
            onClick={()=>{setTab(n.id);setShowFAB(false);}}>
            <div className="nav-icon">{n.icon(tab===n.id)}</div>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      {tab==='fridge'&&(
        <button className="fab" onClick={()=>setShowFAB(v=>!v)}
          style={{position:'absolute',bottom:80,right:16}}>
          <svg width="24" height="24" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      )}

      {FABMenu()}
      {ModalAdd()}
      {ModalItemSheet()}
      {ModalCook()}
      {ModalCookDone()}
      {ModalMember()}
      {ModalPaywall()}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
