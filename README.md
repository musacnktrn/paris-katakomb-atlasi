# Paris Katakomb Atlası

ureten: codex · 2026-10-18

Telefon ve masaüstünde çalışan, GitHub Pages için hazırlanmış bağımsız PWA. İlk içerik Paris katakompları/taş ocakları kaynak atlasıdır. Şehir/tema çekirdeği ileride Archify tur haritalarına uyarlanabilir; çeşme, restoran ve diğer şehirler bu sürümde geliştirilmez.

## İçerik ve doğruluk

- 458 gerçek resmî IGC **pafta sınırı** ve kaynak metadatası. Bu sınırlar galeri çizgisi veya açık giriş değildir. 454 kaydın resmî PDF bağlantısı vardır; 4 kayıt bağlantısızdır.
- IGN BD TOPO, 2026-06-15 edisyonu: **261.229 yol** bütün 458 paftanın 32,7 × 25,4 km zarfında. **124.605 bina** Paris sınırı ve GRS çevresinde; 115.374 kaynak yüksekliği, 9.231 bilinmeyen yükseklik. Yaklaşık 64 MB yerel PMTiles içinde z15 ve z16 kaynak kimliği tamlığı ölçüldü; kaynak yüksekliklerinin değişmediği karşılaştırma z16 içindir. Açık lisans: Etalab 2.0. Aynı haritada 3B şehir ve bina saydamlığı; bina izi ve kaynak yüksekliğinden türetilmiş LoD1 görünümü, fotogerçekçi çatı modeli değildir.
- Ayrıca 9.389 belediye yerüstü öğesi: 25.094 özgün yol parçası, 2.522 yeşil alan ve 60 su alanı. Kopuk yol parçaları birleştirilmez. © Ville de Paris, ODbL 1.0. Yol kaynağı Haziran 2018; indirme tarihi ölçüm tarihi değildir.
- Catacombes.xyz kaynaklı 46 salon kaydı: 40 yayımlanmış konum (39 tekil nokta), 6 kaynakta saklı konum. Bilinmeyen konumlar tahmin edilmez. Resmî müzenin ziyaretçi girişi ve adres koordinatıyla işaretlenmiş çıkışı ayrı katmandır. Tüm girişler/güncel açıklık envanteri değildir.
- Açık / koyu / IGN hava fotoğrafı altlıkları ve tek haritada 8 içerik katmanı ve 4 özel vektör sınıfı. Paris hava fotoğrafı 17 yerel görselle çekirdeğe dahildir; © IGN, Licence Ouverte 2.0. İndirme tarihi çekim tarihi sayılmaz.
- Kişisel arşiv ZIP'leriyle 46 gerçek GLB önizleme + 46 kapak, 45 özgün yüksek kaliteli model ve 252 gerçek koordinatlandırılmış IGC galeri planı uygulamanın içine kurulabilir. Kişisel arşivler `private-data/` altında Git dışındadır; kaynak hakları kamuya yeniden dağıtım için doğrulanmadı.
- GLB görüntüleyicide döndürme, yakınlaşma, üstten/yandan bakış ve X/Y/Z eksenlerinde gerçek model geometrisi kesiti. Yerel Draco/Meshopt çözücüleri paketlidir.
- Ayrı gerçek tarama görünümü: Émile Le Gallic / Minifixio’nun 8 birleşik LiDAR taraması, gerçek galeri geometrisi (188.736 üçgen), eşleşen bina/yol modeli ve X/Y/Z kesiti. 29,3 MB kaynak dosyası ilk açılışta doğrudan cihaza indirilip SHA ile doğrulanır. Kaynağın ortak yerel çerçevesi korunur; dünya dönüşümü bulunmadığından 2B haritaya tahmini oturtulmaz. Bu, Paris’in tamamı değildir. Kaynak taramada doku koordinatı eksik olduğundan geometri taş rengiyle aydınlatılır. İkinci sekmede 40 yayıncı derinlik noktası, gerçek yüzey yolları, resmî müze erişimi ve kayıtlı IGC plan düzlemleri birlikte incelenir; plan düzlemleri ölçülmüş tünel yüksekliği sayılmaz.
- Avenza, Nexus, resmî müze ve diğer kaynaklar hak/çevrimdışı durumuyla katalogda tutulur.
- BnF/Gallica kaynaklı, kamu malı 1857 planının özgün 5.126.942 baytlık dosyası yerel ve çevrimdışı arşiv incelemesine dahil. Bu plan coğrafi altlığa hizalanmış veya güncel geçiş bilgisi değildir.
- Kullanıcının kendi GeoJSON, GLB, PMTiles ve PNG/JPEG/WebP dosyaları yalnız cihazın IndexedDB deposuna alınır. GLB görüntüleyici gerçek yerel model açar; bilinmeyen coğrafi konumu uydurmaz. PMTiles arşivini okuyup harita stili için metadata sağlar; her keyfi arşivin stilini otomatik tahmin etmez.
- Kişisel harita görselleri kütüphaneden eklenip çevrimdışı yakınlaştırılır/sürüklenir; bunlar otomatik coğrafi hizalanmaz. Görsel dosyaları 16 MiB / 64 megapiksel ile sınırlıdır.
- GPX dönüştürme, her keyfî rasterı otomatik konumlandırma, tam galeri topolojisi ve tüm girişlerin güncel durumu henüz yoktur.

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

Temel paket yaklaşık138MB: uygulama, yerel çözücüler, pafta dizini, Paris geneli yerüstü, yeşil/su örtüsü, salon konumları, 1857 planı ve Paris hava fotoğrafı. Çevrimdışı kullan menüsündeki iki düğmeyle birleşik 3B + 46 görseli (~30 MB) ve 252 koordinatlı galeri alanını (~142 MB) doğrudan cihaza kaydedin. Tek pafta seçimi de resmî IGC mosaik planını aynı haritaya hizalar; görüntünün servisten dönen gerçek EPSG:3857 sınırları kullanılır. Kütüphane → Arşiv paketi ekle ile ayrı salonların optimize/özgün modellerini içeren kişisel ZIP dosyalarını da içe aktarabilirsiniz; ondan sonra modeller ve IGC galerileri dış sunucu olmadan açılır. Birden çok ZIP birlikte seçilebilir; uygulama çalışma belleğini sınırlamak için paketleri sırayla doğrular ve kurar. Her dosya boyut/SHA-256/format kontrolünden geçer; her paketin kurulumu atomiktir. Bozuk bir parçada işlem durur, daha önce doğrulanan koleksiyonlar ve notlar korunur. Koleksiyonlar ayrı kaldırılabilir. Dış kaynak/PDF/Avenza bağlantıları referanstır, otomatik indirilmez; bu bağlantıları açmak internet gerektirir. Yeraltında GPS garanti edilmez; son ölçüm, doğruluk ve elle eklenen noktalar ayrıdır. Tarayıcı verisi kullanıcı tarafından veya depolama baskısında silinebilir. Depolama kalıcılığı istenir ama garanti edilmez; kişisel notlar JSON olarak yedeklenebilir.

## GitHub Pages

Bu dizin bağımsız depo köküdür. `.github/workflows/pages.yml` test/build/bütünlük kontrolü sonrasında `dist` yayımlar. Repo Settings → Pages → Source: GitHub Actions olmalıdır. Göreli varlık yolları, manifest id/scope/start_url ve service worker kapsamı proje alt yoluyla çalışacak şekilde hazırlanmıştır. HTML route'ları yerine aynı sayfa etkileşimleri kullanılır. ChatGPT Sites kullanılmaz.

Statik ilk sürüm hesap veya ortak sunucu gerektirmez. Kişisel notlar cihazlar arasında kendiliğinden eşitlenmez. Bunun değişmesi ayrı ürün kararıdır. Büyük pafta/model arşivlerini Git geçmişine doldurmayın; GitHub dosya ve Pages yayın sınırları ayrıca geçerlidir.

## Kaynak kodunun yeniden kullanımı

`third_party/catacombes-atlas` içinde Rayandri'nin MIT lisanslı seçili veri-alım kodu orijinal hâliyle korunur. `scripts/ingest-igc.py` bu kodun query/bbox/GRS parçalarından gerçekten yararlanır, pagination ve tamlık doğrulaması ekler. Kaynak commit ve hash'ler PROVENANCE.json içindedir. MIT yalnız koda aittir; IGC pafta görselleri bu lisansa dahil değildir. İnceleme için edinilen metadata ile raster belge farklıdır. Kaynak çizimleri bu depoya dahil edilmez.

Belediye yerüstü ve eski GRS OSM verisi ODbL 1.0 ve görünür atıfla gelir. OSM'nin standart karo sunucusundan toplu çevrimdışı indirme yapılmaz. Bağımlılıkların ve upstream kodun lisansları `public/THIRD-PARTY-NOTICES.txt` içinde korunur.

## Modüller

| Konum | İşlev |
|---|---|
| `src/App.tsx` / `src/technical.css` | Son kullanıcı harita arayüzü |
| `src/map/controller.ts` | Tek MapLibre örneği, yerel katmanlar, odak/GPS, PMTiles adaptörü |
| `src/map/model.ts` | Yerel GLB/Draco/Meshopt, kamera, geometri kesiti ve kaynak temizliği |
| `src/components/SpatialAtlas.tsx` / `MergedSurvey.tsx` | Gerçek birleşik LiDAR; şehir, plan ve derinlik sekmeleri |
| `src/map/survey.ts` | Kaynağın ortak 3B çerçevesinde galeri/yüzey ve gerçek kesit |
| `src/core/source-cache.ts` | Resmî IGC extent hizalaması ve bütünlük kontrollü kişisel kaynak indirmesi |
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

## V3 kaynak ve çevrimdışı kabulü · [codex]

`node scripts/qa-v3-live.mjs` gerçek IGC görüntüsü, gerçek salon fotoğrafı ve sabit committeki iki gerçek LiDAR/yüzey GLB dosyasını ayrı kalıcı Chrome profiline alır; tarayıcı tamamen kapanıp ağ kapalı yeniden açılır. Kaynaklar bu kabulde taklit edilmez. Otomatik `map-preview.spec.ts` ise açıkça küçük teknik resimlerle taklit edilen deterministik regresyondur. Kanıtlar proje `outputs/v3-kullanilabilirlik/` altında. Yeni PWA sürümü eski not ve kişisel arşiv IDB adını korur; açık eski sekmelerin yüklenecek JS parçaları için bir önceki çekirdek önbelleği saklanır.

## V4 coğrafi atlas ve özel vektör katmanları · [codex]

`Coğrafi 3B` düğmesi aynı haritayı yatırır; gerçek IGN bina yüksekliği kullanır. `Tümünü göster` 458 paftaya, `Ağı sığdır` içe aktarılmış ağın tümüne sığar. Özel GeoJSON dosyaları bir kez kütüphanedeki `Kişisel dosya ekle` ile eklenince, uygulama her açıldığında aynı haritada kendiliğinden yüklenir; internet veya yeniden dosya seçimi gerekmez. Yeraltı sekmesi arama/seçimi destekler. Katmanlarda plan çizgileri, şaft/kuyu/merdivenler, salon/plan işaretleri ve tarihî yüzey işaretleri ayrı ayrı açılır. Başlıklar metin olarak işlenir. Kaynak sınıfı, özgün piksel ve bilinmeyen erişim/derinlik korunur.

Kişisel Nexus/Hacky türevi paket kamu deposunda yoktur: kod MIT olsa da alttaki 2007/2011 haritasının yeniden dağıtım izni bununla eşit değildir. Özel vektör çizgiler gerçek raster izinden türetilir; ölçülmüş galeri merkez hattı, duvar, navigasyon ağı veya güncel giriş envanteri sayılmaz. Konum kalibrasyonunun kaynaklar arası uyumu saha doğruluğu değildir. Dünya dönüşümü olmayan 8 tarama zorla Paris haritasına oturtulmaz.

Salon görselleri ilk internetli açılışta iki eşzamanlı iş ile çözülerek cihazda hazırlanır. Bozuk önbellek kaydı silinip JPEG alternatifi denenir; bütün görseller alınamazsa eksik sayısı açıkça kalır. `scripts/qa-v4-device.mjs` izole gerçek Chrome/WebKit profillerinde kaynak tarama görseli, yerel bölgesel 3B, tarayıcıyı kapatıp çevrimdışı yeniden açılış ve tüm çekirdek SHA kontrolünü yapar. Fiziksel iPhone kabulü değildir.

## V4 salon fotoğrafları · [opus]

Salon ayrıntısında iki ayrı görünüm var: `Fotoğraflar (n)` gerçek kamera fotoğraflarını, `3B tarama görüntüsü` Catacombes.xyz tarama posterini gösterir; poster fotoğraf diye sunulmaz. Her fotoğrafın altında yazar, lisans ve kaynak bağlantısı yazar. Harita işaretinde ve önizleme kartında sıra: cihazdaki kişisel fotoğraf, kamu fotoğrafı, cihazdaki tarama posteri, uzak tarama posteri. Tarama posteri kullanılan işaret küçük `3B` rozeti taşır.

Kamu paketi yalnız `public/data/room-photos.json` içindeki açık lisanslı Commons dosyalarını taşır; 2026-10-18 kataloğunda tek dosya: Rémi Villalongue, CC BY 2.5, Philibert Aspairt steli, özgün 2048 x 1536 dosya değiştirilmeden. `scripts/verify-room-photos.mjs` derlemeden önce ve `dist` üzerinde dosya, bayt, SHA-256, piksel boyutu, lisans izin listesi (CC0, PD, CC BY, CC BY-SA), yazar, Commons kaynak sayfası, `rooms.json` bağı, atıf metni ve kataloglanmamış dosya yokluğunu denetler; kişisel katalog bu makinede varsa onun hiçbir dosyasının kamu paketinde olmadığını da doğrular.

Açık lisansı olmayan ya da içindeki eserlerin hakları belirsiz fotoğraflar yalnız kişisel ZIP ile cihaza eklenir (`Arşiv paketi ekle`). ZIP `private-data/` altında `node scripts/build-room-photo-collection.mjs --catalog <private-data/...json> --out <private-data/...zip>` ile üretilir; betik `private-data` dışına yazmaz. İçe aktarmada her görselin SHA-256 ve piksel boyutu yeniden doğrulanır; `personal-cache-only` fotoğraf yalnız `personal-copy` arşivinde kabul edilir. Arşiv kaldırılınca fotoğraflar haritadan ve galeriden hemen düşer.

## Gizlilik kapısı · [opus]

`npm run build`, `build-offline` adımından sonra `scripts/verify-no-private.mjs` betiğini çalıştırır; tek başına `npm run verify:private` ile de çalışır. Betik `public/` ve `dist/` altındaki bütün metin dosyalarında ve PMTiles arşivlerinin sıkıştırılmış metadata'sında yerel ev yolu (`/Users/`), `private-data` yolu ve özel kaynak işaretlerini arar. Özel kaynakların adları bu depoya yazılmaz: makinede `private-data/` varsa kişisel fotoğraf kataloğundan ve `private-data/verify-no-private.markers.json` dosyasından okunur. `private-data/` varsa oradaki her dosya (tarayıcı profilleri, QA önbellekleri ve 300 MB üstü dosyalar hariç) bayt bayt kamu paketiyle karşılaştırılır; yalnız `room-photos.json` içindeki açık lisanslı fotoğraflar ve kamu dosyasıyla aynıysa IGN karo derlemesi izinlidir. CI'da `private-data/` olmadığı için bayt karşılaştırması atlanır, metin taraması yine çalışır.

`public/data/region.pmtiles` metadata'sındaki `generator_options` alanı yerel yol taşımaz: `scripts/clean-pmtiles-metadata.py` mutlak yolları yalnız dosya adına indirir, karo ve dizin baytlarına dokunmaz. `scripts/ingest-regional-surface.py` bunu her yeni derlemede kendisi çalıştırır.

## Faz 4a devam kabulü · 2026-10-23 · [codex]

Bölgesel yol/bina paketi başlangıç için zorunlu değildir; indirme hatasında Paris yüzeyi, arama ve kayıtlar kullanılabilir. Haritada Türkçe uyarı ve yeniden deneme düğmesi görünür. Cepte ayrıntı yarım sayfa açılır; `Tümünü göster` genişletir, kapatınca seçili noktanın halkası kalır. Kaynak konum belirsizliği yalnız pakette gerçek bir hata ölçümü varsa gösterilir.

`ATLAS_QA_BROWSER=webkit npm run test:browser -- tests/browser/f4a.spec.ts` yerel WebKit regresyonlarını çalıştırır. Bu komutun varlığı testin geçtiğini veya fiziksel iPhone kabulünü göstermez. Güncel sonuçlar proje çıktı klasöründeki tarihli kabul raporlarındadır. Gizlilik kapısı kamu varlıkları yanında kaynak/test/betik/README metinlerini de yerel özel kaynak işaretleri ve özel nokta kimlikleri açısından denetler; özel veriler gate dosyasına kopyalanmaz.


## Katmanlı kaynak görünümü · 2026-10-23 · [codex]

3B düğmesi, içe aktarılan GeoJSON çizgilerini ve kayıtlarını aynı sahnede açar. Üst/alt ayrımı yalnız kaynak sourceLevel alanını okur. Katman aralığı temsilîdir; seviyesi bilinmeyen kayıtlar ayrı gösterim düzlemindedir. Bu düzlem üçüncü bir gerçek kat değildir. Kaynak boşlukları birleştirilmez, plan çizgilerinden ölçülmüş duvar/derinlik üretilmez. Ayrı LiDAR görünümü ortak yerel çerçevesini korur.

IGN bina yükseklikleri mevcut, SHA256 doğrulanmış bölgesel PMTiles arşivinden okunur. Yüksekliği bilinmeyen bina tel kafese dönüştürülmez. Düz yüzey üzerindeki2,5B gösterim arazi/çatı modeli değildir. Plan çizgilerine veya tüm kayıtlara sığdırma, katman aç/kapat ve gerçek çizim geometrisini iki kırpma düzlemiyle kesme desteklenir.

Kişisel giriş işaretleri, kamera fotoğrafları, tarihî harita türevleri ve 3B modeller kişisel paketlerden bir kez içe aktarılır; özel içerik GitHub paketine eklenmez. Kaynak süzgeci aynı zamanda katmanlı sahneye gönderilen kaynakları belirler. Kaynaklar arası yakınlık varsa ayrıntıda gösterilir; bu sayı aynı fiziksel galeri veya bağımsız saha ölçümü doğrulaması değildir.

Açık IGN bitki örtüsü/su paketi31.794 kaynak kaydı taşır. Doğa koruma alanı çimen/şehir parkı diye yorumlanmaz; mezarlık ve spor alanları ayrı sınıflardır. Kaynaktaki yeraltı su geometrisi yüzey dolgusu yapılmaz. Çevrimdışı çekirdek yüzey paketleriyle yaklaşık138MB; kişisel arşivlerin kapasitesi ayrıca gerekir.

Kaynak görüntülerinin katmanları ayrı ayrı açılır; çizgi kaynaklarıyla aynı kontrol değildir. Başlangıçta yalnız resmî IGC görüntü grubu açıktır. Kişisel paketlerdeki yaklaşık hizalanmış haritalar kaynak adı ve kalibrasyon sınırıyla ayrıca seçilir. Aynı görselin konum düzeltmesi, görüntü baytları değişmese de haritaya uygulanır. Konumlandırılmamış özgün sayfalar kütüphanede incelenir; dünya haritasına tahmini yerleştirilmez. Yerel birleşik LiDAR dosyası arşivden kuruluysa yeniden indirilmeden gerçek bayt SHA kontrolüyle kullanılır.

`python3 scripts/split-private-collection.py --help` büyük bir kişisel koleksiyonu küçük ZIP'lere ayırır. Girdi/çıktı baytları doğrulanır; tek başına hedef boyutu aşan dosya ayrı ve açıkça raporlanır. Bu araç kişisel içeriğe kamuya dağıtım hakkı vermez. Telefonda optimize modeller yeterlidir; özgün modeller ayrıca daha fazla depolama gerektirir.
