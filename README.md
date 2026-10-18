# Paris Katakomb Atlası

ureten: codex · 2026-10-18

Telefon ve masaüstünde çalışan, GitHub Pages için hazırlanmış bağımsız PWA. İlk içerik Paris katakompları/taş ocakları kaynak atlasıdır. Şehir/tema çekirdeği ileride Archify tur haritalarına uyarlanabilir; çeşme, restoran ve diğer şehirler bu sürümde geliştirilmez.

## İçerik ve doğruluk

- 458 gerçek resmî IGC **pafta sınırı** ve kaynak metadatası. Bu sınırlar galeri çizgisi veya açık giriş değildir. 454 kaydın resmî PDF bağlantısı vardır; 4 kayıt bağlantısızdır.
- GRS çevresinde 3.650 OSM yerüstü öğesi; tüm Paris'in yerüstü verisi olduğu iddia edilmez. Adlar ve harita çizimi çevrimdışı çalışır.
- Catacombes.xyz üzerinde 46 yayınlanmış salon sayfasının bağlantı kataloğu. Bu, indirilmiş 46 model veya tüm yeraltının 3B ağı değildir.
- Avenza, Nexus, resmî müze ve diğer kaynaklar hak/çevrimdışı durumuyla katalogda tutulur.
- BnF/Gallica kaynaklı, kamu malı1857planının özgün5.126.942baytlık dosyası yerel ve çevrimdışı arşiv incelemesine dahil. Bu plan coğrafi altlığa hizalanmış veya güncel geçiş bilgisi değildir.
- Kullanıcının kendi GeoJSON, GLB ve PMTiles dosyaları yalnız cihazın IndexedDB deposuna alınır. GLB görüntüleyici gerçek yerel model açar; bilinmeyen coğrafi konumu uydurmaz. PMTiles arşivini okuyup harita stili için metadata sağlar; her keyfi arşivin stilini otomatik tahmin etmez.
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

Temel paket uygulama varlıkları, pafta dizini, GRS yerüstü, kaynaklar ve salon bağlantı metadatasını içerir. Dış PDF, Avenza haritası, Nexus görseli veya üçüncü taraf 3B model dosyaları indirilmez. Dış bağlantılar internet gerektirir. Yeraltında GPS garanti edilmez; son ölçüm, doğruluk ve elle eklenen noktalar ayrıdır. Tarayıcı verisi kullanıcı tarafından veya depolama baskısında silinebilir. Depolama kalıcılığı istenir ama garanti edilmez; kişisel notlar JSON olarak yedeklenebilir.

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
| `src/map/model.ts` | Tek dosyalık yerel GLB, kamera ve kaynak temizliği |
| `src/core/storage.ts` | Notlar, kişisel dosyalar ve kurulu paket sürümleri |
| `src/core/packages.ts` | Boyut/SHA doğrulamalı, başarısız güncellemede eski sürümü koruyan paket kurulumu |
| `src/core/validation.ts` | Koordinat/format, dış bağımlılık, URL ve hak kapıları |
| `src/sw-template.js` | Sürümlü temel paket ve yalnız tamamlanmış ek paketlerin çevrimdışı sunumu |
| `scripts/build-offline.mjs` | Çıktı dosyalarından SHA manifesti ve service worker üretimi |
| `public/data` | Yayımlanabilir indeks/yerüstü ve dış kaynak bağlantı katalogları |

Service worker yalnız bu atlasın URL alt yoluna ait eski temel önbelleklerini kendi sürüm değişiminde temizler; not/kişisel dosya depolarını silmez. Ek paketler önce ayrı önbellekte doğrulanır, kurulu sürüm metadata'sı ancak tüm dosyalar sağlamsa tek IDB işlemiyle değişir. Bekleyen/başarısız geçici önbellekler çevrimdışı sunulmaz.

Paket manifesti örneği `public/sample/manifest.json` içindedir. Bu küçük dosya teknik doğrulama örneğidir, gerçek katakomb içeriği değildir. İndirme dosyaları uygulamanın kendi origin/alt yolunda bulunmalı ve yeniden dağıtım izni manifestte açık olmalıdır. Kişisel dosyaların kamuya yüklenmesi otomatikleştirilmez.
