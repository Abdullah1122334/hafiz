<div dir="rtl">

# حافظ · Hafiz

🌐 **افتح التطبيق:** https://abdullah1122334.github.io/hafiz/

**ذاكرتك الذكية الآمنة.** تطبيق واحد تحفظ فيه ملاحظاتك وروابطك وكلمات السر والصور. شغال على **ويندوز 11** و**أندرويد**، وكل حاجة بتحفظها على جهاز بتظهر على التاني في ثانية، ومتشفرة بالكامل قبل ما تخرج من جهازك.

<p align="center"><img src="assets/icons/icon-512.png" width="120" alt="Hafiz"></p>

## المميزات

| | |
|---|---|
| ⚡ **حفظ ذكي** | الصق أي حاجة في مربع واحد، والتطبيق يعرف لوحده هي **رابط** ولا **كلمة سر** ولا **ملاحظة**. بيسمّيها (مثلاً `YouTube · …` أو `Gmail`) وبيحط لها وسم تلقائي (فيديو، برمجة، تسوق…). |
| 🔄 **مزامنة فورية** | اللي تحفظه على الموبايل يظهر على الكمبيوتر في أقل من ثانية، والعكس. |
| 📴 **يشتغل من غير نت** | احفظ وأنت أوفلاين، وأول ما النت يرجع كل حاجة تتزامن لوحدها. |
| 🔐 **تشفير كامل (End-to-End)** | AES-256-GCM على جهازك. السيرفر بيشوف بيانات مشفرة بس، ومحدش يقدر يقراها غيرك. |
| 🔑 **مدير كلمات سر** | مولّد كلمات سر قوية، إظهار ونسخ بضغطة (والحافظة بتتمسح تلقائياً بعد 30 ثانية)، سجل لكلمات السر القديمة، و**أكواد التحقق بخطوتين (2FA)**. |
| 🛡️ **فحص الأمان** | تقرير بكلمات السر الضعيفة والمكررة والقديمة، مع درجة من 100. |
| 📝 **ملاحظات غنية** | قوائم مهام بتتعلم عليها بضغطة (`- [ ]`)، **خط عريض**، روابط، وصور. |
| 🔎 **بحث ذكي** | بيتجاهل الهمزات والتشكيل والتاء المربوطة والأخطاء البسيطة، وبيدعم `#وسم` و`type:link`. |
| 📲 **المشاركة من أي تطبيق** | على أندرويد: شارك رابط أو صورة من يوتيوب أو كروم أو المعرض واختار **حافظ**. |
| 🎨 **شكل احترافي** | عربي (من اليمين للشمال) وإنجليزي، وضع ليلي ونهاري، ألوان للبطاقات، تثبيت ومفضلة. |
| 💾 **نسخ احتياطي واستيراد** | نسخة احتياطية مشفرة في ملف واحد، واستيراد كلمات السر من Chrome و Edge و Google و Firefox و Bitwarden. |

---

## التشغيل (مرة واحدة بس، حوالي 15 دقيقة)

التطبيق عبارة عن **تطبيق ويب يتثبّت (PWA)**: بترفعه على رابط واحد، وبعدها تثبّته على الكمبيوتر والموبايل كأنه برنامج عادي. المزامنة بتستخدم **Firebase** من Google، وهي مجانية وتكفي استخدامك الشخصي بزيادة.

### الخطوة 1: اعمل مشروع Firebase (للمزامنة)

1. افتح [console.firebase.google.com](https://console.firebase.google.com) وادخل بحساب Google.
2. اضغط **Create a project** (أو Add project)، اكتب اسم زي `hafiz`، وتقدر تقفل Google Analytics، وبعدين **Create project**.
3. **فعّل تسجيل الدخول:** من القائمة اختار **Build ← Authentication ← Get started**، وبعدين تبويب **Sign-in method**، اختار **Email/Password**، فعّل أول مفتاح، واضغط **Save**.
4. **اعمل قاعدة البيانات:** **Build ← Firestore Database ← Create database**، اختار أقرب مكان ليك (مثلاً `europe-west`)، اختار **Production mode**، وبعدين **Create**.
5. **حط قواعد الحماية:** في صفحة Firestore افتح تبويب **Rules**، امسح اللي فيه، والصق محتوى ملف [`firestore.rules`](firestore.rules)، واضغط **Publish**.
6. **خد الإعدادات:** اضغط ⚙️ ← **Project settings**، وتحت **Your apps** اضغط أيقونة الويب **`</>`**، اكتب أي اسم، واضغط **Register app**. هيظهر لك كود فيه `firebaseConfig` زي ده:

   <div dir="ltr">

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "hafiz-xxxx.firebaseapp.com",
     projectId: "hafiz-xxxx",
     storageBucket: "hafiz-xxxx.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```

   </div>

### الخطوة 2: حط الإعدادات في التطبيق

افتح ملف [`firebase-config.js`](firebase-config.js) هنا على GitHub، واضغط ✏️ (Edit)، واملا القيم الست من الخطوة اللي فاتت، وبعدين **Commit changes**.

> القيم دي **مش سرية**. هي مجرد عنوان مشروعك، وحماية بياناتك جاية من التشفير ومن قواعد `firestore.rules`.
>
> لو مش عايز تعدّل الملف، تقدر تلصق `firebaseConfig` من جوه التطبيق (**الإعدادات ← تفعيل المزامنة**)، بس ساعتها لازم تلصقه على كل جهاز لوحده.

### الخطوة 3: ارفع التطبيق على رابط (مجاناً)

المستودع **خاص (Private)**، فأسهل طريقة هي **Netlify** (مجاني، ومن غير ما تسطّب أي حاجة):

1. افتح [app.netlify.com](https://app.netlify.com) وسجّل دخول بحساب **GitHub**.
2. اختار **Add new site ← Import an existing project ← GitHub**، واسمح لـ Netlify يوصل للمستودع `-`.
3. **Branch to deploy:** اختار `main` بعد ما تدمج الفرع، أو الفرع `claude/smart-notes-sync-app-61legf` مباشرة.
4. سيب **Build command** فاضي، وخلي **Publish directory** = `.`، واضغط **Deploy**.
5. هتاخد رابط زي `https://xxxx.netlify.app`، وتقدر تغيّر اسمه من **Site configuration ← Change site name** (مثلاً `hafiz-abdullah`).

أي تعديل ترفعه على GitHub بعد كده بيتنشر تلقائياً.

<details>
<summary><b>بدائل للرفع</b></summary>

- **Firebase Hosting** (نفس مشروع Firebase). محتاج [Node.js](https://nodejs.org) على الكمبيوتر، وبعدين من جوه فولدر المشروع:

  <div dir="ltr">

  ```bash
  npx firebase-tools login
  npx firebase-tools deploy --project YOUR_PROJECT_ID
  ```

  </div>

  الأمر ده بيرفع التطبيق وقواعد `firestore.rules` مع بعض، وبيديك رابط `https://YOUR_PROJECT_ID.web.app`.
- **GitHub Pages:** بيشتغل لو خليت المستودع Public (الكود مفيهوش أي أسرار). من **Settings ← Pages** اختار الفرع والفولدر `/ (root)`.
- **Cloudflare Pages** أو **Vercel**: نفس فكرة Netlify بالظبط، من غير أمر بناء (build command).

</details>

### الخطوة 4: ثبّته على ويندوز 11

1. افتح الرابط في **Microsoft Edge** (أو Chrome).
2. اضغط أيقونة **التثبيت** في شريط العنوان (مربع صغير عليه +)، أو من القائمة **⋯ ← Apps ← Install this site as an app**.
3. اضغط **Install**. هيظهر **حافظ** في قائمة ابدأ، وتقدر تثبّته على شريط المهام (Pin to taskbar)، ويفتح في نافذة لوحده زي أي برنامج.

### الخطوة 5: ثبّته على أندرويد

1. افتح الرابط في **Google Chrome**.
2. من القائمة **⋮** اختار **Install app** (أو **Add to Home screen**) وبعدين **Install**.
3. هيظهر **حافظ** مع باقي التطبيقات، **وهيظهر كمان في قائمة المشاركة**: من يوتيوب أو كروم أو المعرض اضغط **مشاركة ← حافظ** والرابط أو الصورة هيتحفظوا على طول.

### الخطوة 6: أول تشغيل

- على **الكمبيوتر**: اختار **حساب جديد**، واكتب إيميلك و**كلمة سر رئيسية** قوية.
- على **الموبايل**: اختار **دخول** بنفس الإيميل ونفس كلمة السر، وكل حاجتك هتظهر.
- لو عايز التطبيق يفتح من غير ما يسألك على كلمة السر، علّم على **«افتكر الجهاز ده»** (على أجهزتك الشخصية بس).

> ⚠️ **مهم جداً:** كلمة السر الرئيسية هي مفتاح التشفير، ومش محفوظة في أي مكان. **لو نسيتها محدش يقدر يرجّع بياناتك.** اكتبها في مكان آمن، واعمل نسخة احتياطية من الإعدادات كل فترة.

---

## إزاي تستخدمه

### الحفظ الذكي

اكتب أو الصق في المربع اللي فوق واضغط Enter (أو زرار ↑):

| لو كتبت… | هيتحفظ كـ |
|---|---|
| `https://youtube.com/watch?v=…` | 🔗 رابط، باسم الفيديو ووسم #فيديو |
| `github.com/user/repo` | 🔗 رابط `GitHub · Repo` ووسم #برمجة |
| `ahmed@gmail.com Xk9#mP2$vL` | 🔑 كلمة سر باسم `Gmail`، والإيميل اسم مستخدم |
| `Xk9#mP2$vL` | 🔑 كلمة سر (هيسألك على اسمها) |
| `otpauth://totp/…` | 🔑 حساب بكود تحقق بخطوتين |
| سطر عنوان + نص تحته | 📝 ملاحظة بعنوان |
| أي كلام تاني | 📝 ملاحظة |

- الأيقونة اللي على يمين المربع بتوريك النوع اللي اتعرف عليه. **اضغط عليها لو عايز تغيّر النوع.**
- تقدر **تلصق صورة** (Ctrl+V) أو **تسحبها وترميها** في أي حتة في الشاشة.
- اكتب `#وسم` جوه أي نص وهيتضاف كوسم تلقائي.

### الملاحظات

- `- [ ] مهمة` بتعمل قائمة مهام، وتقدر تعلّم عليها من البطاقة نفسها من غير ما تفتحها.
- `**عريض**` و`*مائل*` و`# عنوان` والروابط كلها بتتعرض منسقة (اضغط **معاينة**).

### كلمات السر

- 🪄 **مولّد كلمات السر:** بتختار الطول ونوع الحروف.
- **كود التحقق بخطوتين (2FA):** لما تفعّل الـ 2FA في أي موقع، اختار *«مش قادر تمسح الكود؟ / Can't scan»* وانسخ **المفتاح السري**، والصقه في خانة 2FA. التطبيق هيطلعلك الكود المتغير كل 30 ثانية (زي Google Authenticator).
- **استيراد من Chrome:** افتح `chrome://password-manager/settings` واختار **Export passwords**، وبعدين في حافظ **الإعدادات ← استيراد**، واختار الملف. **امسح ملف الـ CSV بعدها** لأنه مش مشفر.

### البحث

- البحث بيلاقي الكلمة حتى لو كتبتها بهمزة مختلفة أو من غير تشكيل (`احمد` = `أحمد`) أو بغلطة صغيرة.
- `#شغل` بيعرض العناصر اللي عليها الوسم ده، و`type:link` أو `type:password` بيحدد النوع.

### اختصارات الكيبورد (على الكمبيوتر)

| الاختصار | الوظيفة |
|---|---|
| `Ctrl + K` أو `/` | بحث |
| `N` / `L` / `P` | ملاحظة / رابط / كلمة سر جديدة |
| `C` | مربع الحفظ الذكي |
| `Ctrl + S` | حفظ وإغلاق |
| `Esc` | إغلاق |

---

## الأمان: إزاي بياناتك محمية؟

1. كلمة السر الرئيسية **عمرها ما بتخرج من جهازك**. التطبيق بيطلع منها مفتاح عن طريق **PBKDF2-SHA256 بـ 600,000 دورة**، وبعدين **HKDF** بيقسمه لمفتاحين:
   - **مفتاح تشفير**: بيقفل «مفتاح الخزنة» (مفتاح AES-256 عشوائي).
   - **مفتاح دخول**: بيتبعت لـ Firebase ككلمة سر للحساب. من المفتاح ده **مينفعش** نوصل لمفتاح التشفير.
2. كل عنصر بيتشفر بـ **AES-256-GCM** (ومربوط بالـ ID بتاعه) قبل ما يتحفظ أو يترفع. Firebase بيشوف حاجات زي `iv` و`ct` بس.
3. قواعد `firestore.rules` بتمنع أي حد يقرا أو يكتب في بيانات مستخدم تاني.
4. **القفل التلقائي** بعد مدة من غير استخدام، و**مسح الحافظة** بعد نسخ كلمة سر.
5. لو غيّرت كلمة السر الرئيسية من جهاز، الأجهزة التانية (حتى المتذكرة) بتتقفل وتطلب الكلمة الجديدة.

> خيار **«افتكر الجهاز ده»** بيحفظ مفتاح الخزنة في المتصفح بشكل مينفعش يتنسخ برّه، بس أي حد يفتح جهازك هيقدر يفتح التطبيق. فعّله على أجهزتك الشخصية بس.

---

## حل المشاكل

| المشكلة | الحل |
|---|---|
| «لازم تفعّل Email/Password…» | **Authentication ← Sign-in method ← Email/Password ← Enable**. |
| «السيرفر رفض الحفظ» | انت لسه منشرتش قواعد `firestore.rules` (الخطوة 1، رقم 5). |
| التطبيق لسه بيقول «على الجهاز ده بس» | اتأكد إنك ملّيت `firebase-config.js` والتعديل اترفع، وبعدين اقفل التطبيق وافتحه مرتين. |
| مش لاقي زرار التثبيت | لازم الرابط يكون `https://`. على أندرويد استخدم Chrome، وعلى ويندوز استخدم Edge أو Chrome. |
| نسيت كلمة السر الرئيسية | للأسف مفيش استرجاع (ده تمن التشفير الكامل). لو عندك نسخة احتياطية، اعمل حساب جديد واستورد منها. |
| عايز أنقل اللي حفظته قبل ما أفعّل المزامنة | بعد ما تدخل، افتح الإعدادات وهتلاقي زرار **«نقلهم دلوقتي»**. |
| «The database (default) does not exist» | قاعدة البيانات اتعملت باسم تاني (بيبان في رابط الـ Console بعد `/databases/`). ضيف `databaseId: 'الاسم'` في `firebase-config.js`. |

**حدود Firebase المجانية:** مساحة 1 جيجا، و50 ألف قراءة و20 ألف كتابة في اليوم. ده أكتر بكتير من استخدام شخص واحد.

---

<details>
<summary><b>للمطورين</b></summary>

<div dir="ltr">

**Stack:** vanilla JS (ES modules, no build step), Web Crypto, IndexedDB, Service Worker, Firebase Auth + Firestore (bundled locally in `vendor/firebase.js`).

```
index.html, manifest.webmanifest, sw.js   PWA shell, offline cache, Android share target
firebase-config.js                        user's Firebase web config (public identifiers)
firestore.rules, firebase.json            security rules + optional Firebase Hosting config
assets/js/crypto.js                       PBKDF2 → HKDF key split, AES-GCM item/key wrapping, backups
assets/js/vault.js                        unlocked vault: decrypt/encrypt records, sync status, password change
assets/js/backends/{local,cloud}.js       IndexedDB-only vs Firestore (offline persistence + realtime)
assets/js/smart.js                        type detection, auto titles/tags, Arabic-aware fuzzy search
assets/js/password.js                     generator, strength estimate, TOTP (RFC 6238)
assets/js/ui/*.js                         screens: auth, app shell, editor, security, settings
tools/build-vendor.mjs                    rebuilds vendor/firebase.js + copies fonts (npm i && npm run vendor)
```

Run locally: `npx http-server . -p 5173 -c-1` and open http://localhost:5173 (crypto needs `https://` or `localhost`).

Test against the Firebase emulators: `npx firebase-tools emulators:start --only auth,firestore --project demo-hafiz`, then in the browser console:
`localStorage.setItem('hafiz.emulator','1'); localStorage.setItem('hafiz.firebase', JSON.stringify({apiKey:'demo',authDomain:'demo-hafiz.firebaseapp.com',projectId:'demo-hafiz',appId:'1:1:web:1'}))` and reload.

When releasing changes, bump `VERSION` in `sw.js` so installed apps pick up the new files and show the "new version" prompt.

</div>
</details>

</div>
