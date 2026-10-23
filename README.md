# NFL Fantasy Draft Asistanı 2026

Sleeper draftını canlı takip eden ve `sources/` klasöründeki Markdown ranking, tier list ve mock draft notlarını tek bir consensus sıralamasına çevirip her pick için öneri üreten yerel bir web uygulaması. Uygulama seçim yapmaz; öneriyi gösterir, oyuncuyu Sleeper'dan sen seçersin.

## Özellikler

- **Markdown'dan consensus:** `sources/*.md` dosyalarındaki ranking ve mock draft verileri ayrıştırılır, Sleeper oyuncu kataloğuyla eşleştirilir ve PPR / Half PPR / Standard formatları için ağırlıklı consensus üretilir.
- **Veri inceleme:** Güveni düşük ya da belirsiz eşleşen isimler inceleme ekranına düşer; onaylanan eşleşmeler alias olarak saklanır.
- **Sleeper bağlantısı:** Kullanıcı adıyla lig listesi, League ID ile otomatik lig ayarı (roster slotları, scoring türü, draft slotu) ya da Draft ID + kullanıcı adı / Roster ID ile bağlanma.
- **Canlı takip:** Arayüz draft durumunu 2,5 saniyede bir yeniler (Sleeper pickleri en sık ~1,8 saniyede bir çekilir); sıra sende olduğunda uyarı gösterilir.
- **Öneri motoru:** Değer, kadro ihtiyacı ve pozisyon nadirliğine göre "Şimdi Al" listesi.
- **Draft stratejileri:** BPA, Robust RB, Hero RB, Zero RB, WR Ağırlıklı, TE Premium.
- **Yardımcı paneller:** ADP fırsatları, oyuncu arama, kendi kadron, bye week çakışma uyarıları.
- **Demo / mock draft:** Yerel demo draft ya da League ID'ye bağlı mock; "Tümünü Simüle Et" ile kalan pickleri öneri motoruyla doldurma.
- **Manuel yedek seçim:** Sleeper erişimi kesilirse pickleri elle işaretleyebilirsin (SQLite'ta saklanır).

## Teknoloji yığını

- **Frontend:** React 19, Vite 7, TypeScript
- **Backend:** Express 5, `tsx` ile çalışan TypeScript
- **Veritabanı:** Node.js yerleşik `node:sqlite` (`data/draft-assistant.db`)
- **Veri kaynağı:** Sleeper public read-only API (anahtar gerektirmez)
- **Test:** Vitest

## Klasör yapısı

```
├── server/
│   ├── index.ts            # Express API (port 3031), build varsa dist/ servis eder
│   ├── markdown.ts         # sources/*.md ayrıştırıcı
│   ├── import-rankings.ts  # Sleeper kataloğu + Markdown eşleştirme, final JSON üretimi
│   ├── consensus.ts        # Formata göre ağırlıklı consensus
│   ├── recommend.ts        # Öneri motoru, stratejiler, ADP fırsatları
│   ├── sleeper.ts          # Sleeper API istemcisi
│   ├── database.ts         # SQLite şeması ve sorgular
│   └── recommend.test.ts   # Snake draft sıra testi
├── src/                    # React arayüzü (App.tsx, style.css)
├── sources/                # Ranking / tier list / mock draft Markdown notları
└── data/final-rankings/    # Üretilen consensus-{ppr,half_ppr,standard}.json
```

## Kurulum

`node:sqlite` modülü nedeniyle Node.js 22+ gerekir.

```bash
npm install
```

## Kullanım

1. `npm run dev` ile API ve arayüzü birlikte başlat.
2. Tarayıcıda `http://localhost:5181` adresini aç. 5173 çakışmasını önlemek için 5181 kullanılır; `/api` istekleri `http://localhost:3031` adresine proxylenir.
3. **Markdown'ları içe aktar** düğmesine bas. Sleeper oyuncu kataloğu indirilir, Markdown'lar eşleştirilir ve belirsiz adlar Veri inceleme ekranına düşer.
4. Sleeper kullanıcı adınla ligini seç ya da League ID / Draft ID ile bağlan. Kullanıcı adı çözülemezse kendi Roster ID'ini gir.
5. Taktiğini seç ve draft boyunca "Şimdi Al" önerilerini takip et.

### Draft günü akışı

- Drafttan yaklaşık 15 dakika önce importu çalıştır ve Veri inceleme ekranındaki belirsiz adları onayla.
- Sleeper erişimi kesilirse son board ekranda kalır; sağ paneldeki **Manuel yedek seçim** alanından mevcut picki işaretleyebilirsin.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | API (`tsx watch`) ve Vite istemcisini birlikte başlatır |
| `npm run import:rankings` | Ranking verisini terminalden yeniden içe aktarır |
| `npm run build` | TypeScript kontrolü ve istemci üretim build'i (`dist/`) |
| `npm start` | API sunucusunu başlatır; `dist/` varsa arayüzü de `http://localhost:3031` üzerinden sunar |
| `npm test` | Vitest birim testleri |

## Ortam değişkenleri

Bu sürüm hiçbir ortam değişkeni okumaz. `.env.example` yalnızca ileride eklenebilecek AI açıklamaları için yer tutucu içerir:

- `OPENROUTER_API_KEY`: OpenRouter API anahtarı (şu an kullanılmıyor)
- `OPENROUTER_MODEL`: OpenRouter model adı (şu an kullanılmıyor)

Gerçek değerleri yalnızca `.env` dosyasına koy; `.env` Git tarafından yok sayılır.

## Final sıralamalar

Her importtan sonra şu dosyalar yeniden üretilir:

- `data/final-rankings/consensus-ppr.json`
- `data/final-rankings/consensus-half_ppr.json`
- `data/final-rankings/consensus-standard.json`

Bu dosyalar repoda takip edilir; import sonrası değişirse commit'e dahil olur. SQLite veritabanı (`data/*.db*`) ise Git dışındadır.

## Sınırlar

Bu MVP redraft snake ligleri hedefler. Auction, keeper/dynasty, traded picks ve IDP desteklenmez. Öneriler `sources/` notlarının consensus'una dayanır; garantili bir tahmin ya da otomatik seçim aracı değildir.

## Proje durumu

Aktif geliştirme 2026-08-31 ile 2026-09-02 arasında yapıldı (2026 sezonu draftı için). Son değişiklik: 2026-10 (eski `graphify-out` çıktısının kaldırılması).
