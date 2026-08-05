// js/config.js - System Configuration & Constants
//
// ⚠️ ACTION REQUIRED BEFORE THIS APP WILL SAVE/LOAD ANY REAL DATA ⚠️
// The backend is worker.js, deployed as a Cloudflare Worker (no Google
// Apps Script / script.google.com involved anywhere). See DEPLOY.md for
// the full walkthrough. Short version:
//   1. `wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY
//      / SPREADSHEET_ID`, then `wrangler deploy`.
//   2. Copy the printed workers.dev URL below, replacing the placeholder.
window.APP_CONFIG = {
  API_BASE_URL: "PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE",

  BOOKS: {
    "Home": "Home Dashboard",
    "1CB": "1CB - အထွေထွေ ရန်ပုံငွေ (Bank)",
    "2CB": "2CB - ဆွမ်းပဒေသာပင် (Bank)",
    "3CB": "3CB - တစ်ဦးတည်းစာရင်း (Bank)",
    "4GB": "4GB - ကျောင်းရန်ပုံငွေ စာအုပ်",
    "5FB": "5FB - ဆွမ်းပဒေသာပင် စာအုပ်",
    "6HB": "6HB - ဓမ္မာရုံငွေစာရင်း စာအုပ်",
    "7PB": "7PB - စေတီငွေစာရင်း စာအုပ်",
    "8EB": "8EB - လျှပ်စစ်ပဒေသာပင် စာအုပ်",
    "9MB": "9MB - ဆေးပဒေသာပင် စာအုပ်",
    "10GB": "10GB - အထွေထွေရန်ပုံငွေစာအုပ်",
    "11Inv": "11Inv - ပစ္စည်းစာရင်း",
    "12Rep": "Reporting Center",
    "Report": "Reporting Center",
    "System": "System Settings"
  },

  SUBCATEGORIES: {
    "ဝင်ငွေ": [
      "လှူဒါန်းငွေ",
      "ဆွမ်းပဒေသာပင် လှူဒါန်းငွေ",
      "ကျောင်းရန်ပုံငွေ လှူဒါန်းငွေ",
      "ဓမ္မာရုံလှူဒါန်းငွေ",
      "စေတီလှူဒါန်းငွေ",
      "လျှပ်စစ်ပဒေသာပင် လှူဒါန်းငွေ",
      "ဆေးပဒေသာပင် လှူဒါန်းငွေ",
      "အထွေထွေ လှူဒါန်းငွေ",
      "ဘဏ်တိုးရရှိငွေ",
      "စာရင်းပြောင်းဝင်ငွေ"
    ],
    "ထွက်ငွေ": [
      "ဘဏ်ထည့်ငွေ", // Auto-Transfer to 2CB
      "ဆွမ်းစရိတ်",
      "ဆွမ်းကိန်း/ဆွမ်းခဲဖွယ်",
      "မီးဖိုဆောင်စရိတ်",
      "လျှပ်စစ်မီးခ/ဒီဇယ်ဆီ",
      "ဆေးဝါးစရိတ်",
      "အဆောက်အဦးပြုပြင်စရိတ်",
      "သန့်ရှင်းရေးစရိတ်",
      "လမ်းပြုပြင်စရိတ်",
      "ဝန်ထမ်းစရိတ်/လုပ်အားခ",
      "စာရေးကိရိယာ/ရုံးသုံး",
      "စာရင်းပြောင်းထွက်ငွေ",
      "အထွေထွေအသုံးစရိတ်"
    ]
  },

  INVENTORY_LOCATIONS: ["မီးဖိုဆောင်", "ဓမ္မာရုံ", "သိမ်", "စတို", "အထွေထွေ"],
  INVENTORY_CATEGORIES: ["ပရိဘောဂ", "လျှပ်စစ်ပစ္စည်း", "မီးဖိုချောင်သုံး", "သံဃာ့ပရိက္ခရာ", "စက်ပစ္စည်း", "အထွေထွေ"],
  INVENTORY_UNITS: ["ခု", "ထုပ်", "မူ", "စုံ", "ကဒ်", "ချောင်း", "လုံး", "အုပ်", "သေတ္တာ"]
};
