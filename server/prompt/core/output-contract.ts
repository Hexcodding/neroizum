/**
 * Контракт ответа модели: и словами в промпте, и схемой для структурированного
 * вывода.
 *
 * Схема нужна отдельно от текста, потому что в предыдущей версии формат
 * задавался только описанием в промпте, а из настроек стоял лишь
 * responseMimeType: "application/json". Модель при этом свободно теряла поля
 * и путала регистр значений. Схема превращает договорённость в требование
 * на стороне провайдера: Gemini вызывается с responseSchema, это не JSON.parse
 * сырого текста. Поэтому абзацы в postContent — обычные переносы строк,
 * а не экранированные символы «\n\n»: реальный перевод строки внутри JSON-
 * строки парсер не ломает.
 *
 * Служебное поле _zeroClickCheck есть только в схеме. В сохранённый пост
 * оно не попадает: это черновик самопроверки, чтобы модель ответила на три
 * вопроса до текста, а не «про себя». Контракт GeneratedPost из-за него
 * не меняется — карточка, экспорт и база не знают об этом поле.
 */
import { CONTENT_TYPES, PLATFORM_IDS, POST_FORMATS } from "../../../contracts/index.ts";
import { VISUAL_STYLE_IDS } from "../blocks/visual.ts";

type SchemaType = "STRING" | "INTEGER" | "ARRAY" | "OBJECT";

export interface SchemaNode {
  readonly type: SchemaType;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly items?: SchemaNode;
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly required?: readonly string[];
  readonly propertyOrdering?: readonly string[];
}

/**
 * Самопроверка Zero Click Value. Стоит первым в схеме, чтобы модель
 * заполнила её до текста поста. В GeneratedPost этого поля нет.
 */
const ZERO_CLICK_CHECK: SchemaNode = {
  type: "STRING",
  description:
    "Краткий ответ максимум 15 слов на три вопроса: есть ли польза без клика? раскрыты ли все пункты? готов ли текст в прод?",
};

const POST_PROPERTIES: Readonly<Record<string, SchemaNode>> = {
  _zeroClickCheck: ZERO_CLICK_CHECK,
  number: { type: "INTEGER", description: "Номер поста из расписания" },
  date: { type: "STRING", description: "Дата из расписания, формат ГГГГ-ММ-ДД" },
  time: { type: "STRING", description: "Время публикации, формат ЧЧ:ММ" },
  platform: { type: "STRING", enum: PLATFORM_IDS, description: "Площадка из расписания" },
  rubric: { type: "STRING", description: "Название рубрики" },
  format: { type: "STRING", enum: POST_FORMATS },
  title: { type: "STRING", description: "Заголовок-хук, до 80 знаков" },
  hook: { type: "STRING", description: "Первые строки поста" },
  description: { type: "STRING", description: "О чём пост, до 200 знаков" },
  script: { type: "STRING", description: "План слайдов или кадров" },
  type: { type: "STRING", enum: CONTENT_TYPES },
  cta: { type: "STRING", description: "Призыв к действию, до 120 знаков" },
  hashtags: { type: "ARRAY", items: { type: "STRING" }, description: "От 3 до 5 хештегов" },
  visual: { type: "STRING", description: "Описание кадра по-русски" },
  visualStyle: { type: "STRING", enum: VISUAL_STYLE_IDS },
  imagePrompt: { type: "STRING", description: "Промпт для картинки на английском" },
  postContent: { type: "STRING", description: "Готовый к публикации текст поста" },
};

const POST_FIELD_ORDER = Object.keys(POST_PROPERTIES);

/** Схема ответа для структурированного вывода провайдера. */
export const PLAN_RESPONSE_SCHEMA: SchemaNode = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: POST_PROPERTIES,
    required: POST_FIELD_ORDER,
    propertyOrdering: POST_FIELD_ORDER,
  },
};

export const OUTPUT_CONTRACT_BLOCK = `ФОРМАТ ОТВЕТА (СТРОГИЙ КОНТРАКТ):
Верни ответ ИСКЛЮЧИТЕЛЬНО в виде валидного массива JSON. Без приветствий, без пояснений, без оборачивания в markdown-блоки. Только сырой массив [{...}, {...}]. Количество объектов в массиве должно строго совпадать с количеством строк расписания.

Структура каждого объекта (поста):
_zeroClickCheck — краткий ответ (макс. 15 слов) на три вопроса перед текстом: есть ли польза без клика? раскрыты ли все пункты? готов ли текст в прод?
number — номер поста, строго из расписания
date — дата, строго из расписания, в формате ГГГГ-ММ-ДД
time — время публикации, формат ЧЧ:ММ, выбери разумное для площадки и аудитории
platform — идентификатор площадки строго из расписания: telegram, vk, max, tiktok, ok. Не отображаемое имя.
rubric — название рубрики
format — формат публикации из списка форматов
type — тип поста: Обучающий, Вовлекающий, Продающий, Экспертный
title — заголовок-хук до 80 знаков, без Markdown. Это то, что видит читатель в календаре, не внутреннее имя файла
hook — цепляющая первая фраза, одна-две строки
description — краткая суть для календаря, до 200 знаков; служебное поле, не замена тексту
script — сценарий с таймингом для видео и рилс; для карусели — раскладка по слайдам; для обычного поста коротко
cta — призыв к действию до 120 знаков
hashtags — массив из трёх-пяти строк, каждая начинается с решётки
visual — описание кадра по-русски
visualStyle — идентификатор стиля из визуальной матрицы
imagePrompt — промпт для генератора картинок СТРОГО НА АНГЛИЙСКОМ, через запятые
postContent — ГЛАВНОЕ ПОЛЕ. Готовый к публикации текст

ТРЕБОВАНИЯ К ТЕКСТУ В JSON:
- Текст передаётся в postContent. Абзацы разделяй двойным переводом строки. Экранировать переносы вручную не нужно: ответ идёт через схему, парсер от этого не ломается.
- Текст без Markdown разметки, без звёздочек и решёток для выделения.
- ЭМОДЗИ: от одного до трёх на пост — там, где они несут смысл: в хуке, перед пунктами списка, рядом с призывом. Не по одному в каждом абзаце и не гирляндой в конце. Совсем без эмодзи пост оставляй только тогда, когда этого требует голос бренда или стоп-слова.
- Надписи на картинке: правила типографики — в блоке визуальной матрицы. В visual пиши по-русски, какую фразу видно на кадре. В imagePrompt заключай эту фразу в кавычки.`;
