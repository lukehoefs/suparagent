// Copy added by the layout polish: Today's empty cards and repeated activity, the empty Tasks and
// Results pages' next steps, the sidebar's group of agent-made pages and the Tasks view button.
// Every key needs all 13 locales: tsc checks each table against `en`. Registered in lib/i18n.ts.

const en = {
  "layoutPolish.today.runningTitle": "All quiet",
  "layoutPolish.today.routinesTitle": "No results yet",
  "layoutPolish.today.tasksTitle": "All caught up",
  "layoutPolish.today.repeated": "{count} times",
  "layoutPolish.tasks.showActive": "Show active tasks",
  "layoutPolish.results.openTasks": "Open Tasks",
  "layoutPolish.sidebar.pages": "Pages",
};

type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Alles ruhig",
  "layoutPolish.today.routinesTitle": "Noch keine Ergebnisse",
  "layoutPolish.today.tasksTitle": "Alles erledigt",
  "layoutPolish.today.repeated": "{count}-mal",
  "layoutPolish.tasks.showActive": "Aktive Aufgaben zeigen",
  "layoutPolish.results.openTasks": "Aufgaben öffnen",
  "layoutPolish.sidebar.pages": "Seiten",
};

const es: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Todo tranquilo",
  "layoutPolish.today.routinesTitle": "Aún no hay resultados",
  "layoutPolish.today.tasksTitle": "Todo al día",
  "layoutPolish.today.repeated": "{count} veces",
  "layoutPolish.tasks.showActive": "Mostrar tareas activas",
  "layoutPolish.results.openTasks": "Abrir Tareas",
  "layoutPolish.sidebar.pages": "Páginas",
};

const fr: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Tout est calme",
  "layoutPolish.today.routinesTitle": "Pas encore de résultats",
  "layoutPolish.today.tasksTitle": "Tout est à jour",
  "layoutPolish.today.repeated": "{count} fois",
  "layoutPolish.tasks.showActive": "Afficher les tâches actives",
  "layoutPolish.results.openTasks": "Ouvrir Tâches",
  "layoutPolish.sidebar.pages": "Pages",
};

const it: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Tutto tranquillo",
  "layoutPolish.today.routinesTitle": "Ancora nessun risultato",
  "layoutPolish.today.tasksTitle": "Tutto in pari",
  "layoutPolish.today.repeated": "{count} volte",
  "layoutPolish.tasks.showActive": "Mostra attività attive",
  "layoutPolish.results.openTasks": "Apri Attività",
  "layoutPolish.sidebar.pages": "Pagine",
};

const ja: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "静かです",
  "layoutPolish.today.routinesTitle": "まだ結果はありません",
  "layoutPolish.today.tasksTitle": "すべて完了",
  "layoutPolish.today.repeated": "{count} 回",
  "layoutPolish.tasks.showActive": "進行中のタスクを表示",
  "layoutPolish.results.openTasks": "タスクを開く",
  "layoutPolish.sidebar.pages": "ページ",
};

const ko: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "조용합니다",
  "layoutPolish.today.routinesTitle": "아직 결과가 없습니다",
  "layoutPolish.today.tasksTitle": "모두 처리했습니다",
  "layoutPolish.today.repeated": "{count}회",
  "layoutPolish.tasks.showActive": "진행 중인 작업 보기",
  "layoutPolish.results.openTasks": "작업 열기",
  "layoutPolish.sidebar.pages": "페이지",
};

const nl: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Alles rustig",
  "layoutPolish.today.routinesTitle": "Nog geen resultaten",
  "layoutPolish.today.tasksTitle": "Alles bij",
  "layoutPolish.today.repeated": "{count} keer",
  "layoutPolish.tasks.showActive": "Actieve taken tonen",
  "layoutPolish.results.openTasks": "Taken openen",
  "layoutPolish.sidebar.pages": "Pagina's",
};

const pl: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Spokój",
  "layoutPolish.today.routinesTitle": "Na razie brak wyników",
  "layoutPolish.today.tasksTitle": "Wszystko na bieżąco",
  "layoutPolish.today.repeated": "{count} razy",
  "layoutPolish.tasks.showActive": "Pokaż aktywne zadania",
  "layoutPolish.results.openTasks": "Otwórz Zadania",
  "layoutPolish.sidebar.pages": "Strony",
};

const pt: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Tudo tranquilo",
  "layoutPolish.today.routinesTitle": "Ainda sem resultados",
  "layoutPolish.today.tasksTitle": "Tudo em dia",
  "layoutPolish.today.repeated": "{count} vezes",
  "layoutPolish.tasks.showActive": "Mostrar tarefas ativas",
  "layoutPolish.results.openTasks": "Abrir Tarefas",
  "layoutPolish.sidebar.pages": "Páginas",
};

const ru: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Всё спокойно",
  "layoutPolish.today.routinesTitle": "Результатов пока нет",
  "layoutPolish.today.tasksTitle": "Всё сделано",
  "layoutPolish.today.repeated": "Повторов: {count}",
  "layoutPolish.tasks.showActive": "Показать активные задачи",
  "layoutPolish.results.openTasks": "Открыть задачи",
  "layoutPolish.sidebar.pages": "Страницы",
};

const tr: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "Her şey sakin",
  "layoutPolish.today.routinesTitle": "Henüz sonuç yok",
  "layoutPolish.today.tasksTitle": "Her şey tamam",
  "layoutPolish.today.repeated": "{count} kez",
  "layoutPolish.tasks.showActive": "Etkin görevleri göster",
  "layoutPolish.results.openTasks": "Görevleri aç",
  "layoutPolish.sidebar.pages": "Sayfalar",
};

const zh: Record<Keys, string> = {
  "layoutPolish.today.runningTitle": "一切安静",
  "layoutPolish.today.routinesTitle": "暂无结果",
  "layoutPolish.today.tasksTitle": "全部完成",
  "layoutPolish.today.repeated": "{count} 次",
  "layoutPolish.tasks.showActive": "显示进行中的任务",
  "layoutPolish.results.openTasks": "打开任务",
  "layoutPolish.sidebar.pages": "页面",
};

export const layoutPolishMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
