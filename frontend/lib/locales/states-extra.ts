// Copy for the shared empty, loading and error states (UI redesign, States screen): the retry on a
// failed panel and the offline notice. Every key needs all 13 locales: tsc checks each table
// against `en`. Registered in lib/i18n.ts (supplementalCatalogs).
const en = {
  "states.tryAgain": "Try again",
  "states.offline": "You are offline. Reconnect to send messages and answer approvals.",
} as const;
type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "states.tryAgain": "Erneut versuchen",
  "states.offline": "Du bist offline. Stelle die Verbindung wieder her, um Nachrichten zu senden und Genehmigungen zu beantworten.",
};
const es: Record<Keys, string> = {
  "states.tryAgain": "Reintentar",
  "states.offline": "Estás sin conexión. Vuelve a conectarte para enviar mensajes y responder a las aprobaciones.",
};
const fr: Record<Keys, string> = {
  "states.tryAgain": "Réessayer",
  "states.offline": "Vous êtes hors ligne. Reconnectez-vous pour envoyer des messages et répondre aux demandes d’autorisation.",
};
const it: Record<Keys, string> = {
  "states.tryAgain": "Riprova",
  "states.offline": "Sei offline. Riconnettiti per inviare messaggi e rispondere alle approvazioni.",
};
const ja: Record<Keys, string> = {
  "states.tryAgain": "再試行",
  "states.offline": "オフラインです。メッセージの送信や承認への回答には、再接続してください。",
};
const ko: Record<Keys, string> = {
  "states.tryAgain": "다시 시도",
  "states.offline": "오프라인 상태입니다. 메시지를 보내고 승인 요청에 답하려면 다시 연결하세요.",
};
const nl: Record<Keys, string> = {
  "states.tryAgain": "Opnieuw proberen",
  "states.offline": "Je bent offline. Maak opnieuw verbinding om berichten te sturen en goedkeuringen te beantwoorden.",
};
const pl: Record<Keys, string> = {
  "states.tryAgain": "Spróbuj ponownie",
  "states.offline": "Jesteś offline. Połącz się ponownie, aby wysyłać wiadomości i odpowiadać na prośby o zgodę.",
};
const pt: Record<Keys, string> = {
  "states.tryAgain": "Tentar de novo",
  "states.offline": "Você está offline. Reconecte-se para enviar mensagens e responder às aprovações.",
};
const ru: Record<Keys, string> = {
  "states.tryAgain": "Повторить",
  "states.offline": "Нет подключения к сети. Подключитесь снова, чтобы отправлять сообщения и отвечать на запросы одобрения.",
};
const tr: Record<Keys, string> = {
  "states.tryAgain": "Tekrar dene",
  "states.offline": "Çevrimdışısınız. Mesaj göndermek ve onay isteklerini yanıtlamak için yeniden bağlanın.",
};
const zh: Record<Keys, string> = {
  "states.tryAgain": "重试",
  "states.offline": "你已离线。请重新连接以发送消息和回复审批请求。",
};

export const statesMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
