// Plain words for states that read as broken or confusing: Teams switched off on the Agents page
// (components/agents/roster/TeamSection.tsx), a live computer view that cannot be shown
// (components/computers/RemoteScreen.tsx), and a custom server that duplicates a connected app
// (components/apps/). Every key needs all 13 locales: tsc checks each table against `en`.
// Registered in lib/i18n.ts.

const en = {
  "polishStates.teamsOff": "Teams are switched off on this server, so there is no team to show. Each agent still works on its own.",
  "polishStates.live.failed": "Can't show this computer's screen right now.",
  "polishStates.live.lost": "Lost the connection to this computer's screen.",
  "polishStates.live.hint": "Check that the computer is turned on, and that its address and access key are right in Apps.",
  "polishStates.apps.alsoApp": "Also connected as the {name} app",
  "polishStates.apps.alsoServer": "Also added as server {name}",
};

type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "polishStates.teamsOff": "Teams sind auf diesem Server ausgeschaltet, daher gibt es kein Team anzuzeigen. Jeder Agent arbeitet weiterhin für sich.",
  "polishStates.live.failed": "Der Bildschirm dieses Computers kann gerade nicht angezeigt werden.",
  "polishStates.live.lost": "Die Verbindung zum Bildschirm dieses Computers ist abgebrochen.",
  "polishStates.live.hint": "Prüfe, ob der Computer eingeschaltet ist und ob seine Adresse und sein Zugangsschlüssel unter Apps stimmen.",
  "polishStates.apps.alsoApp": "Auch als App {name} verbunden",
  "polishStates.apps.alsoServer": "Auch als Server {name} hinzugefügt",
};

const es: Record<Keys, string> = {
  "polishStates.teamsOff": "Los equipos están desactivados en este servidor, así que no hay ningún equipo que mostrar. Cada agente sigue trabajando por su cuenta.",
  "polishStates.live.failed": "Ahora mismo no se puede mostrar la pantalla de este ordenador.",
  "polishStates.live.lost": "Se perdió la conexión con la pantalla de este ordenador.",
  "polishStates.live.hint": "Comprueba que el ordenador esté encendido y que su dirección y su clave de acceso sean correctas en Aplicaciones.",
  "polishStates.apps.alsoApp": "También conectado como la app {name}",
  "polishStates.apps.alsoServer": "También añadido como servidor {name}",
};

const fr: Record<Keys, string> = {
  "polishStates.teamsOff": "Les équipes sont désactivées sur ce serveur : il n’y a donc aucune équipe à afficher. Chaque agent continue de travailler seul.",
  "polishStates.live.failed": "Impossible d’afficher l’écran de cet ordinateur pour le moment.",
  "polishStates.live.lost": "La connexion à l’écran de cet ordinateur a été perdue.",
  "polishStates.live.hint": "Vérifiez que l’ordinateur est allumé, et que son adresse et sa clé d’accès sont correctes dans Applications.",
  "polishStates.apps.alsoApp": "Aussi connecté comme l’app {name}",
  "polishStates.apps.alsoServer": "Aussi ajouté comme serveur {name}",
};

const it: Record<Keys, string> = {
  "polishStates.teamsOff": "I team sono disattivati su questo server, quindi non c’è nessun team da mostrare. Ogni agente continua a lavorare da solo.",
  "polishStates.live.failed": "Al momento non è possibile mostrare lo schermo di questo computer.",
  "polishStates.live.lost": "La connessione allo schermo di questo computer si è interrotta.",
  "polishStates.live.hint": "Controlla che il computer sia acceso e che il suo indirizzo e la sua chiave di accesso siano corretti in App.",
  "polishStates.apps.alsoApp": "Collegato anche come app {name}",
  "polishStates.apps.alsoServer": "Aggiunto anche come server {name}",
};

const ja: Record<Keys, string> = {
  "polishStates.teamsOff": "このサーバーではチームがオフになっているため、表示するチームはありません。各エージェントはそれぞれ単独で動作します。",
  "polishStates.live.failed": "現在、このコンピューターの画面を表示できません。",
  "polishStates.live.lost": "このコンピューターの画面との接続が切れました。",
  "polishStates.live.hint": "コンピューターの電源が入っているか、アプリでアドレスとアクセスキーが正しいかを確認してください。",
  "polishStates.apps.alsoApp": "アプリ「{name}」としても接続済み",
  "polishStates.apps.alsoServer": "サーバー「{name}」としても追加済み",
};

const ko: Record<Keys, string> = {
  "polishStates.teamsOff": "이 서버에서는 팀이 꺼져 있어 표시할 팀이 없습니다. 각 에이전트는 계속 혼자 작업합니다.",
  "polishStates.live.failed": "지금은 이 컴퓨터의 화면을 표시할 수 없습니다.",
  "polishStates.live.lost": "이 컴퓨터 화면과의 연결이 끊어졌습니다.",
  "polishStates.live.hint": "컴퓨터가 켜져 있는지, 그리고 앱에서 주소와 액세스 키가 올바른지 확인하세요.",
  "polishStates.apps.alsoApp": "{name} 앱으로도 연결됨",
  "polishStates.apps.alsoServer": "{name} 서버로도 추가됨",
};

const nl: Record<Keys, string> = {
  "polishStates.teamsOff": "Teams staan uit op deze server, dus er is geen team om te tonen. Elke agent werkt gewoon zelfstandig.",
  "polishStates.live.failed": "Het scherm van deze computer kan nu niet worden getoond.",
  "polishStates.live.lost": "De verbinding met het scherm van deze computer is verbroken.",
  "polishStates.live.hint": "Controleer of de computer aanstaat en of het adres en de toegangssleutel in Apps kloppen.",
  "polishStates.apps.alsoApp": "Ook verbonden als de app {name}",
  "polishStates.apps.alsoServer": "Ook toegevoegd als server {name}",
};

const pl: Record<Keys, string> = {
  "polishStates.teamsOff": "Zespoły są wyłączone na tym serwerze, więc nie ma zespołu do pokazania. Każdy agent nadal pracuje samodzielnie.",
  "polishStates.live.failed": "Nie można teraz pokazać ekranu tego komputera.",
  "polishStates.live.lost": "Utracono połączenie z ekranem tego komputera.",
  "polishStates.live.hint": "Sprawdź, czy komputer jest włączony oraz czy jego adres i klucz dostępu w Aplikacjach są poprawne.",
  "polishStates.apps.alsoApp": "Połączone także jako aplikacja {name}",
  "polishStates.apps.alsoServer": "Dodane także jako serwer {name}",
};

const pt: Record<Keys, string> = {
  "polishStates.teamsOff": "As equipes estão desativadas neste servidor, então não há equipe para mostrar. Cada agente continua trabalhando sozinho.",
  "polishStates.live.failed": "Não é possível mostrar a tela deste computador agora.",
  "polishStates.live.lost": "A conexão com a tela deste computador caiu.",
  "polishStates.live.hint": "Verifique se o computador está ligado e se o endereço e a chave de acesso dele estão corretos em Aplicativos.",
  "polishStates.apps.alsoApp": "Também conectado como o app {name}",
  "polishStates.apps.alsoServer": "Também adicionado como servidor {name}",
};

const ru: Record<Keys, string> = {
  "polishStates.teamsOff": "Команды на этом сервере выключены, поэтому показывать нечего. Каждый агент по-прежнему работает сам по себе.",
  "polishStates.live.failed": "Сейчас не удаётся показать экран этого компьютера.",
  "polishStates.live.lost": "Соединение с экраном этого компьютера потеряно.",
  "polishStates.live.hint": "Проверьте, что компьютер включён, а его адрес и ключ доступа в разделе «Приложения» указаны верно.",
  "polishStates.apps.alsoApp": "Также подключено как приложение {name}",
  "polishStates.apps.alsoServer": "Также добавлено как сервер {name}",
};

const tr: Record<Keys, string> = {
  "polishStates.teamsOff": "Bu sunucuda ekipler kapalı, bu yüzden gösterilecek bir ekip yok. Her ajan kendi başına çalışmaya devam eder.",
  "polishStates.live.failed": "Bu bilgisayarın ekranı şu anda gösterilemiyor.",
  "polishStates.live.lost": "Bu bilgisayarın ekranıyla bağlantı kesildi.",
  "polishStates.live.hint": "Bilgisayarın açık olduğunu ve Uygulamalar'daki adresinin ve erişim anahtarının doğru olduğunu kontrol edin.",
  "polishStates.apps.alsoApp": "{name} uygulaması olarak da bağlı",
  "polishStates.apps.alsoServer": "{name} sunucusu olarak da eklendi",
};

const zh: Record<Keys, string> = {
  "polishStates.teamsOff": "此服务器已关闭团队功能，因此没有可显示的团队。每个智能体仍会各自工作。",
  "polishStates.live.failed": "目前无法显示这台电脑的屏幕。",
  "polishStates.live.lost": "与这台电脑屏幕的连接已断开。",
  "polishStates.live.hint": "请检查电脑是否已开机，以及在“应用”中它的地址和访问密钥是否正确。",
  "polishStates.apps.alsoApp": "也已作为应用 {name} 连接",
  "polishStates.apps.alsoServer": "也已作为服务器 {name} 添加",
};

export const polishStatesMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
