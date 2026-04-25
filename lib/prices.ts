// Curated grocery price table per country. Ported from fridgebee.app (mise).
// Used by normalizeParsedItem and estimatePrice when the LLM doesn't return a printed price.
//
// Each entry stores the BASE price for a BASE quantity (e.g. ₹75 per 1kg onion).
// Lookup scales to the requested quantity with a conservative unit conversion.
// If the item isn't in the table, returns undefined — caller decides the fallback.

export type Country = 'IN' | 'SG' | 'US' | 'GB' | 'AU' | 'MY' | 'PK' | 'AE';

interface Entry {
  aliases: string[];
  base: 'kg' | 'g' | 'L' | 'ml' | 'pcs' | 'bunch' | 'dozen' | 'loaf' | 'packet';
  // Local-currency price per base unit. Other currencies derived from SG.
  price: Record<'IN'|'SG'|'US', number>;
}

const TABLE: Entry[] = [
  // Produce
  { aliases: ['spinach','palak','keerai','bayam'],                       base:'bunch', price:{IN:30,   SG:3,    US:3     }},
  { aliases: ['coriander','dhaniya','dhania','cilantro'],                base:'bunch', price:{IN:15,   SG:1.5,  US:2     }},
  { aliases: ['mint','pudina'],                                          base:'bunch', price:{IN:15,   SG:1.5,  US:2     }},
  { aliases: ['methi','fenugreek'],                                      base:'bunch', price:{IN:25,   SG:2.5,  US:3     }},
  { aliases: ['tomato','tomatoes','tamatar','thakkali'],                 base:'kg',    price:{IN:60,   SG:5.5,  US:4     }},
  { aliases: ['onion','onions','pyaaz','vengayam','bawang'],             base:'kg',    price:{IN:45,   SG:3,    US:3     }},
  { aliases: ['potato','potatoes','aloo','urulaikilangu','kentang'],     base:'kg',    price:{IN:40,   SG:3.5,  US:2.5   }},
  { aliases: ['carrot','carrots','gajar'],                               base:'kg',    price:{IN:60,   SG:3.5,  US:2.5   }},
  { aliases: ['cucumber','kheera','timun'],                              base:'kg',    price:{IN:60,   SG:3.5,  US:4     }},
  { aliases: ['capsicum','bell pepper','shimla mirch'],                  base:'kg',    price:{IN:140,  SG:7,    US:6     }},
  { aliases: ['broccoli'],                                               base:'pcs',   price:{IN:120,  SG:3,    US:3     }},
  { aliases: ['cauliflower','phool gobi','gobi','gobhi'],                base:'pcs',   price:{IN:50,   SG:3.5,  US:4     }},
  { aliases: ['cabbage','patta gobhi','pata gobhi','muttakose'],         base:'pcs',   price:{IN:40,   SG:2.5,  US:3     }},
  { aliases: ['ginger','adrak','inji','halia'],                          base:'kg',    price:{IN:200,  SG:9,    US:8     }},
  { aliases: ['garlic','lehsun','poondu','bawang putih'],                base:'kg',    price:{IN:280,  SG:10,   US:8     }},
  { aliases: ['lemon','lemons','nimbu','lime'],                          base:'pcs',   price:{IN:6,    SG:0.6,  US:0.7   }},
  { aliases: ['banana','bananas','kela'],                                base:'dozen', price:{IN:60,   SG:3,    US:3.5   }},
  { aliases: ['apple','apples','seb'],                                   base:'kg',    price:{IN:200,  SG:6,    US:5     }},
  { aliases: ['mango','mangoes','aam','alphonso mango'],                 base:'kg',    price:{IN:150,  SG:8,    US:7     }},
  { aliases: ['orange','oranges','santra'],                              base:'kg',    price:{IN:80,   SG:5,    US:3.5   }},
  { aliases: ['pineapple','dole pineapple'],                             base:'pcs',   price:{IN:90,   SG:4,    US:4     }},
  { aliases: ['papaya','papita'],                                        base:'kg',    price:{IN:50,   SG:4,    US:3.5   }},
  { aliases: ['grapes','angoor'],                                        base:'kg',    price:{IN:120,  SG:6,    US:5     }},
  { aliases: ['strawberry','strawberries'],                              base:'packet',price:{IN:150,  SG:5,    US:4.5   }},
  { aliases: ['blackberry','blackberries','blueberry','blueberries','raspberry','berries'], base:'packet', price:{IN:200, SG:6, US:5}},
  { aliases: ['okra','bhindi','lady finger','ladyfinger'],               base:'kg',    price:{IN:60,   SG:4,    US:5     }},
  { aliases: ['eggplant','brinjal','baingan'],                           base:'kg',    price:{IN:50,   SG:3,    US:3     }},
  { aliases: ['lauki','bottle gourd','dudhi','bottle gourd-india'],      base:'kg',    price:{IN:30,   SG:5,    US:4     }},
  { aliases: ['karela','bitter gourd'],                                  base:'kg',    price:{IN:50,   SG:5,    US:5     }},
  { aliases: ['turai','ridge gourd','tinda'],                            base:'kg',    price:{IN:40,   SG:4,    US:4     }},
  { aliases: ['peas','matar','frozen peas'],                             base:'kg',    price:{IN:100,  SG:4,    US:3     }},
  { aliases: ['mushroom','mushrooms'],                                   base:'packet',price:{IN:60,   SG:2.5,  US:3     }},
  { aliases: ['beans','green beans','french beans'],                     base:'kg',    price:{IN:80,   SG:4,    US:4     }},
  { aliases: ['avocado'],                                                base:'pcs',   price:{IN:120,  SG:5.8,  US:2     }},
  { aliases: ['pumpkin','kaddu'],                                        base:'kg',    price:{IN:30,   SG:3,    US:3     }},
  { aliases: ['drumstick','moringa','sahjan'],                           base:'bunch', price:{IN:30,   SG:3,    US:4     }},
  { aliases: ['lettuce'],                                                base:'pcs',   price:{IN:60,   SG:2.5,  US:2.5   }},
  { aliases: ['corn','sweet corn'],                                      base:'pcs',   price:{IN:30,   SG:1.5,  US:1     }},

  // Dairy
  { aliases: ['milk','doodh','paal','susu','meiji fresh milk','pauls fresh milk'], base:'L', price:{IN:68, SG:3, US:1.2}},
  { aliases: ['curd','dahi','thayir','yogurt'],                          base:'kg',    price:{IN:160,  SG:6,    US:5     }},
  { aliases: ['greek yogurt'],                                           base:'kg',    price:{IN:260,  SG:10,   US:6     }},
  { aliases: ['paneer','cottage cheese','nanak paneer','nanak paneer cubed'], base:'kg', price:{IN:380, SG:20, US:15}},
  { aliases: ['cheese','cheddar','california sf cheese','sf cheese'],    base:'kg',    price:{IN:600,  SG:33,   US:12    }},
  { aliases: ['mozzarella'],                                             base:'kg',    price:{IN:600,  SG:25,   US:12    }},
  { aliases: ['feta'],                                                   base:'kg',    price:{IN:700,  SG:30,   US:15    }},
  { aliases: ['parmesan','parmesan chez','l/pool parmesan'],             base:'kg',    price:{IN:900,  SG:70,   US:30    }},
  { aliases: ['butter','makhan','amul butter','unsalted butter'],        base:'kg',    price:{IN:520,  SG:13,   US:10    }},
  { aliases: ['ghee','grb ghee','clarified butter'],                     base:'L',     price:{IN:700,  SG:14.5, US:18    }},
  { aliases: ['cream','fresh cream'],                                    base:'packet',price:{IN:80,   SG:3.5,  US:3     }},

  // Protein
  { aliases: ['egg','eggs','anda','telur','muttai'],                     base:'dozen', price:{IN:90,   SG:4,    US:4.5   }},
  { aliases: ['chicken','chicken breast','murgh','kozhi','ayam'],        base:'kg',    price:{IN:260,  SG:12,   US:14    }},
  { aliases: ['mutton','lamb','gosht'],                                  base:'kg',    price:{IN:700,  SG:22,   US:18    }},
  { aliases: ['fish','salmon','machli','meen','ikan'],                   base:'kg',    price:{IN:400,  SG:18,   US:15    }},
  { aliases: ['prawn','prawns','shrimp','jhinga'],                       base:'kg',    price:{IN:500,  SG:22,   US:18    }},
  { aliases: ['tofu','bean curd'],                                       base:'packet',price:{IN:80,   SG:2.5,  US:3     }},

  // Grains / staples
  { aliases: ['rice','basmati rice','chawal','arisi','nasi','ind/gat clas basmati','basmati'], base:'kg', price:{IN:120, SG:4.6, US:3}},
  { aliases: ['brown rice'],                                             base:'kg',    price:{IN:140,  SG:5,    US:3.5   }},
  { aliases: ['atta','wheat flour','whole wheat flour'],                 base:'kg',    price:{IN:55,   SG:2.5,  US:3     }},
  { aliases: ['maida','all purpose flour','flour'],                      base:'kg',    price:{IN:50,   SG:2.5,  US:2     }},
  { aliases: ['oats','oatmeal'],                                         base:'kg',    price:{IN:170,  SG:5,    US:3.5   }},
  { aliases: ['pasta','spaghetti','penne'],                              base:'packet',price:{IN:140,  SG:3,    US:2     }},
  { aliases: ['bread','white bread','roti loaf','roti'],                 base:'loaf',  price:{IN:50,   SG:3,    US:4     }},
  { aliases: ['noodles','maggi','instant noodles'],                      base:'packet',price:{IN:14,   SG:1,    US:1     }},
  { aliases: ['dal','lentils','paruppu','toor dal','toor','tuvar'],      base:'kg',    price:{IN:140,  SG:5,    US:4     }},
  { aliases: ['moong dal','moong','mung','urad','urad dal','masoor','masoor dal'], base:'kg', price:{IN:120, SG:5, US:4}},
  { aliases: ['chana','chickpeas','garbanzo','chole'],                   base:'kg',    price:{IN:110,  SG:4,    US:3     }},
  { aliases: ['rajma','kidney beans'],                                   base:'kg',    price:{IN:180,  SG:6,    US:4     }},
  { aliases: ['besan','gram flour','chickpea flour'],                    base:'kg',    price:{IN:120,  SG:5,    US:4     }},
  { aliases: ['sooji','rava','semolina'],                                base:'kg',    price:{IN:60,   SG:3,    US:3     }},
  { aliases: ['poha','flattened rice'],                                  base:'kg',    price:{IN:70,   SG:3.5,  US:3.5   }},
  { aliases: ['sugar','cheeni'],                                         base:'kg',    price:{IN:48,   SG:2,    US:1.5   }},
  { aliases: ['salt','namak'],                                           base:'kg',    price:{IN:22,   SG:1,    US:1     }},
  { aliases: ['black sesame seed','sesame seed','til','dsf black sesame seed'], base:'packet', price:{IN:60, SG:1.5, US:2.5}},
  { aliases: ['jaggery','gur'],                                          base:'kg',    price:{IN:90,   SG:5,    US:6     }},

  // Beverages / other
  { aliases: ['tea','chai'],                                             base:'packet',price:{IN:180,  SG:5,    US:4     }},
  { aliases: ['coffee','kopi'],                                          base:'packet',price:{IN:320,  SG:10,   US:8     }},
  { aliases: ['oil','cooking oil','sunflower oil','tel'],                base:'L',     price:{IN:160,  SG:7,    US:5     }},
  { aliases: ['olive oil'],                                              base:'L',     price:{IN:600,  SG:15,   US:10    }},
  { aliases: ['honey','shahad','madhu'],                                 base:'kg',    price:{IN:500,  SG:15,   US:10    }},
  { aliases: ['juice','natural one juice','asst juice','assorted juice'], base:'packet', price:{IN:150, SG:4.85, US:4}},
  { aliases: ['lassi'],                                                  base:'packet',price:{IN:30,   SG:1.8,  US:2     }},
  { aliases: ['hummus'],                                                 base:'packet',price:{IN:200,  SG:4,    US:3     }},
];

const aliasMap: Map<string, Entry> = (() => {
  const m = new Map<string, Entry>();
  for (const e of TABLE) for (const a of e.aliases) m.set(a.toLowerCase(), e);
  return m;
})();

function findEntry(name: string): Entry | undefined {
  const lc = name.toLowerCase().trim();
  if (aliasMap.has(lc)) return aliasMap.get(lc);
  // Substring match: "alphonso mango" -> mango, "fresh spinach" -> spinach
  for (const [alias, e] of aliasMap) {
    if (lc.includes(alias) || alias.includes(lc)) return e;
  }
  return undefined;
}

function scaleToBase(quantity: number, unit: string, base: Entry['base']): number | undefined {
  const u = unit.toLowerCase().trim();
  if (base === 'kg' || base === 'g') {
    if (u === 'kg') return base==='kg' ? quantity : quantity*1000;
    if (u === 'g')  return base==='kg' ? quantity/1000 : quantity;
  }
  if (base === 'L' || base === 'ml') {
    if (u === 'l' || u === 'L')   return base==='L' ? quantity : quantity*1000;
    if (u === 'ml')                return base==='L' ? quantity/1000 : quantity;
  }
  if (base === 'pcs') {
    if (u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces') return quantity;
    if (u === 'dozen')                                                 return quantity*12;
  }
  if (base === 'dozen') {
    if (u === 'dozen')                return quantity;
    if (u === 'pcs' || u === 'piece') return quantity/12;
  }
  if (base === 'bunch' && (u === 'bunch' || u === 'pcs'))     return quantity;
  if (base === 'loaf'  && (u === 'loaf'  || u === 'pcs'))     return quantity;
  if (base === 'packet'&& (u === 'packet'|| u === 'pcs' || u === 'pkt')) return quantity;
  return undefined;
}

const COUNTRY_FX: Record<Country, { from: 'IN'|'SG'|'US'; mult: number }> = {
  IN: { from: 'IN', mult: 1 },
  SG: { from: 'SG', mult: 1 },
  US: { from: 'US', mult: 1 },
  // Approximate cross-rates from the SG baseline.
  GB: { from: 'US', mult: 0.79 },
  AU: { from: 'US', mult: 1.53 },
  MY: { from: 'SG', mult: 3.5 },
  PK: { from: 'IN', mult: 3.4 },
  AE: { from: 'US', mult: 3.67 },
};

export interface PriceQuery {
  name: string;
  quantity?: number;
  unit?: string;
  country: Country | string;
}

export function priceForItem({ name, quantity = 1, unit = 'pcs', country }: PriceQuery): number | undefined {
  const entry = findEntry(name);
  if (!entry) return undefined;
  const scale = scaleToBase(quantity, unit, entry.base);
  if (scale === undefined) return undefined;
  const cc = (COUNTRY_FX[country as Country] ? country : 'US') as Country;
  const base = COUNTRY_FX[cc];
  const baseCcy = base.from;
  const raw = entry.price[baseCcy] * scale * base.mult;
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  if (cc === 'IN') return Math.round(raw);
  return Math.round(raw * 100) / 100;
}
