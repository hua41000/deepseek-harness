/** `cost` namespace dictionaries for the cost View. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'cost'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'view.cost': '花费',
  'summary.cost': '估算花费',
  'summary.savings': '缓存节省',
  'summary.models': '模型',
  'summary.models.separator': '、',
  'summary.note': '按 DeepSeek 官方价目或你配置的单价估算，可能与实际账单不同',
  'summary.excludesUnpriced': '不含 {count} 步未定价',
  'summary.allUnpriced': '这些步骤使用的模型都没有单价，可以在插件配置中添加。',
  'partial': '仅统计已加载的 {count} 轮。',
  'loadOlder': '加载更早',
  'loadOlder.loading': '正在加载更早的轮次…',
  'loadOlder.failed': '加载失败，重试',
  'empty': '当前窗口里还没有可以计价的步骤。',
  'column.turn': '轮次',
  'column.input': '输入',
  'column.output': '输出',
  'column.cost': '花费',
  'unpriced': '未定价',
} as const

/** The cost dictionary key union. */
export type CostKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Cost View copy. */
    cost: CostKey
  }
}

/** Namespace-bound translator threaded through the cost View. */
export type CostTranslate = import('@deepseek-ai/dsh-client-ui-slots').TranslateNS<typeof NS>

/** English dictionary, checked complete against the Chinese source of truth. */
export const en: Record<CostKey, string> = {
  'view.cost': 'Cost',
  'summary.cost': 'Estimated cost',
  'summary.savings': 'Cache savings',
  'summary.models': 'Models',
  'summary.models.separator': ', ',
  'summary.note': 'Estimated from DeepSeek list prices or your configured prices; may differ from your bill',
  'summary.excludesUnpriced': 'Excludes {count} unpriced steps',
  'summary.allUnpriced': 'None of these models has a price; add one in the plugin config.',
  'partial': 'Only the {count} loaded turns are counted.',
  'loadOlder': 'Load earlier',
  'loadOlder.loading': 'Loading earlier turns…',
  'loadOlder.failed': 'Load failed, retry',
  'empty': 'No priced step in the current window yet.',
  'column.turn': 'Turn',
  'column.input': 'Input',
  'column.output': 'Output',
  'column.cost': 'Cost',
  'unpriced': 'Unpriced',
}

/** Japanese dictionary. */
export const ja: Record<CostKey, string> = {
  'view.cost': 'コスト',
  'summary.cost': '推定コスト',
  'summary.savings': 'キャッシュ節約額',
  'summary.models': 'モデル',
  'summary.models.separator': '、',
  'summary.note': 'DeepSeek の公式価格または設定した単価による推定です。実際の請求額とは異なる場合があります',
  'summary.excludesUnpriced': '単価のない {count} ステップを含みません',
  'summary.allUnpriced': 'これらのモデルにはいずれも単価がありません。プラグイン設定で追加できます。',
  'partial': '読み込み済みの {count} ターンのみを集計しています。',
  'loadOlder': 'さらに前を読み込む',
  'loadOlder.loading': '以前のターンを読み込んでいます…',
  'loadOlder.failed': '読み込みに失敗しました。再試行',
  'empty': '現在のウィンドウには、まだ計算できるステップがありません。',
  'column.turn': 'ターン',
  'column.input': '入力',
  'column.output': '出力',
  'column.cost': 'コスト',
  'unpriced': '単価なし',
}

/** Spanish dictionary. */
export const es: Record<CostKey, string> = {
  'view.cost': 'Coste',
  'summary.cost': 'Coste estimado',
  'summary.savings': 'Ahorro de caché',
  'summary.models': 'Modelos',
  'summary.models.separator': ', ',
  'summary.note': 'Estimado con los precios oficiales de DeepSeek o los que configuraste; puede diferir de tu factura',
  'summary.excludesUnpriced': 'Excluye {count} pasos sin precio',
  'summary.allUnpriced': 'Ninguno de estos modelos tiene precio; añade uno en la configuración del plugin.',
  'partial': 'Solo se cuentan los {count} turnos cargados.',
  'loadOlder': 'Cargar anteriores',
  'loadOlder.loading': 'Cargando turnos anteriores…',
  'loadOlder.failed': 'Error al cargar, reintentar',
  'empty': 'Aún no hay pasos con precio en la ventana actual.',
  'column.turn': 'Turno',
  'column.input': 'Entrada',
  'column.output': 'Salida',
  'column.cost': 'Coste',
  'unpriced': 'Sin precio',
}

/** French dictionary. */
export const fr: Record<CostKey, string> = {
  'view.cost': 'Coût',
  'summary.cost': 'Coût estimé',
  'summary.savings': 'Économies de cache',
  'summary.models': 'Modèles',
  'summary.models.separator': ', ',
  'summary.note': 'Estimé à partir des tarifs officiels DeepSeek ou de vos prix configurés ; peut différer de votre facture',
  'summary.excludesUnpriced': 'Exclut {count} étapes sans prix',
  'summary.allUnpriced': 'Aucun de ces modèles n’a de prix ; ajoutez-en un dans la configuration du plugin.',
  'partial': 'Seuls les {count} tours chargés sont comptés.',
  'loadOlder': 'Charger les précédents',
  'loadOlder.loading': 'Chargement des tours précédents…',
  'loadOlder.failed': 'Échec du chargement, réessayer',
  'empty': 'Aucune étape tarifée dans la fenêtre actuelle pour l’instant.',
  'column.turn': 'Tour',
  'column.input': 'Entrée',
  'column.output': 'Sortie',
  'column.cost': 'Coût',
  'unpriced': 'Sans prix',
}

/** German dictionary. */
export const de: Record<CostKey, string> = {
  'view.cost': 'Kosten',
  'summary.cost': 'Geschätzte Kosten',
  'summary.savings': 'Cache-Ersparnis',
  'summary.models': 'Modelle',
  'summary.models.separator': ', ',
  'summary.note': 'Geschätzt nach den DeepSeek-Listenpreisen oder Ihren konfigurierten Preisen; kann von Ihrer Rechnung abweichen',
  'summary.excludesUnpriced': 'Ohne {count} Schritte ohne Preis',
  'summary.allUnpriced': 'Keines dieser Modelle hat einen Preis; fügen Sie einen in der Plugin-Konfiguration hinzu.',
  'partial': 'Nur die {count} geladenen Turns werden gezählt.',
  'loadOlder': 'Ältere laden',
  'loadOlder.loading': 'Ältere Turns werden geladen…',
  'loadOlder.failed': 'Laden fehlgeschlagen, erneut versuchen',
  'empty': 'Im aktuellen Fenster gibt es noch keinen Schritt mit Preis.',
  'column.turn': 'Turn',
  'column.input': 'Eingabe',
  'column.output': 'Ausgabe',
  'column.cost': 'Kosten',
  'unpriced': 'Ohne Preis',
}

/** Russian dictionary. */
export const ru: Record<CostKey, string> = {
  'view.cost': 'Стоимость',
  'summary.cost': 'Оценка стоимости',
  'summary.savings': 'Экономия на кэше',
  'summary.models': 'Модели',
  'summary.models.separator': ', ',
  'summary.note': 'Оценка по официальным ценам DeepSeek или заданным вами ценам; может отличаться от счёта',
  'summary.excludesUnpriced': 'Без учёта шагов без цены: {count}',
  'summary.allUnpriced': 'Ни у одной из этих моделей нет цены; добавьте её в настройках плагина.',
  'partial': 'Учтены только загруженные ходы: {count}.',
  'loadOlder': 'Загрузить ранние',
  'loadOlder.loading': 'Загрузка ранних ходов…',
  'loadOlder.failed': 'Ошибка загрузки, повторить',
  'empty': 'В текущем окне пока нет шагов с ценой.',
  'column.turn': 'Ход',
  'column.input': 'Ввод',
  'column.output': 'Вывод',
  'column.cost': 'Стоимость',
  'unpriced': 'Без цены',
}

/** Portuguese dictionary. */
export const pt: Record<CostKey, string> = {
  'view.cost': 'Custo',
  'summary.cost': 'Custo estimado',
  'summary.savings': 'Economia de cache',
  'summary.models': 'Modelos',
  'summary.models.separator': ', ',
  'summary.note': 'Estimado com os preços oficiais da DeepSeek ou os preços configurados por você; pode diferir da sua fatura',
  'summary.excludesUnpriced': 'Exclui {count} passos sem preço',
  'summary.allUnpriced': 'Nenhum destes modelos tem preço; adicione um na configuração do plugin.',
  'partial': 'Apenas os {count} turnos carregados são contados.',
  'loadOlder': 'Carregar anteriores',
  'loadOlder.loading': 'Carregando turnos anteriores…',
  'loadOlder.failed': 'Falha ao carregar, tentar novamente',
  'empty': 'Ainda não há passos com preço na janela atual.',
  'column.turn': 'Turno',
  'column.input': 'Entrada',
  'column.output': 'Saída',
  'column.cost': 'Custo',
  'unpriced': 'Sem preço',
}
