// ===================================================================
// js/config.js - Sāsana ERP System Configuration & Sheet Mappings
// Defines API Base URL, Sheet Titles, Categories, Subcategories
// ===================================================================

const CONFIG = {
  // Cloudflare Worker API Base URL
  // ⚠️ ဤနေရာတွင် မိမိ၏ Cloudflare Worker Dashboard မှ URL အမှန်ကို ထည့်သွင်းပါ
  API_BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : 'https://cashbook-api.dhammaly.workers.dev',

  // Sheet Names & Page Titles Mapping
  SHEET_TITLES: {
    'Home': 'ပင်မ ဒက်ရှ်ဘုတ် (Home Dashboard)',
    '1CB': 'အထွေထွေ ရန်ပုံငွေ (Bank)',
    '2CB': 'ဆွမ်းပဒေသာပင် (Bank)',
    '3CB': 'တစ်ဦးတည်းစာရင်း (Bank)',
    '4GB': 'ကျောင်းရန်ပုံငွေ စာအုပ်',
    '5FB': 'ဆွမ်းပဒေသာပင် စာအုပ်',
    '6HB': 'ဓမ္မာရုံငွေစာရင်း စာအုပ်',
    '7PB': 'စေတီငွေစာရင်း စာအုပ်',
    '8EB': 'လျှပ်စစ်ပဒေသာပင် စာအုပ်',
    '9MB': 'ဆေးပဒေသာပင် စာအုပ်',
    '10GB': 'အထွေထွေရန်ပုံငွေစာအုပ်',
    '11Inv': 'ပစ္စည်းစာရင်း (Inventory)',
    '12Yogi': 'အမြဲနေ ယောဂီစာရင်း',
    '13Yogi': 'စခန်းဝင် ယောဂီစာရင်း',
    '14Rep': 'အသုံးစရိတ် အစီရင်ခံစာ',
    'Report': 'အသုံးစရိတ် အစီရင်ခံစာ'
  },

  // Yogi Categories & Options
  YOGI_CATEGORIES: ['လူပုဂ္ဂိုလ်', 'ရဟန်း', 'သီလရှင်'],
  YOGI_GENDERS: ['ကျား', 'မ'],
  YOGI_STATUSES: ['Active', 'Inactive'],

  // Inventory Options
  INV_LOCATIONS: ['မီးဖိုဆောင်', 'ဓမ္မာရုံ', 'သိမ်', 'စတို', 'အခြား'],
  INV_CATEGORIES: ['ပရိဘောဂ', 'လျှပ်စစ်', 'မီးဖိုချောင်သုံး', 'ဆေးဝါး/ကျန်းမာရေး', 'အထွေထွေ'],
  INV_UNITS: ['ခု', 'စုံ', 'လုံး', 'ထုပ်', 'ဖာ', 'ကတ်', 'စီး'],

  // Subcategories for Cashbook Income and Expense
  SUBCATEGORIES: {
    'ဝင်ငွေ': [
      'လှူဒါန်းငွေ',
      'အသင်းဝင်ကြေး',
      'ပဒေသာပင်လှူငွေ',
      'တရားပွဲလှူငွေ',
      'ဘဏ်အတိုး',
      'အခြားဝင်ငွေ'
    ],
    'ထွက်ငွေ': [
      'ဆွမ်းစရိတ်',
      'လျှပ်စစ်ဖိုး',
      'ဆေးဝါးစရိတ်',
      'ပြုပြင်ထိန်းသိမ်းစရိတ်',
      'ဝန်ထမ်းစရိတ်',
      'အထွေထွေစရိတ်'
    ]
  }
};

// 💡 Window Global Scope Binding (အခြား JS ဖိုင်များ အဆင်ပြေစွာ ခေါ်ယူနိုင်ရန်)
window.CONFIG = CONFIG;
window.APP_CONFIG = CONFIG;
