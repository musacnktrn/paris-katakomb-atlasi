# Paris Katakomb Atlası

ureten: codex · 2026-10-18

Telefon ve masaüstünde çalışan, GitHub Pages için hazırlanmış bağımsız PWA. İlk içerik Paris katakompları/taş ocakları kaynak atlasıdır. Şehir/tema çekirdeği ileride Archify tur haritalarına uyarlanabilir; çeşme, restoran ve diğer şehirler bu sürümde geliştirilmez.

## İçerik ve doğruluk

- 458 gerçek resmî IGC **pafta sınırı** ve kaynak metadatası. Bu sınırlar galeri çizgisi veya açık giriş değildir. 454 kaydın resmî PDF bağlantısı vardır; 4 kayıt bağlantısızdır.
- GRS çevresinde 3.650 OSM yerüstü öğesi; tüm Paris'in yerüstü verisi olduğu iddia edilmez. Adlar ve harita çizimi çevrimdışı çalışır.
- Catacombes.xyz kaynaklı 46 salon kaydı: 40 yayımlanmış konum (39 tekil nokta), 6 kaynakta saklı konum. Bilinmeyen konumlar tahmin edilmez. Resmî müzenin ziyaretçi girişi ve adres koordinatıyla işaretlenmiş çıkışı ayrı katmandır. Tüm girişler/güncel açıklık envanteri değildir.
- Açık / koyu / IGN hava fotoğrafı altlıkları ve tek haritada 6 içerik katmanı. Paris hava fotoğrafı 17 yerel görselle çekirdeğe dahildir; © IGN, Licence Ouverte 2.0. İndirme tarihi çekim tarihi sayılmaz.
- Kişisel arşiv ZIP'leriyle 46 gerçek GLB önizleme + 46 kapak, 45 özgün yüksek kaliteli model ve 252 gerçek koordinatlandırılmış IGC galeri planı uygulamanın içine kurulabilir. Kişisel arşivler `private-data/` altında Git dışındadır; kaynak hakları kamuya yeniden dağıtım için doğrulanmadı.
- GLB görüntüleyicide döndürme, yakınlaşma, üstten/yandan bakış ve X/Y/Z eksenlerinde gerçek model geometrisi kesiti. Yerel Draco/Meshopt çözücüleri paketlidir.
- 40 konum/değerden 3B derinlik görünümü ve kesit bandı. Bu görünüm yayımlanmış salon noktalarını gösterir; koridor bağlantısı veya birleşik tam ağ mesh'i üretmez. Salon konumları yayıncı kaydıdır, bağımsız ölçüm doğruluğu bilinmez.
- Avenza, Nexus, resmî müze ve diğer kaynaklar hak/çevrimdışı durumuyla katalogda tutulur.
- BnF/Gallica kaynaklı, kamu malı1857planının özgün5.126.942baytlık dosyası yerel ve çevrimdışı arşiv incelemesine dahil. Bu plan coğrafi altlığa hizalanmış veya güncel geçiş bilgisi değildir.
- Kullanıcının kendi GeoJSON, GLB, PMTiles ve PNG/JPEG/WebP dosyaları yalnız cihazın IndexedDB deposuna alınır. GLB görüntüleyici gerçek yerel model açar; bilinmeyen coğrafi konumu uydurmaz. PMTiles arşivini okuyup harita stili için metadata sağlar; her keyfi arşivin stilini otomatik tahmin etmez.
- Kişisel harita görselleri kütüphaneden eklenip çevrimdışı yakınlaştırılır/sürüklenir; bunlar otomatik coğrafi hizalanmaz. Görsel dosyaları 16 MiB / 64 megapiksel ile sınırlıdır.
- GPX dönüştürme, georeference edilmemiş rasterı konumlandırma, tam galeri topolojisi ve tüm girişlerin güncel durumu henüz yoktur.

## Çalıştırma

Node 24 veya üstü:

```sh
npm ci
npm run dev
```

Üretim ve service worker doğrulaması:

```sh
npm test
npm run build
npm run verify:release
npm run test:browser
```

Elle üretim önizlemesi için `npm run preview` kullanılabilir.

PWA önbelleği geliştirme sunucusunda değil, üretim önizlemesi/HTTPS yayınında kurulur. Tarayıcı testleri izole Chrome profili kullanır; açık kullanıcı Chrome pencerelerine dokunmaz. Üretim önizlemesi test yapılandırması tarafından başlatılır; aynı 5184 portunda ikinci servis açmayın.

## Telefonda çevrimdışı

1. Yayın URL'sini bir kez internetle açın; temel paketin indirilmesini bekleyin.
2. Çevrimdışı paketler alanındaki doğrulamayı çalıştırın. Hazır olmayan paketi kullanıma hazır saymayın.
3. iPhone Safari: Paylaş → Ana Ekrana Ekle. Destekleyen Android tarayıcı: menü → Uygulamayı yükle.
4. Uçak modunda uygulamayı kapatıp yeniden açarak harita, arama ve not kaydını deneyin.

Temel paket yaklaşık 29,3 MB: uygulama, yerel çözücüler, pafta dizini, GRS yerüstü, salon konumları, 1857 planı ve Paris hava fotoğrafı. Kütüphane → Arşiv paketi ekle ile hazırlanan kişisel ZIP dosyalarını bir kez içe aktarın; ondan sonra modeller ve IGC galerileri dış sunucu olmadan açılır. Her dosya boyut/SHA-256/format kontrolünden geçer; kurulum atomiktir. Bozuk güncelleme mevcut sağlam koleksiyonu ve notları korur. Koleksiyonlar ayrı kaldırılabilir. Dış kaynak/PDF/Avenza bağlantıları referanstır, otomatik indirilmez; bu bağlantıları açmak internet gerektirir. Yeraltında GPS garanti edilmez; son ölçüm, doğruluk ve elle eklenen noktalar ayrıdır. Tarayıcı verisi kullanıcı tarafından veya depolama baskısında silinebilir. Depolama kalıcılığı istenir ama garanti edilmez; kişisel notlar JSON olarak yedeklenebilir.

## GitHub Pages

Bu dizin bağımsız depo köküdür. `.github/workflows/pages.yml` test/build/bütünlük kontrolü sonrasında `dist` yayımlar. Repo Settings → Pages → Source: GitHub Actions olmalıdır. Göreli varlık yolları, manifest id/scope/start_url ve service worker kapsamı proje alt yoluyla çalışacak şekilde hazırlanmıştır. HTML route'ları yerine aynı sayfa etkileşimleri kullanılır. ChatGPT Sites kullanılmaz.

Statik ilk sürüm hesap veya ortak sunucu gerektirmez. Kişisel notlar cihazlar arasında kendiliğinden eşitlenmez. Bunun değişmesi ayrı ürün kararıdır. Büyük pafta/model arşivlerini Git geçmişine doldurmayın; GitHub dosya ve Pages yayın sınırları ayrıca geçerlidir.

## Kaynak kodunun yeniden kullanımı

`third_party/catacombes-atlas` içinde Rayandri'nin MIT lisanslı seçili veri-alım kodu orijinal hâliyle korunur. `scripts/ingest-igc.py` bu kodun query/bbox/GRS parçalarından gerçekten yararlanır, pagination ve tamlık doğrulaması ekler. Kaynak commit ve hash'ler PROVENANCE.json içindedir. MIT yalnız koda aittir; IGC pafta görselleri bu lisansa dahil değildir. İnceleme için edinilen metadata ile raster belge farklıdır. Kaynak çizimleri bu depoya dahil edilmez.

OSM türevi yerüstü verisi ODbL 1.0 ve görünür atıfla gelir. OSM'nin standart karo sunucusundan toplu çevrimdışı indirme yapılmaz. Bağımlılıkların ve upstream kodun lisansları `public/THIRD-PARTY-NOTICES.txt` içinde korunur.

## Modüller

| Konum | İşlev |
|---|---|
| `src/App.tsx` / `src/technical.css` | Son kullanıcı harita arayüzü |
| `src/map/controller.ts` | Tek MapLibre örneği, yerel katmanlar, odak/GPS, PMTiles adaptörü |
| `src/map/model.ts` | Yerel GLB/Draco/Meshopt, kamera, geometri kesiti ve kaynak temizliği |
| `src/components/SpatialAtlas.tsx` | Belgeli salon konum/derinlikleri ve kesit bandı |
| `src/core/collections.ts` | Yerel ZIP manifesti, hash/boyut/format, atomik kurulum/kaldırma |
| `src/core/storage.ts` | Notlar, kişisel dosyalar ve kurulu paket sürümleri |
| `src/core/packages.ts` | Boyut/SHA doğrulamalı, başarısız güncellemede eski sürümü koruyan paket kurulumu |
| `src/core/validation.ts` | Koordinat/format, dış bağımlılık, URL ve hak kapıları |
| `src/sw-template.js` | Sürümlü temel paket ve yalnız tamamlanmış ek paketlerin çevrimdışı sunumu |
| `scripts/build-offline.mjs` | Çıktı dosyalarından SHA manifesti ve service worker üretimi |
| `public/data` | Yayımlanabilir indeks/yerüstü ve dış kaynak bağlantı katalogları |

Service worker yalnız bu atlasın URL alt yoluna ait eski temel önbelleklerini kendi sürüm değişiminde temizler; not/kişisel dosya depolarını silmez. Ek paketler önce ayrı önbellekte doğrulanır, kurulu sürüm metadata'sı ancak tüm dosyalar sağlamsa tek IDB işlemiyle değişir. Bekleyen/başarısız geçici önbellekler çevrimdışı sunulmaz.

Paket manifesti örneği `public/sample/manifest.json` içindedir. Bu küçük dosya teknik doğrulama örneğidir, gerçek katakomb içeriği değildir. İndirme dosyaları uygulamanın kendi origin/alt yolunda bulunmalı ve yeniden dağıtım izni manifestte açık olmalıdır. Kişisel dosyaların kamuya yüklenmesi otomatikleştirilmez.

## Kişisel arşiv üretimi

`ingest-room-archive.py`, `ingest-room-originals.py`, `ingest-igc-raster.py` kaynakları yeniden denetler ve özel dizine alır; yeniden indirmek zorunlu değildir. `python3 scripts/build-private-collections.py --originals` doğrulanmış yerel dosyalardan en fazla 250 MiB'lık ZIP paketleri üretir. Büyük özgün arşiv parçalara bölünür. Bu paketleri public/ veya GitHub Releases içine izinsiz taşımayın. Gerçek özel arşiv kabulü için üretim sunucusu açıkken `ATLAS_QA_URL` ile hedef verip `node scripts/qa-real-archive.mjs` çalıştırılabilir; `ATLAS_QA_ALL_MODELS=1` 46 modeli tek tek açar. Kanıtlar repo dışındaki proje outputs/ klasöründedir. Fiziksel iPhone/Android kabulü emülasyonla eş tutulmaz.

Özgün arşiv durumu: 46 önizleme tamdır; 45 özgün dosya doğrulanmıştır. Toudouze özgünü 22.028.308 bayt beklenirken sınırlı tam GET ve HTTP Range denemelerinde alınamadı; bu salonun optimize edilmiş modeli vardır. Eksik dosya `--allow-incomplete` ile açık eksik listesi tutularak paketlenir, tamamlandı sayılmaz.
