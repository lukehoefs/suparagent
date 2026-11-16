// Copy for the /agents pages (UI redesign, phase 3): the shared app shell. Every key needs all 13
// locales: tsc checks each table against `en`. Registered in lib/i18n.ts (supplementalCatalogs).
const en = {
  "shell.loadFailed": "Agents could not be loaded. Check that the backend is running and that local execution is on.",
  "shell.actionFailed": "That did not work. Try again.",
  "shell.deleteAgentTitle": "Delete {name} permanently?",
  "shell.deleteAgentBody": "This removes the agent, its notes and skills, and its computer. Its conversations stay in history but become unlinked and continue without this agent's instructions. Its workspace folder stays; routines assigned to it are turned off. This cannot be undone.",
  "shell.deleteAgentConfirm": "Delete agent",
} as const;
type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "shell.loadFailed": "Agenten konnten nicht geladen werden. Prüfe, ob das Backend läuft und die lokale Ausführung an ist.",
  "shell.actionFailed": "Das hat nicht geklappt. Versuche es erneut.",
  "shell.deleteAgentTitle": "{name} endgültig löschen?",
  "shell.deleteAgentBody": "Das entfernt den Agenten, seine Notizen, Skills und seinen Computer. Seine Unterhaltungen bleiben im Verlauf, werden aber getrennt und laufen ohne seine Anweisungen weiter. Sein Arbeitsordner bleibt; ihm zugewiesene Routinen werden ausgeschaltet. Das lässt sich nicht rückgängig machen.",
  "shell.deleteAgentConfirm": "Agent löschen",
};
const es: Record<Keys, string> = {
  "shell.loadFailed": "No se pudieron cargar los agentes. Comprueba que el backend está en marcha y que la ejecución local está activada.",
  "shell.actionFailed": "No funcionó. Inténtalo de nuevo.",
  "shell.deleteAgentTitle": "¿Eliminar {name} para siempre?",
  "shell.deleteAgentBody": "Esto elimina el agente, sus notas, sus habilidades y su ordenador. Sus conversaciones se quedan en el historial, pero se desvinculan y siguen sin sus instrucciones. Su carpeta de trabajo se conserva; las rutinas asignadas se desactivan. No se puede deshacer.",
  "shell.deleteAgentConfirm": "Eliminar agente",
};
const fr: Record<Keys, string> = {
  "shell.loadFailed": "Impossible de charger les agents. Vérifiez que le backend tourne et que l’exécution locale est activée.",
  "shell.actionFailed": "Cela n’a pas fonctionné. Réessayez.",
  "shell.deleteAgentTitle": "Supprimer {name} définitivement ?",
  "shell.deleteAgentBody": "Cela supprime l’agent, ses notes, ses compétences et son ordinateur. Ses conversations restent dans l’historique mais sont détachées et continuent sans ses instructions. Son dossier de travail reste ; les routines qui lui sont attribuées sont désactivées. Action irréversible.",
  "shell.deleteAgentConfirm": "Supprimer l’agent",
};
const it: Record<Keys, string> = {
  "shell.loadFailed": "Impossibile caricare gli agenti. Controlla che il backend sia attivo e che l’esecuzione locale sia accesa.",
  "shell.actionFailed": "Non ha funzionato. Riprova.",
  "shell.deleteAgentTitle": "Eliminare {name} definitivamente?",
  "shell.deleteAgentBody": "Elimina l’agente, le sue note, le competenze e il suo computer. Le conversazioni restano nella cronologia ma vengono scollegate e continuano senza le sue istruzioni. La cartella di lavoro resta; le routine assegnate vengono disattivate. Non si può annullare.",
  "shell.deleteAgentConfirm": "Elimina agente",
};
const ja: Record<Keys, string> = {
  "shell.loadFailed": "エージェントを読み込めませんでした。バックエンドが動いていて、ローカル実行がオンになっているか確認してください。",
  "shell.actionFailed": "うまくいきませんでした。もう一度お試しください。",
  "shell.deleteAgentTitle": "{name} を完全に削除しますか？",
  "shell.deleteAgentBody": "エージェント、そのメモ、スキル、コンピューターが削除されます。会話は履歴に残りますが、リンクが外れ、このエージェントの指示なしで続きます。作業フォルダーは残り、割り当てられたルーティンはオフになります。元に戻せません。",
  "shell.deleteAgentConfirm": "エージェントを削除",
};
const ko: Record<Keys, string> = {
  "shell.loadFailed": "에이전트를 불러오지 못했습니다. 백엔드가 실행 중이고 로컬 실행이 켜져 있는지 확인하세요.",
  "shell.actionFailed": "실패했습니다. 다시 시도하세요.",
  "shell.deleteAgentTitle": "{name}을(를) 영구적으로 삭제할까요?",
  "shell.deleteAgentBody": "에이전트와 메모, 스킬, 컴퓨터가 삭제됩니다. 대화는 기록에 남지만 연결이 끊기고 이 에이전트의 지침 없이 이어집니다. 작업 폴더는 유지되고 배정된 루틴은 꺼집니다. 되돌릴 수 없습니다.",
  "shell.deleteAgentConfirm": "에이전트 삭제",
};
const nl: Record<Keys, string> = {
  "shell.loadFailed": "Agents konden niet worden geladen. Controleer of de backend draait en lokale uitvoering aan staat.",
  "shell.actionFailed": "Dat lukte niet. Probeer het opnieuw.",
  "shell.deleteAgentTitle": "{name} definitief verwijderen?",
  "shell.deleteAgentBody": "Dit verwijdert de agent, zijn notities, skills en computer. Gesprekken blijven in de geschiedenis, maar worden losgekoppeld en gaan verder zonder zijn instructies. De werkmap blijft; toegewezen routines worden uitgezet. Dit kan niet ongedaan worden gemaakt.",
  "shell.deleteAgentConfirm": "Agent verwijderen",
};
const pl: Record<Keys, string> = {
  "shell.loadFailed": "Nie udało się wczytać agentów. Sprawdź, czy backend działa i czy wykonywanie lokalne jest włączone.",
  "shell.actionFailed": "Nie udało się. Spróbuj ponownie.",
  "shell.deleteAgentTitle": "Usunąć {name} na stałe?",
  "shell.deleteAgentBody": "To usuwa agenta, jego notatki, umiejętności i komputer. Rozmowy zostają w historii, ale zostają odłączone i działają dalej bez jego instrukcji. Folder roboczy zostaje; przypisane rutyny zostają wyłączone. Tego nie da się cofnąć.",
  "shell.deleteAgentConfirm": "Usuń agenta",
};
const pt: Record<Keys, string> = {
  "shell.loadFailed": "Não foi possível carregar os agentes. Verifique se o backend está rodando e se a execução local está ativada.",
  "shell.actionFailed": "Não funcionou. Tente de novo.",
  "shell.deleteAgentTitle": "Excluir {name} permanentemente?",
  "shell.deleteAgentBody": "Isso remove o agente, suas notas, habilidades e o computador. As conversas ficam no histórico, mas são desvinculadas e continuam sem as instruções dele. A pasta de trabalho fica; as rotinas atribuídas são desligadas. Não pode ser desfeito.",
  "shell.deleteAgentConfirm": "Excluir agente",
};
const ru: Record<Keys, string> = {
  "shell.loadFailed": "Не удалось загрузить агентов. Проверьте, что бэкенд запущен и локальное выполнение включено.",
  "shell.actionFailed": "Не получилось. Попробуйте ещё раз.",
  "shell.deleteAgentTitle": "Удалить {name} навсегда?",
  "shell.deleteAgentBody": "Будут удалены агент, его заметки, навыки и компьютер. Разговоры останутся в истории, но будут отвязаны и продолжатся без его инструкций. Рабочая папка останется; назначенные ему рутины будут выключены. Это нельзя отменить.",
  "shell.deleteAgentConfirm": "Удалить агента",
};
const tr: Record<Keys, string> = {
  "shell.loadFailed": "Ajanlar yüklenemedi. Arka ucun çalıştığını ve yerel yürütmenin açık olduğunu kontrol edin.",
  "shell.actionFailed": "Olmadı. Tekrar deneyin.",
  "shell.deleteAgentTitle": "{name} kalıcı olarak silinsin mi?",
  "shell.deleteAgentBody": "Bu, ajanı, notlarını, becerilerini ve bilgisayarını kaldırır. Sohbetleri geçmişte kalır ancak bağlantıları kopar ve onun talimatları olmadan devam eder. Çalışma klasörü kalır; atanmış rutinler kapatılır. Geri alınamaz.",
  "shell.deleteAgentConfirm": "Ajanı sil",
};
const zh: Record<Keys, string> = {
  "shell.loadFailed": "无法加载智能体。请检查后端是否在运行、本地执行是否已开启。",
  "shell.actionFailed": "操作未成功，请重试。",
  "shell.deleteAgentTitle": "永久删除 {name}？",
  "shell.deleteAgentBody": "这会删除该智能体、它的笔记、技能和电脑。它的对话会保留在历史中，但会解除关联，并在没有它的指令的情况下继续。工作文件夹会保留；分配给它的例行任务会关闭。此操作无法撤销。",
  "shell.deleteAgentConfirm": "删除智能体",
};

export const agentsShellMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
