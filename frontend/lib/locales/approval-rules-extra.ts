// The approvals rules list (components/approvals/ApprovalRules.tsx): one plain sentence per rule
// (lib/approval-rules.ts), the full command on request, and the question before Remove.
// {command} is shown in monospace; {folder} is the folder's last part. Every key needs all 13
// locales: tsc checks each table against `en`. Registered in lib/i18n.ts.

const en = {
  "approvalRules.summary.exactFolder": "Always allow {command} in folder {folder}",
  "approvalRules.summary.exactEverywhere": "Always allow {command} in every folder",
  "approvalRules.summary.prefixFolder": "Always allow commands starting with {command} in folder {folder}",
  "approvalRules.summary.prefixEverywhere": "Always allow commands starting with {command} in every folder",
  "approvalRules.summary.hourCommand": "Allow {command} in this chat until {time}",
  "approvalRules.summary.hourTool": "Allow every {tool} call in this chat until {time}",
  "approvalRules.summary.threadCommand": "Always allow {command} in this chat",
  "approvalRules.summary.threadTool": "Always allow every {tool} call in this chat",
  "approvalRules.showCommand": "Show command",
  "approvalRules.folder": "Folder",
  "approvalRules.removeTitle": "Remove this rule?",
  "approvalRules.removeBody": "Commands it let through will ask for approval again.",
  "approvalRules.removeConfirm": "Remove rule",
};

type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "{command} im Ordner {folder} immer erlauben",
  "approvalRules.summary.exactEverywhere": "{command} in jedem Ordner immer erlauben",
  "approvalRules.summary.prefixFolder": "Befehle, die mit {command} beginnen, im Ordner {folder} immer erlauben",
  "approvalRules.summary.prefixEverywhere": "Befehle, die mit {command} beginnen, in jedem Ordner immer erlauben",
  "approvalRules.summary.hourCommand": "{command} in diesem Chat bis {time} erlauben",
  "approvalRules.summary.hourTool": "Jeden Aufruf von {tool} in diesem Chat bis {time} erlauben",
  "approvalRules.summary.threadCommand": "{command} in diesem Chat immer erlauben",
  "approvalRules.summary.threadTool": "Jeden Aufruf von {tool} in diesem Chat immer erlauben",
  "approvalRules.showCommand": "Befehl anzeigen",
  "approvalRules.folder": "Ordner",
  "approvalRules.removeTitle": "Diese Regel entfernen?",
  "approvalRules.removeBody": "Befehle, die sie durchgelassen hat, fragen wieder nach Freigabe.",
  "approvalRules.removeConfirm": "Regel entfernen",
};

const es: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "Permitir siempre {command} en la carpeta {folder}",
  "approvalRules.summary.exactEverywhere": "Permitir siempre {command} en todas las carpetas",
  "approvalRules.summary.prefixFolder": "Permitir siempre los comandos que empiezan por {command} en la carpeta {folder}",
  "approvalRules.summary.prefixEverywhere": "Permitir siempre los comandos que empiezan por {command} en todas las carpetas",
  "approvalRules.summary.hourCommand": "Permitir {command} en este chat hasta las {time}",
  "approvalRules.summary.hourTool": "Permitir cada llamada a {tool} en este chat hasta las {time}",
  "approvalRules.summary.threadCommand": "Permitir siempre {command} en este chat",
  "approvalRules.summary.threadTool": "Permitir siempre cada llamada a {tool} en este chat",
  "approvalRules.showCommand": "Mostrar comando",
  "approvalRules.folder": "Carpeta",
  "approvalRules.removeTitle": "¿Quitar esta regla?",
  "approvalRules.removeBody": "Los comandos que dejaba pasar volverán a pedir aprobación.",
  "approvalRules.removeConfirm": "Quitar regla",
};

const fr: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "Toujours autoriser {command} dans le dossier {folder}",
  "approvalRules.summary.exactEverywhere": "Toujours autoriser {command} dans tous les dossiers",
  "approvalRules.summary.prefixFolder": "Toujours autoriser les commandes qui commencent par {command} dans le dossier {folder}",
  "approvalRules.summary.prefixEverywhere": "Toujours autoriser les commandes qui commencent par {command} dans tous les dossiers",
  "approvalRules.summary.hourCommand": "Autoriser {command} dans ce chat jusqu’à {time}",
  "approvalRules.summary.hourTool": "Autoriser chaque appel à {tool} dans ce chat jusqu’à {time}",
  "approvalRules.summary.threadCommand": "Toujours autoriser {command} dans ce chat",
  "approvalRules.summary.threadTool": "Toujours autoriser chaque appel à {tool} dans ce chat",
  "approvalRules.showCommand": "Afficher la commande",
  "approvalRules.folder": "Dossier",
  "approvalRules.removeTitle": "Supprimer cette règle ?",
  "approvalRules.removeBody": "Les commandes qu’elle laissait passer demanderont de nouveau une approbation.",
  "approvalRules.removeConfirm": "Supprimer la règle",
};

const it: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "Consenti sempre {command} nella cartella {folder}",
  "approvalRules.summary.exactEverywhere": "Consenti sempre {command} in tutte le cartelle",
  "approvalRules.summary.prefixFolder": "Consenti sempre i comandi che iniziano con {command} nella cartella {folder}",
  "approvalRules.summary.prefixEverywhere": "Consenti sempre i comandi che iniziano con {command} in tutte le cartelle",
  "approvalRules.summary.hourCommand": "Consenti {command} in questa chat fino alle {time}",
  "approvalRules.summary.hourTool": "Consenti ogni chiamata a {tool} in questa chat fino alle {time}",
  "approvalRules.summary.threadCommand": "Consenti sempre {command} in questa chat",
  "approvalRules.summary.threadTool": "Consenti sempre ogni chiamata a {tool} in questa chat",
  "approvalRules.showCommand": "Mostra il comando",
  "approvalRules.folder": "Cartella",
  "approvalRules.removeTitle": "Rimuovere questa regola?",
  "approvalRules.removeBody": "I comandi che lasciava passare chiederanno di nuovo l’approvazione.",
  "approvalRules.removeConfirm": "Rimuovi regola",
};

const ja: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "フォルダー {folder} で {command} を常に許可",
  "approvalRules.summary.exactEverywhere": "すべてのフォルダーで {command} を常に許可",
  "approvalRules.summary.prefixFolder": "フォルダー {folder} で {command} で始まるコマンドを常に許可",
  "approvalRules.summary.prefixEverywhere": "すべてのフォルダーで {command} で始まるコマンドを常に許可",
  "approvalRules.summary.hourCommand": "このチャットで {time} まで {command} を許可",
  "approvalRules.summary.hourTool": "このチャットで {time} まで {tool} のすべての呼び出しを許可",
  "approvalRules.summary.threadCommand": "このチャットで {command} を常に許可",
  "approvalRules.summary.threadTool": "このチャットで {tool} のすべての呼び出しを常に許可",
  "approvalRules.showCommand": "コマンドを表示",
  "approvalRules.folder": "フォルダー",
  "approvalRules.removeTitle": "このルールを削除しますか？",
  "approvalRules.removeBody": "このルールで許可されていたコマンドは、再び承認を求めるようになります。",
  "approvalRules.removeConfirm": "ルールを削除",
};

const ko: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "{folder} 폴더에서 {command} 항상 허용",
  "approvalRules.summary.exactEverywhere": "모든 폴더에서 {command} 항상 허용",
  "approvalRules.summary.prefixFolder": "{folder} 폴더에서 {command}(으)로 시작하는 명령 항상 허용",
  "approvalRules.summary.prefixEverywhere": "모든 폴더에서 {command}(으)로 시작하는 명령 항상 허용",
  "approvalRules.summary.hourCommand": "이 채팅에서 {time}까지 {command} 허용",
  "approvalRules.summary.hourTool": "이 채팅에서 {time}까지 {tool}의 모든 호출 허용",
  "approvalRules.summary.threadCommand": "이 채팅에서 {command} 항상 허용",
  "approvalRules.summary.threadTool": "이 채팅에서 {tool}의 모든 호출 항상 허용",
  "approvalRules.showCommand": "명령 보기",
  "approvalRules.folder": "폴더",
  "approvalRules.removeTitle": "이 규칙을 삭제할까요?",
  "approvalRules.removeBody": "이 규칙으로 통과되던 명령은 다시 승인을 요청합니다.",
  "approvalRules.removeConfirm": "규칙 삭제",
};

const nl: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "{command} altijd toestaan in map {folder}",
  "approvalRules.summary.exactEverywhere": "{command} altijd toestaan in elke map",
  "approvalRules.summary.prefixFolder": "Opdrachten die beginnen met {command} altijd toestaan in map {folder}",
  "approvalRules.summary.prefixEverywhere": "Opdrachten die beginnen met {command} altijd toestaan in elke map",
  "approvalRules.summary.hourCommand": "{command} in deze chat toestaan tot {time}",
  "approvalRules.summary.hourTool": "Elke aanroep van {tool} in deze chat toestaan tot {time}",
  "approvalRules.summary.threadCommand": "{command} altijd toestaan in deze chat",
  "approvalRules.summary.threadTool": "Elke aanroep van {tool} altijd toestaan in deze chat",
  "approvalRules.showCommand": "Opdracht tonen",
  "approvalRules.folder": "Map",
  "approvalRules.removeTitle": "Deze regel verwijderen?",
  "approvalRules.removeBody": "Opdrachten die hij doorliet, vragen weer om goedkeuring.",
  "approvalRules.removeConfirm": "Regel verwijderen",
};

const pl: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "Zawsze zezwalaj na {command} w folderze {folder}",
  "approvalRules.summary.exactEverywhere": "Zawsze zezwalaj na {command} w każdym folderze",
  "approvalRules.summary.prefixFolder": "Zawsze zezwalaj na polecenia zaczynające się od {command} w folderze {folder}",
  "approvalRules.summary.prefixEverywhere": "Zawsze zezwalaj na polecenia zaczynające się od {command} w każdym folderze",
  "approvalRules.summary.hourCommand": "Zezwalaj na {command} w tym czacie do {time}",
  "approvalRules.summary.hourTool": "Zezwalaj na każde wywołanie {tool} w tym czacie do {time}",
  "approvalRules.summary.threadCommand": "Zawsze zezwalaj na {command} w tym czacie",
  "approvalRules.summary.threadTool": "Zawsze zezwalaj na każde wywołanie {tool} w tym czacie",
  "approvalRules.showCommand": "Pokaż polecenie",
  "approvalRules.folder": "Folder",
  "approvalRules.removeTitle": "Usunąć tę regułę?",
  "approvalRules.removeBody": "Polecenia, które przepuszczała, znowu będą prosić o zgodę.",
  "approvalRules.removeConfirm": "Usuń regułę",
};

const pt: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "Sempre permitir {command} na pasta {folder}",
  "approvalRules.summary.exactEverywhere": "Sempre permitir {command} em todas as pastas",
  "approvalRules.summary.prefixFolder": "Sempre permitir comandos que começam com {command} na pasta {folder}",
  "approvalRules.summary.prefixEverywhere": "Sempre permitir comandos que começam com {command} em todas as pastas",
  "approvalRules.summary.hourCommand": "Permitir {command} neste chat até {time}",
  "approvalRules.summary.hourTool": "Permitir cada chamada de {tool} neste chat até {time}",
  "approvalRules.summary.threadCommand": "Sempre permitir {command} neste chat",
  "approvalRules.summary.threadTool": "Sempre permitir cada chamada de {tool} neste chat",
  "approvalRules.showCommand": "Mostrar comando",
  "approvalRules.folder": "Pasta",
  "approvalRules.removeTitle": "Remover esta regra?",
  "approvalRules.removeBody": "Os comandos que ela deixava passar voltarão a pedir aprovação.",
  "approvalRules.removeConfirm": "Remover regra",
};

const ru: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "Всегда разрешать {command} в папке {folder}",
  "approvalRules.summary.exactEverywhere": "Всегда разрешать {command} в любой папке",
  "approvalRules.summary.prefixFolder": "Всегда разрешать команды, начинающиеся с {command}, в папке {folder}",
  "approvalRules.summary.prefixEverywhere": "Всегда разрешать команды, начинающиеся с {command}, в любой папке",
  "approvalRules.summary.hourCommand": "Разрешать {command} в этом чате до {time}",
  "approvalRules.summary.hourTool": "Разрешать каждый вызов {tool} в этом чате до {time}",
  "approvalRules.summary.threadCommand": "Всегда разрешать {command} в этом чате",
  "approvalRules.summary.threadTool": "Всегда разрешать каждый вызов {tool} в этом чате",
  "approvalRules.showCommand": "Показать команду",
  "approvalRules.folder": "Папка",
  "approvalRules.removeTitle": "Удалить это правило?",
  "approvalRules.removeBody": "Команды, которые оно пропускало, снова будут запрашивать одобрение.",
  "approvalRules.removeConfirm": "Удалить правило",
};

const tr: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "{folder} klasöründe {command} komutuna her zaman izin ver",
  "approvalRules.summary.exactEverywhere": "Her klasörde {command} komutuna her zaman izin ver",
  "approvalRules.summary.prefixFolder": "{folder} klasöründe {command} ile başlayan komutlara her zaman izin ver",
  "approvalRules.summary.prefixEverywhere": "Her klasörde {command} ile başlayan komutlara her zaman izin ver",
  "approvalRules.summary.hourCommand": "Bu sohbette {time} saatine kadar {command} komutuna izin ver",
  "approvalRules.summary.hourTool": "Bu sohbette {time} saatine kadar her {tool} çağrısına izin ver",
  "approvalRules.summary.threadCommand": "Bu sohbette {command} komutuna her zaman izin ver",
  "approvalRules.summary.threadTool": "Bu sohbette her {tool} çağrısına her zaman izin ver",
  "approvalRules.showCommand": "Komutu göster",
  "approvalRules.folder": "Klasör",
  "approvalRules.removeTitle": "Bu kural kaldırılsın mı?",
  "approvalRules.removeBody": "Bu kuralın geçirdiği komutlar yeniden onay isteyecek.",
  "approvalRules.removeConfirm": "Kuralı kaldır",
};

const zh: Record<Keys, string> = {
  "approvalRules.summary.exactFolder": "在文件夹 {folder} 中始终允许 {command}",
  "approvalRules.summary.exactEverywhere": "在所有文件夹中始终允许 {command}",
  "approvalRules.summary.prefixFolder": "在文件夹 {folder} 中始终允许以 {command} 开头的命令",
  "approvalRules.summary.prefixEverywhere": "在所有文件夹中始终允许以 {command} 开头的命令",
  "approvalRules.summary.hourCommand": "在此聊天中允许 {command}，直到 {time}",
  "approvalRules.summary.hourTool": "在此聊天中允许每次调用 {tool}，直到 {time}",
  "approvalRules.summary.threadCommand": "在此聊天中始终允许 {command}",
  "approvalRules.summary.threadTool": "在此聊天中始终允许每次调用 {tool}",
  "approvalRules.showCommand": "显示命令",
  "approvalRules.folder": "文件夹",
  "approvalRules.removeTitle": "要删除这条规则吗？",
  "approvalRules.removeBody": "它放行的命令将再次请求批准。",
  "approvalRules.removeConfirm": "删除规则",
};

export const approvalRulesMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
