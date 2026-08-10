/**
 * Контракт ответа модели: и словами в промпте, и схемой для структурированного
 * вывода.
 *
 * Схема нужна отдельно от текста, потому что в предыдущей версии формат
 * задавался только описанием в промпте, а из настроек стоял лишь
 * responseMimeType: "application/json". Модель при этом свободно теряла поля
 * и путала регистр значений. Схема превращает договорённость в требование
 * на стороне провайдера.
 */
import { CONTENT_TYPES, PLATFORM_IDS, POST_FORMATS } from "@contracts";
import { VISUAL_STYLE_IDS } from "../blocks/visual";

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

const POST_PROPERTIES: Readonly<Record<string, SchemaNode>> = {
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

export const OUTPUT_CONTRACT_BLOCK = `ФОРМАТ ОТВЕТА. Верни только массив JSON, без пояснений до и после, без разметки Markdown и без блоков с тройными кавычками. Каждый элемент массива — один пост со всеми полями:

number — номер поста, строго из расписания
date — дата, строго из расписания, в формате ГГГГ-ММ-ДД
time — время публикации, формат ЧЧ:ММ, выбери разумное для площадки и аудитории
platform — идентификатор площадки, строго из расписания
rubric — название рубрики
format — формат публикации из списка форматов
title — заголовок-хук до 80 знаков, без Markdown
hook — первые одна-две строки, которые удерживают внимание
description — о чём пост, до 200 знаков; это служебное поле, не замена тексту
script — план слайдов для карусели или кадров для видео; для обычного поста коротко
type — тип контента
cta — призыв к действию до 120 знаков
hashtags — от трёх до пяти хештегов, каждый начинается с решётки
visual — описание кадра по-русски
visualStyle — идентификатор стиля из визуальной матрицы
imagePrompt — промпт для генератора картинок на английском
postContent — ГЛАВНОЕ ПОЛЕ: готовый к публикации текст поста

Требования к postContent: обычный текст без Markdown, без звёздочек и решёток для выделения. Абзацы разделяй двойным переводом строки. Эмодзи — умеренно, до трёх на пост, и только там, где они уместны.`;
