# إعداد Google Form لجمع بيانات المؤسسين

دليل خطوة بخطوة لربط نموذج "Founding Members" بـ Google Sheet — مجاناً، بدون باك إند.

---

## الخطوة 1: إنشاء Google Form

1. افتحي https://forms.google.com
2. اضغطي **"Blank form"** (نموذج فارغ)
3. سمّيه: **"Sabr - Founding Members"**

أضيفي الحقول التالية بنفس الترتيب:

| ترتيب | السؤال | النوع | إلزامي؟ |
|------|---------|-------|---------|
| 1 | الاسم الكامل / Full Name | Short answer | ✅ |
| 2 | البريد الإلكتروني / Email | Short answer | ✅ |
| 3 | المؤسسة الأكاديمية / Organization | Short answer | ❌ |
| 4 | تاريخ التسجيل / Joined At | Short answer | ❌ |

> 💡 **ملاحظة**: لا تستخدمي حقل "Email" المدمج في Google Forms — استخدمي Short answer عادي حتى يعمل بدون تسجيل دخول للمستخدم.

---

## الخطوة 2: ربط النموذج بـ Google Sheet

1. في تبويب **Responses** (الردود)
2. اضغطي أيقونة **Google Sheets الخضراء**
3. اختاري **"Create a new spreadsheet"**
4. سيُفتح Google Sheet تلقائياً وكل تسجيل جديد سيُضاف لصف فيه

---

## الخطوة 3: استخراج رابط الإرسال (formActionUrl)

1. في النموذج، اضغطي زر **"Send"** (إرسال) في الأعلى
2. اختاري أيقونة **الرابط (🔗)**
3. انسخي الرابط — سيكون شيئاً مثل:
   ```
   https://docs.google.com/forms/d/e/1FAIpQLSc_XXXXXXXXXXX/viewform?usp=sf_link
   ```
4. **استبدلي** `viewform` بـ `formResponse` في نهاية الرابط:
   ```
   https://docs.google.com/forms/d/e/1FAIpQLSc_XXXXXXXXXXX/formResponse
   ```
5. هذا هو الـ `formActionUrl` الذي سنستخدمه

---

## الخطوة 4: استخراج معرّفات الحقول (entry IDs)

هذه أصعب خطوة لكنها مرة واحدة فقط.

1. افتحي نموذجك بصيغة **viewform** في Chrome:
   ```
   https://docs.google.com/forms/d/e/1FAIpQLSc_XXXXXXXXXXX/viewform
   ```
2. اضغطي **F12** لفتح Developer Tools → بوب **Elements**
3. ابحثي (Ctrl+F) عن الكلمة `entry.` — ستجدين 4 معرّفات بأشكال مثل:
   ```
   entry.123456789
   entry.987654321
   entry.555555555
   entry.111222333
   ```
4. لكل سؤال، اضغطي زر يمين على حقل الإدخال → **Inspect**
5. ابحثي في الـ HTML عن `name="entry.XXXXXXXX"` — هذا الرقم هو معرّف ذلك الحقل تحديداً

طريقة بديلة أسهل:
- في **viewform** املئي النموذج ببيانات وهمية
- اضغطي F12 → تبويب **Network**
- اضغطي Submit
- ستجدين طلب `formResponse` — اضغطي عليه → **Payload**
- سترين كل المفاتيح والقيم بوضوح

---

## الخطوة 5: تحديث الكود

افتحي الملف:
```
src/welcome.js
```

استبدلي القسم التالي:
```javascript
const GOOGLE_FORM_CONFIG = {
    formActionUrl: '',
    fields: {
        name: 'entry.NAME_ID_HERE',
        email: 'entry.EMAIL_ID_HERE',
        organization: 'entry.ORG_ID_HERE',
        timestamp: 'entry.TIMESTAMP_ID_HERE',
    },
};
```

بقيمك الحقيقية:
```javascript
const GOOGLE_FORM_CONFIG = {
    formActionUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSc_XXXXXXXXXXX/formResponse',
    fields: {
        name: 'entry.123456789',
        email: 'entry.987654321',
        organization: 'entry.555555555',
        timestamp: 'entry.111222333',
    },
};
```

ثم أعيدي بناء التطبيق:
```bash
npm run build:mobile
npx cap sync android
cd android && ./gradlew bundleRelease
```

---

## الخطوة 6: مراقبة المؤسسين

افتحي Google Sheet المرتبط بالنموذج في أي وقت — ستظهر كل تسجيلة جديدة في صف.

عند بلوغ **50 صف**، يحين وقت إغلاق التسجيل وإطلاق نموذج الاشتراك.

---

## ملاحظات مهمة

✅ **يعمل بدون CORS** — استخدمنا `mode: 'no-cors'` في `fetch`، وGoogle Forms مصممة لتقبل ذلك.

✅ **مجاني تماماً** — Google Sheets يدعم آلاف الصفوف بدون أي تكلفة.

⚠️ **لا يمكن قراءة الرد** — بسبب `no-cors`، لن نعرف إن نجح الإرسال أم فشل. لذلك التطبيق يحفظ حالة "عضو مؤسس" محلياً فوراً، والإرسال للنموذج يحدث في الخلفية.

⚠️ **اختبار محلي** — في `npm run dev:mobile` قد يفشل الإرسال بسبب CORS strict. الإنتاج (APK/AAB) يعمل بدون مشاكل.

⚠️ **النسخ الاحتياطي** — التطبيق يحفظ بيانات العضو في `localStorage` أيضاً، فلو فشل الإرسال يبقى المستخدم مسجلاً محلياً.

---

## رابط مفيد

- شرح بالفيديو (English): https://www.youtube.com/results?search_query=submit+to+google+form+from+code
- وثائق Google Forms: https://support.google.com/docs/answer/2839737
