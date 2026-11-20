// Copy for the light browser in the agent settings Computer tab (components/computers/LightBrowserSection.tsx):
// a headless browser per agent inside this server, switched on per agent. Every key needs all 13 locales:
// tsc checks each table against `en`. Registered in lib/i18n.ts (supplementalCatalogs).

const en = {
  "lightBrowser.title": "Light browser",
  "lightBrowser.body": "A fast browser for {name} that runs on this server: it opens pages, reads them, clicks and types. Much lighter than a full desktop. Every action follows {name}'s approval mode.",
  "lightBrowser.switch": "Light browser for {name}",
  "lightBrowser.on": "On. {name} has the browser from its next message. Watch it below, or take control to sign in to a site.",
  "lightBrowser.off": "Off. Switch it on to give {name} the browser.",
  "lightBrowser.everyAgent": "Every agent on this server has the light browser.",
  "lightBrowser.private": "It cannot open this server's own address or private networks.",
  "lightBrowser.loadFailed": "The light browser setting could not be loaded.",
  "lightBrowser.saveFailed": "The switch could not be saved. Try again.",
};

type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "lightBrowser.title": "Leichter Browser",
  "lightBrowser.body": "Ein schneller Browser für {name}, der auf diesem Server läuft: Er öffnet Seiten, liest sie, klickt und tippt. Viel leichter als ein ganzer Desktop. Jede Aktion folgt dem Freigabemodus von {name}.",
  "lightBrowser.switch": "Leichter Browser für {name}",
  "lightBrowser.on": "An. {name} hat den Browser ab der nächsten Nachricht. Sieh unten zu oder übernimm die Steuerung, um dich bei einer Website anzumelden.",
  "lightBrowser.off": "Aus. Schalte ihn ein, um {name} den Browser zu geben.",
  "lightBrowser.everyAgent": "Jeder Agent auf diesem Server hat den leichten Browser.",
  "lightBrowser.private": "Er kann weder die eigene Adresse dieses Servers noch private Netzwerke öffnen.",
  "lightBrowser.loadFailed": "Die Einstellung des leichten Browsers konnte nicht geladen werden.",
  "lightBrowser.saveFailed": "Der Schalter konnte nicht gespeichert werden. Versuche es erneut.",
};

const es: Record<Keys, string> = {
  "lightBrowser.title": "Navegador ligero",
  "lightBrowser.body": "Un navegador rápido para {name} que funciona en este servidor: abre páginas, las lee, hace clic y escribe. Mucho más ligero que un escritorio completo. Cada acción sigue el modo de aprobación de {name}.",
  "lightBrowser.switch": "Navegador ligero para {name}",
  "lightBrowser.on": "Activado. {name} tiene el navegador desde su próximo mensaje. Míralo abajo o toma el control para iniciar sesión en un sitio.",
  "lightBrowser.off": "Desactivado. Actívalo para darle el navegador a {name}.",
  "lightBrowser.everyAgent": "Todos los agentes de este servidor tienen el navegador ligero.",
  "lightBrowser.private": "No puede abrir la dirección propia de este servidor ni redes privadas.",
  "lightBrowser.loadFailed": "No se pudo cargar el ajuste del navegador ligero.",
  "lightBrowser.saveFailed": "No se pudo guardar el interruptor. Inténtalo de nuevo.",
};

const fr: Record<Keys, string> = {
  "lightBrowser.title": "Navigateur léger",
  "lightBrowser.body": "Un navigateur rapide pour {name} qui tourne sur ce serveur : il ouvre des pages, les lit, clique et tape. Bien plus léger qu'un bureau complet. Chaque action suit le mode d'approbation de {name}.",
  "lightBrowser.switch": "Navigateur léger pour {name}",
  "lightBrowser.on": "Activé. {name} a le navigateur dès son prochain message. Regardez-le ci-dessous, ou prenez le contrôle pour vous connecter à un site.",
  "lightBrowser.off": "Désactivé. Activez-le pour donner le navigateur à {name}.",
  "lightBrowser.everyAgent": "Tous les agents de ce serveur ont le navigateur léger.",
  "lightBrowser.private": "Il ne peut ouvrir ni l'adresse de ce serveur ni les réseaux privés.",
  "lightBrowser.loadFailed": "Le réglage du navigateur léger n'a pas pu être chargé.",
  "lightBrowser.saveFailed": "L'interrupteur n'a pas pu être enregistré. Réessayez.",
};

const it: Record<Keys, string> = {
  "lightBrowser.title": "Browser leggero",
  "lightBrowser.body": "Un browser veloce per {name} che gira su questo server: apre pagine, le legge, fa clic e scrive. Molto più leggero di un desktop completo. Ogni azione segue la modalità di approvazione di {name}.",
  "lightBrowser.switch": "Browser leggero per {name}",
  "lightBrowser.on": "Attivo. {name} ha il browser dal prossimo messaggio. Guardalo qui sotto o prendi il controllo per accedere a un sito.",
  "lightBrowser.off": "Disattivato. Attivalo per dare il browser a {name}.",
  "lightBrowser.everyAgent": "Ogni agente su questo server ha il browser leggero.",
  "lightBrowser.private": "Non può aprire l'indirizzo di questo server né reti private.",
  "lightBrowser.loadFailed": "Non è stato possibile caricare l'impostazione del browser leggero.",
  "lightBrowser.saveFailed": "Non è stato possibile salvare l'interruttore. Riprova.",
};

const ja: Record<Keys, string> = {
  "lightBrowser.title": "軽量ブラウザ",
  "lightBrowser.body": "このサーバー上で動く {name} 用の高速ブラウザです。ページを開いて読み、クリックや入力ができます。フルデスクトップよりずっと軽量です。すべての操作は {name} の承認モードに従います。",
  "lightBrowser.switch": "{name} の軽量ブラウザ",
  "lightBrowser.on": "オン。{name} は次のメッセージからブラウザを使えます。下で様子を見るか、操作を引き継いでサイトにサインインしてください。",
  "lightBrowser.off": "オフ。オンにすると {name} がブラウザを使えるようになります。",
  "lightBrowser.everyAgent": "このサーバーのすべてのエージェントが軽量ブラウザを使えます。",
  "lightBrowser.private": "このサーバー自身のアドレスやプライベートネットワークは開けません。",
  "lightBrowser.loadFailed": "軽量ブラウザの設定を読み込めませんでした。",
  "lightBrowser.saveFailed": "スイッチを保存できませんでした。もう一度お試しください。",
};

const ko: Record<Keys, string> = {
  "lightBrowser.title": "가벼운 브라우저",
  "lightBrowser.body": "이 서버에서 실행되는 {name}의 빠른 브라우저입니다. 페이지를 열고 읽고, 클릭하고 입력합니다. 전체 데스크톱보다 훨씬 가볍습니다. 모든 작업은 {name}의 승인 모드를 따릅니다.",
  "lightBrowser.switch": "{name}의 가벼운 브라우저",
  "lightBrowser.on": "켜짐. {name}은(는) 다음 메시지부터 브라우저를 사용합니다. 아래에서 지켜보거나 제어권을 가져와 사이트에 로그인하세요.",
  "lightBrowser.off": "꺼짐. 켜면 {name}이(가) 브라우저를 사용할 수 있습니다.",
  "lightBrowser.everyAgent": "이 서버의 모든 에이전트가 가벼운 브라우저를 사용합니다.",
  "lightBrowser.private": "이 서버 자체의 주소나 사설 네트워크는 열 수 없습니다.",
  "lightBrowser.loadFailed": "가벼운 브라우저 설정을 불러오지 못했습니다.",
  "lightBrowser.saveFailed": "스위치를 저장하지 못했습니다. 다시 시도하세요.",
};

const nl: Record<Keys, string> = {
  "lightBrowser.title": "Lichte browser",
  "lightBrowser.body": "Een snelle browser voor {name} die op deze server draait: hij opent pagina's, leest ze, klikt en typt. Veel lichter dan een volledig bureaublad. Elke actie volgt de goedkeuringsmodus van {name}.",
  "lightBrowser.switch": "Lichte browser voor {name}",
  "lightBrowser.on": "Aan. {name} heeft de browser vanaf het volgende bericht. Kijk hieronder mee, of neem de besturing over om bij een site in te loggen.",
  "lightBrowser.off": "Uit. Zet hem aan om {name} de browser te geven.",
  "lightBrowser.everyAgent": "Elke agent op deze server heeft de lichte browser.",
  "lightBrowser.private": "Hij kan het eigen adres van deze server en privénetwerken niet openen.",
  "lightBrowser.loadFailed": "De instelling van de lichte browser kon niet worden geladen.",
  "lightBrowser.saveFailed": "De schakelaar kon niet worden opgeslagen. Probeer het opnieuw.",
};

const pl: Record<Keys, string> = {
  "lightBrowser.title": "Lekka przeglądarka",
  "lightBrowser.body": "Szybka przeglądarka dla {name}, działająca na tym serwerze: otwiera strony, czyta je, klika i pisze. Dużo lżejsza niż pełny pulpit. Każda czynność podlega trybowi zatwierdzania {name}.",
  "lightBrowser.switch": "Lekka przeglądarka dla {name}",
  "lightBrowser.on": "Włączona. {name} ma przeglądarkę od następnej wiadomości. Obserwuj ją poniżej albo przejmij sterowanie, aby zalogować się na stronie.",
  "lightBrowser.off": "Wyłączona. Włącz ją, aby dać {name} przeglądarkę.",
  "lightBrowser.everyAgent": "Każdy agent na tym serwerze ma lekką przeglądarkę.",
  "lightBrowser.private": "Nie może otworzyć własnego adresu tego serwera ani sieci prywatnych.",
  "lightBrowser.loadFailed": "Nie udało się wczytać ustawienia lekkiej przeglądarki.",
  "lightBrowser.saveFailed": "Nie udało się zapisać przełącznika. Spróbuj ponownie.",
};

const pt: Record<Keys, string> = {
  "lightBrowser.title": "Navegador leve",
  "lightBrowser.body": "Um navegador rápido para {name} que roda neste servidor: abre páginas, lê, clica e digita. Muito mais leve que uma área de trabalho completa. Cada ação segue o modo de aprovação de {name}.",
  "lightBrowser.switch": "Navegador leve para {name}",
  "lightBrowser.on": "Ligado. {name} tem o navegador a partir da próxima mensagem. Acompanhe abaixo ou assuma o controle para entrar em um site.",
  "lightBrowser.off": "Desligado. Ligue para dar o navegador a {name}.",
  "lightBrowser.everyAgent": "Todos os agentes deste servidor têm o navegador leve.",
  "lightBrowser.private": "Ele não abre o endereço do próprio servidor nem redes privadas.",
  "lightBrowser.loadFailed": "Não foi possível carregar a configuração do navegador leve.",
  "lightBrowser.saveFailed": "Não foi possível salvar o botão. Tente novamente.",
};

const ru: Record<Keys, string> = {
  "lightBrowser.title": "Лёгкий браузер",
  "lightBrowser.body": "Быстрый браузер для {name}, работающий на этом сервере: открывает страницы, читает их, нажимает и печатает. Намного легче полного рабочего стола. Каждое действие следует режиму одобрения {name}.",
  "lightBrowser.switch": "Лёгкий браузер для {name}",
  "lightBrowser.on": "Включён. {name} получает браузер со следующего сообщения. Следите за ним ниже или возьмите управление, чтобы войти на сайт.",
  "lightBrowser.off": "Выключен. Включите, чтобы дать {name} браузер.",
  "lightBrowser.everyAgent": "У каждого агента на этом сервере есть лёгкий браузер.",
  "lightBrowser.private": "Он не может открыть собственный адрес этого сервера и частные сети.",
  "lightBrowser.loadFailed": "Не удалось загрузить настройку лёгкого браузера.",
  "lightBrowser.saveFailed": "Не удалось сохранить переключатель. Попробуйте ещё раз.",
};

const tr: Record<Keys, string> = {
  "lightBrowser.title": "Hafif tarayıcı",
  "lightBrowser.body": "{name} için bu sunucuda çalışan hızlı bir tarayıcı: sayfaları açar, okur, tıklar ve yazar. Tam bir masaüstünden çok daha hafiftir. Her işlem {name} adlı ajanın onay modunu izler.",
  "lightBrowser.switch": "{name} için hafif tarayıcı",
  "lightBrowser.on": "Açık. {name} bir sonraki mesajdan itibaren tarayıcıyı kullanır. Aşağıdan izleyin veya bir siteye giriş yapmak için kontrolü alın.",
  "lightBrowser.off": "Kapalı. {name} adlı ajana tarayıcıyı vermek için açın.",
  "lightBrowser.everyAgent": "Bu sunucudaki her ajanın hafif tarayıcısı var.",
  "lightBrowser.private": "Bu sunucunun kendi adresini veya özel ağları açamaz.",
  "lightBrowser.loadFailed": "Hafif tarayıcı ayarı yüklenemedi.",
  "lightBrowser.saveFailed": "Anahtar kaydedilemedi. Tekrar deneyin.",
};

const zh: Record<Keys, string> = {
  "lightBrowser.title": "轻量浏览器",
  "lightBrowser.body": "在此服务器上运行的 {name} 专用快速浏览器：可以打开网页、阅读、点击和输入。比完整桌面轻得多。每个操作都遵循 {name} 的审批模式。",
  "lightBrowser.switch": "{name} 的轻量浏览器",
  "lightBrowser.on": "已开启。{name} 从下一条消息起即可使用浏览器。可在下方查看，或接管控制以登录网站。",
  "lightBrowser.off": "已关闭。开启后 {name} 即可使用浏览器。",
  "lightBrowser.everyAgent": "此服务器上的每个智能体都有轻量浏览器。",
  "lightBrowser.private": "它无法打开此服务器自身的地址或私有网络。",
  "lightBrowser.loadFailed": "无法加载轻量浏览器设置。",
  "lightBrowser.saveFailed": "无法保存开关。请重试。",
};

export const lightBrowserMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
