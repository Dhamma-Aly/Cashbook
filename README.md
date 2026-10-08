# 🏛️ ဓမ္မအလင်းရောင်တောရရိပ်သာ - Sāsana ERP

ဓမ္မအလင်းရောင်တောရရိပ်သာ (ပြင်ဦးလွင်မြို့) ၏ ဘဏ်စာရင်းများ၊ ပင်မငွေစာရင်းများ၊ ရိပ်သာသုံးပစ္စည်းများနှင့် ယောဂီများဆိုင်ရာ အချက်အလက်များကို ခေတ်မီစနစ်တကျ စီမံခန့်ခွဲသည့် **Cloud Serverless ERP & Cashbook System** ဖြစ်ပါသည်။

---

### 🌐 Live Cashbook Application
👉 **တိုက်ရိုက် အသုံးပြုရန် လင့်ခ် -** https://dhamma-aly.github.io/Cashbook/cashbook-frontend/
*(Cloudflare API: `https://cashbook-api.dhammaaly.workers.dev`)*

---

### 🌟 အဓိက ပါဝင်သော ကဏ္ဍများ (Modules)

1. **🏦 Bank Group (ဘဏ်စာရင်း ၃ ခု)**
   * အထွေထွေ ရန်ပုံငွေ (1CB)
   * ဆွမ်းပဒေသာပင် (2CB)
   * တစ်ဦးတည်းစာရင်း (3CB)

2. **📖 Ledger Group (ပင်မစာအုပ် ၇ ခု)**
   * ကျောင်းရန်ပုံငွေ စာအုပ် (1General Book)
   * ဆွမ်းပဒေသာပင် စာအုပ် (2Meal Book)
   * ဓမ္မာရုံငွေစာရင်း စာအုပ် (3Hall Book)
   * စေတီငွေစာရင်း စာအုပ် (4Pagoda Book)
   * လျှပ်စစ်ပဒေသာပင် စာအုပ် (5Electronic Book)
   * ဆေးပဒေသာပင် စာအုပ် (6Medical Book)
   * အထွေထွေရန်ပုံငွေစာအုပ် (7Other Book)

3. **📦 Inventory Management (ပစ္စည်းစာရင်း)**
   * မီးဖိုချောင်၊ ဓမ္မာရုံ၊ သိမ်၊ စတို စသည့် နေရာအလိုက် ပစ္စည်းများ စီမံခန့်ခွဲမှု

4. **🧘 Yogi Management (ယောဂီစာရင်း)**
   * အမြဲနေ ယောဂီ နှင့် စခန်းဝင် ယောဂီ စာရင်းများ
   * အဝင်/အထွက် (Active/Inactive) နှင့် NRC စနစ်တကျ မှတ်တမ်းတင်ခြင်း

5. **📊 Financial & Annual Reports (အစီရင်ခံစာများ)**
   * လအလိုက်/နှစ်အလိုက် အသုံးစရိတ် မက်ထရစ် ဇယားများ
   * ရန်ပုံငွေ လက်ကျန် အကျဉ်းချုပ် တွက်ချက်မှု

---

### ⚡ စနစ်၏ ထူးခြားချက်များ (Key Features)

* **Universal Cross-Transfer:** ဘဏ်စာရင်းများနှင့် User 1, 2, 3 အကြား စာရင်းပြောင်း (Transfer) လွတ်လပ်စွာ ဆောင်ရွက်နိုင်ခြင်း။
* **Bank Withdrawal Dual-Entry:** ဘဏ်မှ အသုံးစရိတ်ငွေထုတ်ယူပါက ကျောင်းရန်ပုံငွေစာအုပ် (1General Book) သို့ ဝင်ငွေအဖြစ် အလိုအလျောက် စာရင်း ၂ ခု တပြိုင်တည်း ချိတ်ဆက်သွင်းယူခြင်း။
* **PWA & Offline-First:** အင်တာနက်လိုင်းမရှိချိန်တွင် IndexedDB ဖြင့် အော့ဖ်လိုင်းအသုံးပြုနိုင်ပြီး လိုင်းပြန်ရချိန်တွင် Auto Background Sync ပြုလုပ်ခြင်း။
* **Persistent Login:** Facebook/Telegram ကဲ့သို့ တစ်ခါ Login ဝင်ထားရုံဖြင့် Logout ကိုယ်တိုင်မနှိပ်မချင်း အမြဲတမ်း တန်းပွင့်နေစေခြင်း။
* **Google Sheets Sync:** Google Sheets မှ ဒေတာများကို Cloudflare D1 သို့ Batch စနစ်ဖြင့် လျင်မြန်စွာ ချိတ်ဆက်သွင်းယူနိုင်သော Google Apps Script (GAS) စနစ် ပါဝင်ခြင်း။

---

### 🛠️ နည်းပညာအခြေခံ (Tech Stack)

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, Tailwind CSS
* **Backend:** Cloudflare Workers (Serverless Edge API)
* **Database:** Cloudflare D1 (Distributed SQLite Engine)
* **Authentication:** PBKDF2 Password Hashing (100,000 iterations) + HMAC Token
* **Integration:** Google Apps Script (Bulk Importer)

---

### 👥 စီမံခန့်ခွဲခွင့် အဆင့်များ (User Roles)

* **Admin (စီမံအုပ်ချုပ်သူ)** - အားလုံး ပြင်ဆင်/ဖျက်ပစ်/စီမံခွင့် အပြည့်အစုံ
* **Finance (ဘဏ္ဍာရေး) / Account (စာရင်းကိုင်)** - စာရင်း သွင်းယူ/ပြင်ဆင်ခွင့်
* **Staff (ရုံးအကူ)** - နေ့စဉ် စာရင်းသွင်းယူခွင့်
* **Viewer (ကြည့်ရှုသူ)** - စာရင်းများအား ကြည့်ရှုခွင့် သီးသန့် (ပြင်ဆင်ခွင့်မရှိ)

---
© 2026 ဓမ္မအလင်းရောင်တောရရိပ်သာ | All Rights Reserved.
