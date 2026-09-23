/**
 * Границы слоёв как правило линтера.
 *
 * Зачем: требование заказчика «всё не должно вызываться от одной функции»
 * работает только если нарушить структуру физически трудно. Договорённость
 * «компонент не дёргает API напрямую» живёт три недели, ошибка линтера — всегда.
 *
 * Направление зависимостей строго вниз:
 * app → pages → widgets → features → entities → shared
 * Слой может импортировать только тот, что ниже него в этом списке.
 *
 * Важно про устройство файла: у каждого слоя ровно один блок настроек
 * правила no-restricted-imports. Разбивать запреты на несколько блоков нельзя —
 * последний совпавший блок заменяет настройки предыдущего целиком, и часть
 * запретов молча перестаёт работать. Такую дыру мы здесь уже поймали.
 */

const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];

/** Слои, которым запрещён любой фреймворк: только предметная логика. */
const FRAMEWORK_FREE_LAYERS = new Set(["entities"]);

/** Пути, по которым клиентский код мог бы дотянуться до серверного. */
const SERVER_PATTERNS = [
  "**/server/**",
  "../server/*",
  "../../server/*",
  "../../../server/*",
  "../../../../server/*",
];

const SERVER_MESSAGE =
  "Клиентский код не импортирует ничего из server/. Промпт и ключи живут только на сервере — именно так актив утёк в предыдущей версии.";

const FRAMEWORK_MESSAGE =
  "Предметная логика не знает про фреймворк. Это условие того, что переезд на другой стек останется переносом только интерфейса.";

const FRAMEWORK_PATHS = [
  { name: "react", message: FRAMEWORK_MESSAGE },
  { name: "react-dom", message: FRAMEWORK_MESSAGE },
  { name: "react-dom/client", message: FRAMEWORK_MESSAGE },
  { name: "react-router-dom", message: FRAMEWORK_MESSAGE },
];

const DEEP_RELATIVE_PATTERN = {
  group: ["../../*", "../../**"],
  message: "Импорт через два уровня вверх нечитаем. Используй псевдоним @/ — по нему сразу виден слой.",
};

function layerPatterns(layerName) {
  return [`@/${layerName}`, `@/${layerName}/*`, `@/${layerName}/**`];
}

function clientLayerConfig(layer, index) {
  const upperLayers = LAYERS.slice(0, index).map((forbidden) => ({
    group: layerPatterns(forbidden),
    message: `Слой «${layer}» не может импортировать «${forbidden}»: зависимости идут только вниз по цепочке ${LAYERS.join(" → ")}.`,
  }));

  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FRAMEWORK_FREE_LAYERS.has(layer) ? FRAMEWORK_PATHS : [],
          patterns: [
            ...upperLayers,
            { group: SERVER_PATTERNS, message: SERVER_MESSAGE },
            DEEP_RELATIVE_PATTERN,
          ],
        },
      ],
    },
  };
}

/**
 * Браузерные глобальные объекты. Серверу доступны библиотеки типов с fetch и
 * таймерами — без них не сделать вызов AI-провайдера, — но вместе с ними
 * приходят document и window. Раньше от них защищала конфигурация типов без
 * библиотеки DOM; теперь защищает этот список.
 */
const BROWSER_GLOBALS = [
  "document",
  "window",
  "localStorage",
  "sessionStorage",
  "navigator",
  "alert",
  "location",
  "history",
];

/**
 * Серверный слой: без фреймворка, без клиента и без браузера. Точки входа
 * Supabase живут в другой папке, но это тот же слой и те же запреты.
 */
const serverConfig = {
  files: ["server/**/*.ts", "supabase/functions/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: FRAMEWORK_PATHS,
        patterns: [
          {
            group: ["@/**", "**/src/**"],
            message: "Серверный слой не знает про интерфейс, который его вызывает.",
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      ...BROWSER_GLOBALS.map((name) => ({
        name,
        message: `${name} не существует на сервере: код выполняется в Deno, а не в браузере.`,
      })),
    ],
  },
};

/**
 * Общий словарь: его импортируют обе стороны, поэтому сам он не должен знать
 * ни про интерфейс, ни про сервер. Иначе через него протечёт любая зависимость.
 */
const contractsConfig = {
  files: ["contracts/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: FRAMEWORK_PATHS,
        patterns: [
          {
            group: ["@/**", "**/src/**", "**/server/**"],
            message:
              "contracts/ импортируют обе стороны, поэтому он не зависит ни от интерфейса, ни от сервера. Иначе зависимость протечёт через него.",
          },
        ],
      },
    ],
  },
};

export const layerBoundaries = [
  ...LAYERS.map(clientLayerConfig),
  serverConfig,
  contractsConfig,
];
