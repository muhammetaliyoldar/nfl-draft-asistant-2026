# NFL Fantasy Draft Asistanı

Sleeper draftını canlı takip eden, bu klasördeki Markdown ranking ve mock draft notlarını birleşik öneriye çeviren yerel uygulama.

## Hızlı başlangıç

1. Node.js 22+ kurulu olmalı.
2. `npm install`
3. `npm run dev`
4. Tarayıcıda `http://localhost:5181` adresini aç. Bu proje 5173 çakışmasını önlemek için 5181’i kullanır.
5. **Markdown’ları içe aktar** düğmesine bas. Bu işlem Sleeper oyuncu kataloğunu indirir, Markdown’ları eşleştirir ve belirsiz adları Veri inceleme ekranına koyar.
6. League ID + Sleeper kullanıcı adıyla bağlan. Alternatif olarak Draft ID + kullanıcı adı gir; kullanıcı adı çözülemezse kendi Roster ID’ini kullan.

## Draft günü akışı

- Drafttan 15 dakika önce import işlemini çalıştır ve Veri inceleme ekranındaki belirsiz adları onayla.
- League ID ile bağlanınca uygulama roster slotlarını, scoring türünü ve kendi draft slotunu otomatik bulur.
- Sleeper’daki seçimler 2.5 saniyede bir izlenir. Sıra sende olduğunda yeşil uyarı görünür.
- Uygulama seçim yapmaz; öneriyi kontrol edip oyuncuyu Sleeper’dan sen seçersin.
- Sleeper erişimi kesilirse son board kalır. Sağ paneldeki **Manuel yedek seçim** alanından mevcut pick’i işaretleyebilirsin.

## Komutlar

- `npm run dev`: UI ve API geliştirme sunucuları.
- `npm run import:rankings`: Ranking verisini terminalden yeniden içe aktarır.
- `npm run build`: TypeScript kontrolü ve istemci üretim build’i.
- `npm start`: Build edilmiş istemciyle API sunucusu.
- `npm test`: Birim testleri.

## Final sıralamalar

Her importtan sonra nihai sıralama formatları otomatik üretilir:

- `data/final-rankings/consensus-ppr.json`
- `data/final-rankings/consensus-half_ppr.json`
- `data/final-rankings/consensus-standard.json`

Bu dosyalar kaynak notlarının birleşik sonucudur. Git tarafından takip edilmez; her importta güncellenir.

## Güvenlik ve public repo

Sleeper’ın read-only API’si anahtar istemez. Bu sürüm OpenAI/OpenRouter kullanmaz. Gelecekte bir anahtar eklersen yalnızca proje kökündeki `.env` dosyasına koy; istemci koduna veya Git’e yazma. `.env` ve yerel SQLite/üretilmiş ranking dosyaları `.gitignore` içindedir.

## Sınırlar

Bu MVP redraft snake ligleri hedefler. Auction, keeper/dynasty, traded picks ve IDP desteklenmez. Öneriler senin Markdown kaynaklarının consensus’ına dayanır; garanti edilmiş bir tahmin veya otomatik seçim aracı değildir.
