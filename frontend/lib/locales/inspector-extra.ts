// The right-hand panel's resize edge and icon strip (components/shell/Inspector.tsx).
// Every key needs all 13 locales: tsc checks each table against `en`. Registered in lib/i18n.ts.

const en = {
  "inspector.resize": "Resize panel",
  "inspector.resizeHint": "Drag to resize, drag far right or double-click for icons only",
  "inspector.collapse": "Shrink to icons",
  "inspector.expand": "Expand panel",
};

type Keys = keyof typeof en;

const de: Record<Keys, string> = {
  "inspector.resize": "Bereichsbreite ändern",
  "inspector.resizeHint": "Ziehen zum Anpassen, weit nach rechts ziehen oder Doppelklick für nur Symbole",
  "inspector.collapse": "Auf Symbole verkleinern",
  "inspector.expand": "Bereich ausklappen",
};

const es: Record<Keys, string> = {
  "inspector.resize": "Cambiar el ancho del panel",
  "inspector.resizeHint": "Arrastra para cambiar el ancho; arrastra a la derecha o doble clic para ver solo iconos",
  "inspector.collapse": "Reducir a iconos",
  "inspector.expand": "Expandir panel",
};

const fr: Record<Keys, string> = {
  "inspector.resize": "Redimensionner le panneau",
  "inspector.resizeHint": "Faites glisser pour redimensionner ; tout à droite ou double-clic pour les icônes seules",
  "inspector.collapse": "Réduire aux icônes",
  "inspector.expand": "Agrandir le panneau",
};

const it: Record<Keys, string> = {
  "inspector.resize": "Ridimensiona il pannello",
  "inspector.resizeHint": "Trascina per ridimensionare; tutto a destra o doppio clic per sole icone",
  "inspector.collapse": "Riduci a icone",
  "inspector.expand": "Espandi il pannello",
};

const ja: Record<Keys, string> = {
  "inspector.resize": "パネルの幅を変更",
  "inspector.resizeHint": "ドラッグで幅を変更、右端までドラッグかダブルクリックでアイコンのみ",
  "inspector.collapse": "アイコンに縮小",
  "inspector.expand": "パネルを広げる",
};

const ko: Record<Keys, string> = {
  "inspector.resize": "패널 크기 조절",
  "inspector.resizeHint": "끌어서 크기 조절, 오른쪽 끝까지 끌거나 두 번 클릭하면 아이콘만 표시",
  "inspector.collapse": "아이콘으로 줄이기",
  "inspector.expand": "패널 펼치기",
};

const nl: Record<Keys, string> = {
  "inspector.resize": "Paneelbreedte aanpassen",
  "inspector.resizeHint": "Sleep om te vergroten of verkleinen; helemaal naar rechts of dubbelklik voor alleen pictogrammen",
  "inspector.collapse": "Verkleinen tot pictogrammen",
  "inspector.expand": "Paneel uitklappen",
};

const pl: Record<Keys, string> = {
  "inspector.resize": "Zmień szerokość panelu",
  "inspector.resizeHint": "Przeciągnij, aby zmienić szerokość; maksymalnie w prawo lub dwuklik, by zostawić same ikony",
  "inspector.collapse": "Zwiń do ikon",
  "inspector.expand": "Rozwiń panel",
};

const pt: Record<Keys, string> = {
  "inspector.resize": "Redimensionar o painel",
  "inspector.resizeHint": "Arraste para redimensionar; arraste até a direita ou clique duas vezes para só ícones",
  "inspector.collapse": "Reduzir a ícones",
  "inspector.expand": "Expandir o painel",
};

const ru: Record<Keys, string> = {
  "inspector.resize": "Изменить ширину панели",
  "inspector.resizeHint": "Перетащите, чтобы изменить ширину; до упора вправо или двойной щелчок — только значки",
  "inspector.collapse": "Свернуть до значков",
  "inspector.expand": "Развернуть панель",
};

const tr: Record<Keys, string> = {
  "inspector.resize": "Paneli yeniden boyutlandır",
  "inspector.resizeHint": "Boyutlandırmak için sürükleyin; yalnızca simgeler için en sağa sürükleyin veya çift tıklayın",
  "inspector.collapse": "Simgelere küçült",
  "inspector.expand": "Paneli genişlet",
};

const zh: Record<Keys, string> = {
  "inspector.resize": "调整面板宽度",
  "inspector.resizeHint": "拖动调整宽度；拖到最右或双击只显示图标",
  "inspector.collapse": "缩小为图标",
  "inspector.expand": "展开面板",
};

export const inspectorMessages = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
