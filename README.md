# 🏛️ ဓမ္မအလင်းရောင်တောရရိပ်သာ - Sāsana ERP

ဓမ္မအလင်းရောင်တောရရိပ်သာ (ပြင်ဦးလွင်မြို့) ၏ ဘဏ်စာရင်းများ၊ ပင်မငွေစာရင်းများ၊ ရိပ်သာသုံးပစ္စည်းများနှင့် ယောဂီများဆိုင်ရာ အချက်အလက်များကို ခေတ်မီစနစ်တကျ စီမံခန့်ခွဲသည့် **Cloud Serverless ERP & Cashbook System** ဖြစ်ပါသည်။

---

### 🌐 Live Cashbook Application
👉 **တိုက်ရိုက် အသုံးပြုရန် လင့်ခ် -** https://dhamma-aly.github.io/Cashbook/cashbook-frontend/
*(Cloudflare API: `https://cashbook-api.dhammaaly.workers.dev`)*

---

### 🌟 အဓိက ပါဝင်သော ကဏ္ဍများ (Modules)

1. **📊 Executive Home Dashboard**
   * ရန်ပုံငွေ အကျဉ်းချုပ် (**Bank + Cash ပေါင်းချုပ် ၈ တန်း**) — Bank / Cash / User 1, 2, 3 ဂဏန်းနှိပ်ရုံဖြင့် သက်ဆိုင်ရာ စာအုပ်နှင့် User Filter သို့ တိုက်ရိုက်ဝင်ရောက်နိုင်ခြင်း
   * ပဒေသာပင် စာအုပ်စာရင်း (၄ အုပ်)၊ ယောဂီ ပေါင်းချုပ်စာရင်း၊ ရိပ်သာ ဆက်သွယ်ရန် & Google Maps

2. **🏦 Bank Group (ဘဏ်စာရင်း ၃ ခု)**
   * အထွေထွေ ရန်ပုံငွေ (1CB)
   * ဆွမ်းပဒေသာပင် (2CB)
   * တစ်ဦးတည်းစာရင်း (3CB)

3. **📖 Ledger Group (ပင်မစာအုပ် ၇ ခု + User 1/2/3 Filter)**
   * ကျောင်းရန်ပုံငွေ စာအုပ် (1General Book)
   * ဆွမ်းပဒေသာပင် စာအုပ် (2Meal Book)
   * ဓမ္မာရုံငွေစာရင်း စာအုပ် (3Hall Book)
   * စေတီငွေစာရင်း စာအုပ် (4Pagoda Book)
   * လျှပ်စစ်ပဒေသာပင် စာအုပ် (5Electronic Book)
   * ဆေးပဒေသာပင် စာအုပ် (6Medical Book)
   * အထွေထွေရန်ပုံငွေစာအုပ် (7Other Book)
   * *User 1 / 2 / 3 Dropdown Filter ဖြင့် User တစ်ဦးချင်းစီ၏ KPI၊ လက်ကျန် (Running Balance) နှင့် CSV Export သီးသန့်စစ်ဆေးနိုင်ခြင်း*

4. **📦 Inventory Management (ပစ္စည်းစာရင်း)**
   * မီးဖိုဆောင်၊ ဓမ္မာရုံ၊ သိမ်၊ စတို စသည့် နေရာအလိုက် ပစ္စည်းများ စီမံခန့်ခွဲမှု

5. **🧘 Yogi Management (ယောဂီစာရင်း)**
   * အမြဲနေ ယောဂီ နှင့် စခန်းဝင် ယောဂီ စာရင်းများ
   * အဝင်/အထွက် (Active/Inactive) နှင့် NRC စနစ်တကျ မှတ်တမ်းတင်ခြင်း *(Viewer Role အတွက် PII Masking ပါဝင်)*

6. **📈 Financial & Annual Reports (အစီရင်ခံစာများ)**
   * လအလိုက် / နှစ်အလိုက် ဝင်ငွေ-ထွက်ငွေ မက်ထရစ် ဇယားများ

7. **⚙️ System Control Center (`စနစ်စီမံမှု` Tab)**
   * **Cloudflare D1 Live Metrics:** တစ်နေ့တာ Read/Write (%)၊ ရက် ၃၀ စုစုပေါင်း နှင့် DB Storage (500 MB) စောင့်ကြည့်မှု
   * **FY (Jan–Dec) Multi-Sheet Excel (`.xlsx`):** စာအုပ် ၁၃ အုပ် + Summary (စုစုပေါင်း Sheet ၁၄ ခု) တစ်ဖိုင်တည်း ထုတ်ယူနိုင်ခြင်း
   * **Automated Daily Mail & SQL `.zip` Backup (Resend API + Cloudflare Cron):**
     * နေ့စဉ် ည ၁၂:၀၅ နာရီ (MMT) တွင် စာရင်းအသစ်ရှိမှသာ Multi-Sheet Excel တွဲ၍ `dhammaaly@gmail.com` သို့ Auto Mail ပေးပို့ခြင်း
     * အပတ်စဉ် (တနင်္ဂနွေ) + ၃ လတစ်ကြိမ် Archive တွင် ဒေတာအသစ်ရှိမှသာ D1 SQL (`.zip`) Backup အလိုအလျောက် ပေးပို့သိမ်းဆည်းခြင်း
   * **Quick Links & Maintenance:** Cloudflare Metrics၊ GitHub Repo၊ Source Code ZIP & ဖိုင်တစ်ခုချင်း Download၊ One-Click Force Hard Refresh (Cache Clear)

---

### ⚡ စနစ်၏ ထူးခြားချက်များ (Key Features)

* **Universal Cross-Transfer:** ဘဏ်စာရင်းများနှင့် User 1, 2, 3 အကြား Atomic စာရင်းပြောင်း (Transfer) လွတ်လပ်စွာ ဆောင်ရွက်နိုင်ခြင်း။
* **Bank Withdrawal Dual-Entry:** ဘဏ်မှ အသုံးစရိတ်ငွေထုတ်ယူပါက ကျောင်းရန်ပုံငွေစာအုပ် (1General Book) သို့ ဝင်ငွေအဖြစ် အလိုအလျောက် စာရင်း ၂ ခု တပြိုင်တည်း ချိတ်ဆက်သွင်းယူခြင်း။
* **Full PWA & Offline-First:** Windows / Mac / Android / iOS အတွက် App Icon ထည့်သွင်းအသုံးပြုနိုင်ပြီး IndexedDB + Auto Background Sync ဖြင့် အော့ဖ်လိုင်းအသုံးပြုနိုင်ခြင်း။
* **Hardened Security:** PBKDF2 (100,000 iterations) + Revocable HMAC Token + Brute-Force Lockout + Audit Logs။

---

### 🛠️ နည်းပညာအခြေခံ (Tech Stack)

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, Tailwind CSS, SheetJS (`.xlsx`), PWA Service Worker
* **Backend:** Cloudflare Workers (Modular 3-File ES Modules: `worker.js`, `core.js`, `system.js`) + Cron Triggers
* **Database:** Cloudflare D1 (Distributed SQLite Engine) + Pre-aggregated Summary Cache
* **Email & Backup:** Resend API + Native Worker PKZIP & OOXML `.xlsx` Engine
* **Monitoring:** Cloudflare GraphQL Analytics API

---

### 👥 စီမံခန့်ခွဲခွင့် အဆင့်များ (User Roles)

* **Admin (စီမံအုပ်ချုပ်သူ)** — အားလုံး ပြင်ဆင်/ဖျက်ပစ်/SQL & JSON Backup/Summary Rebuild စီမံခွင့် အပြည့်အစုံ
* **Finance (ဘဏ္ဍာရေး) / Account (စာရင်းကိုင်)** — စာရင်း သွင်းယူ/ပြင်ဆင်/ဖျက်သိမ်းခွင့် နှင့် Mail/Backup ပေးပို့ခွင့်
* **Staff (ရုံးအကူ)** — နေ့စဉ် စာရင်းသွင်းယူ/ပြင်ဆင်ခွင့် နှင့် Mail/Backup ပေးပို့ခွင့်
* **Viewer (ကြည့်ရှုသူ)** — စာရင်းများ ကြည့်ရှုခွင့်နှင့် Excel Export သီးသန့် *(ပြင်ဆင်/ဖျက်သိမ်းခွင့်မရှိ၊ ယောဂီကိုယ်ရေးအချက်အလက် Mask လုပ်ထားသည်)*

---
© 2026 ဓမ္မအလင်းရောင်တောရရိပ်သာ | All Rights Reserved.
