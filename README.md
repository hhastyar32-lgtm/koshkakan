# کۆشکەکان — Production-ready starter

پلاتفۆرمی حجزکردنی کۆشک، مەزرەعە و باغ بە زمانی سۆرانی.

## خێراکردن
1. Node.js 20+ دابەزێنە.
2. `npm install`
3. `.env.example` بکە بە `.env` و SESSION_SECRET و هەژماری Admin بگۆڕە.
4. `npm start`
5. لە `http://localhost:3000` بیکەرەوە.

## Online
`render.yaml` بۆ Render ئامادە کراوە. SQLite لە `/app/db` هەڵدەگیرێت و پێویستی بە persistent disk هەیە.

## پارەدان
ئێستا payment record + manual flow هەیە. بۆ پارەدانی ئۆنلاین، credential ـی provider ـێکی گونجاو بۆ بازاڕی عێراق پێویستە. `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_API_SECRET` بۆ ئەو مەبەستە دانراون.

## Admin
هەژماری Admin لە environment variables دروست دەکرێت. دوای deploy وشەی نهێنییەکە بگۆڕە و هەرگیز credential ـەکان لە GitHub/HTML دانەمەزرێنە.
