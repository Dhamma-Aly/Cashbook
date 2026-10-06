// ===================================================================
// js/config.js - Sāsana ERP System Configuration & API Endpoint Setup  
// 100% Aligned with D1 Database Table Names & Schema Standard
// ===================================================================

const WORKER_API_URL = "https://cashbook-api.dhammaaly.workers.dev";

window.CONFIG = {
  API_URL: WORKER_API_URL,
  API_BASE_URL: WORKER_API_URL,
  APP_VERSION: "v3.0_D1_ENTERPRISE",

  TABLE_TITLES: {
    '1CB Bank (General)': 'အထွေထွေ ရန်ပုံငွေ (Bank)',
    '2CB Bank (Meal)': 'ဆွမ်းပဒေသာပင် (Bank)',
    '3CB Bank (UZ)': 'တစ်ဦးတည်းစာရင်း (Bank)',
    '1General Book': 'ကျောင်းရန်ပုံငွေ စာအုပ်',
    '2Meal Book': 'ဆွမ်းပဒေသာပင် စာအုပ်',
    '3Hall Book': 'ဓမ္မာရုံငွေစာရင်း စာအုပ်',
    '4Pagoda Book': 'စေတီငွေစာရင်း စာအုပ်',
    '5Electronic Book': 'လျှပ်စစ်ပဒေသာပင် စာအုပ်',
    '6Medical Book': 'ဆေးပဒေသာပင် စာအုပ်',
    '7Other Book': 'အထွေထွေရန်ပုံငွေစာအုပ်',
    'Inventory': 'ပစ္စည်းစာရင်း',
    'Permanent Yogi': 'အမြဲနေ ယောဂီစာရင်း',
    'Camp Yogi': 'စခန်းဝင် ယောဂီစာရင်း',
    'Home': 'Home Dashboard',
    'Report': 'အသုံးစရိတ် အစီရင်ခံစာ',

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
    '11Inv': 'ပစ္စည်းစာရင်း',
    '12Yogi': 'အမြဲနေ ယောဂီစာရင်း',
    '13Yogi': 'စခန်းဝင် ယောဂီစာရင်း',
    '14Rep': 'အသုံးစရိတ် အစီရင်ခံစာ'
  },

  RECEIVERS: ['User 1', 'User 2', 'User 3', 'Bank'],

  TRANSFER_MAPPING: {
    '1General Book': { targetBank: '1CB Bank (General)', bankTitle: 'အထွေထွေ ရန်ပုံငွေ (Bank)' },
    '2Meal Book': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    '3Hall Book': { targetBank: '1CB Bank (General)', bankTitle: 'အထွေထွေ ရန်ပုံငွေ (Bank)' },
    '4Pagoda Book': { targetBank: '1CB Bank (General)', bankTitle: 'အထွေထွေ ရန်ပုံငွေ (Bank)' },
    '5Electronic Book': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    '6Medical Book': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    '7Other Book': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    '4GB': { targetBank: '1CB Bank (General)', bankTitle: 'အထွေထွေ ရန်ပုံငွေ (Bank)' },
    '5FB': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    '6HB': { targetBank: '1CB Bank (General)', bankTitle: 'အထွေထွေ ရန်ပုံငွေ (Bank)' },
    '7PB': { targetBank: '1CB Bank (General)', bankTitle: 'အထွေထွေ ရန်ပုံငွေ (Bank)' },
    '8EB': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    '9MB': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' },
    '10GB': { targetBank: '2CB Bank (Meal)', bankTitle: 'ဆွမ်းပဒေသာပင် (Bank)' }
  },

  TABLE_GROUP_MAP: {
    '1CB Bank (General)': 'BANKS', '2CB Bank (Meal)': 'BANKS', '3CB Bank (UZ)': 'BANKS',
    '1General Book': '1General Book', '2Meal Book': 'PADETHA_BOOKS',
    '3Hall Book': 'BUILDING_BOOKS', '4Pagoda Book': 'BUILDING_BOOKS',
    '5Electronic Book': 'PADETHA_BOOKS', '6Medical Book': 'PADETHA_BOOKS', '7Other Book': 'PADETHA_BOOKS',
    '1CB': 'BANKS', '2CB': 'BANKS', '3CB': 'BANKS',
    '4GB': '1General Book', '5FB': 'PADETHA_BOOKS', '6HB': 'BUILDING_BOOKS',
    '7PB': 'BUILDING_BOOKS', '8EB': 'PADETHA_BOOKS', '9MB': 'PADETHA_BOOKS', '10GB': 'PADETHA_BOOKS'
  },

  // 🌟 အသစ်တောင်းဆိုထားသော ဝင်ငွေ/ထွက်ငွေ ခေါင်းစဉ်များ
  CATEGORY_TREE: {
    'BANKS': {
      'ဝင်ငွေ': {
        'စာရင်းဖွင့်': ['စာရင်းဖွင့်လက်ကျန်'],
        'ဘဏ်အပ်ငွေ': ['ဘဏ်အပ်နှံခြင်း'],
        'ဘဏ်တိုး': ['ဘဏ်တိုးရရှိ'],
        'အလှူရရှိ': ['တိုက်ရိုက်ဘဏ်လွှဲအလှူ', 'အထွေထွေအလှူ']
      },
      'ထွက်ငွေ': {
        'ဘဏ်ထုတ်ငွေ': ['အသုံးစရိတ်ငွေထုတ်ခြင်း']
      },
      'စာရင်းပြောင်း': {
        'စာရင်းပြောင်း': ['အခြားဘဏ်သို့ လွှဲပြောင်း']
      }
    },
    '1General Book': {
      'ဝင်ငွေ': {
        'စာရင်းဖွင့်': ['စာရင်းဖွင့်လက်ကျန်'],
        'ဆွမ်းအလှူ': ['အရုဏ်ဆွမ်း', 'နေ့ဆွမ်း', 'တနေ့တာဆွမ်း', 'အထွေထွေ'],
        'အထွေထွေ': ['လမ်းအလှူ', 'အခြားအလှူ', 'အထွေထွေ']
      },
      'ထွက်ငွေ': {
        'ဆွမ်းစရိတ်ကုန်ကျခြင်း': ['မီးဖိုချောင်အသုံးစရိတ်', 'သင်္ကန်းတရားစခန်း အသုံးစရိတ်', 'အထွေထွေ'],
        'အုပ်ချုပ်မှုအသုံးစရိတ်': ['ကျောင်းပစ္စည်းဝယ်ယူခြင်း', 'ဆ/ဥ ပြုပြင်စရိတ်', 'လမ်းပြင်ဆင်စရိတ်', 'အထွေထွေအသုံးစရိတ်'],
        'ယာဉ်အုပ်စုအသုံးစရိတ်': ['ဆီ/ပြုပြင်/ယာဉ်မောင်း/အခြား']
      },
      'စာရင်းပြောင်း': {
        'စာရင်းပြောင်း': ['User 1 ထံ လွှဲပြောင်း', 'User 2 ထံ လွှဲပြောင်း', 'User 3 ထံ လွှဲပြောင်း', 'အထွေထွေ ရန်ပုံငွေ (Bank) သို့ လွှဲပြောင်း']
      }
    },
    'PADETHA_BOOKS': {
      'ဝင်ငွေ': { 'စာရင်းဖွင့်': ['စာရင်းဖွင့်လက်ကျန်'], 'အလှူရရှိ': ['မတည်အလှူ', 'လစဉ်အလှူ'] },
      'ထွက်ငွေ': { 'ဘဏ်အပ်ငွေ': ['ဘဏ်အပ်နှံခြင်း'], 'အထွေထွေအသုံးစရိတ်': ['အသုံးစရိတ်'] },
      'စာရင်းပြောင်း': { 'စာရင်းပြောင်း': ['ဘဏ်အပ်နှံခြင်း'] }
    },
    'BUILDING_BOOKS': {
      'ဝင်ငွေ': { 'စာရင်းဖွင့်': ['စာရင်းဖွင့်လက်ကျန်'], 'အလှူရရှိ': ['အလှူရရှိငွေ'] },
      'ထွက်ငွေ': { 'ကန်ထရိုက်ထုတ်ပေးငွေ': ['ကန်ထရိုက်ထုတ်ပေးငွေ'], 'အထွေထွေအသုံးစရိတ်': ['ဆက်စပ်အသုံးစရိတ်'] },
      'စာရင်းပြောင်း': { 'စာရင်းပြောင်း': ['ဘဏ်အပ်နှံခြင်း'] }
    }
  },

  YOGI_TYPES: ['အမြဲနေ', 'စခန်းဝင်'],
  YOGI_GENDERS: ['ကျား', 'မ'],
  INV_LOCATIONS: ['မီးဖိုဆောင်', 'ဓမ္မာရုံ', 'သိမ်', 'စတို', 'အခြား'],
  INV_CATEGORIES: ['ပရိဘောဂ', 'လျှပ်စစ်', 'မီးဖိုချောင်သုံး', 'ဆေးဝါး/ကျန်းမာရေး', 'အထွေထွေ'],
  INV_UNITS: ['ခု', 'စုံ', 'လုံး', 'ထုပ်', 'ဖာ', 'ကတ်', 'စီး']
};

window.CONFIG.SHEET_TITLES = window.CONFIG.TABLE_TITLES;
window.CONFIG.SHEET_GROUP_MAP = window.CONFIG.TABLE_GROUP_MAP;
window.CONFIG.CATEGORY_TREE['4GB'] = window.CONFIG.CATEGORY_TREE['1General Book'];
window.APP_CONFIG = window.CONFIG;
