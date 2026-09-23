/** Заполненный пост для тестов точек входа: один на все, чтобы правка формы
 * поста не расходилась по копиям в каждом файле. */
import type { GeneratedPost } from "../../../contracts/index.ts";

export const SAMPLE_POST: GeneratedPost = {
  number: 1,
  date: "2026-03-16",
  time: "10:00",
  platform: "telegram",
  rubric: "Разбор ошибки",
  format: "Текстовый пост",
  title: "Почему хлеб черствеет",
  hook: "Вы убираете хлеб тёплым в пакет.",
  description: "Разбор ошибки хранения.",
  script: "",
  type: "Обучающий",
  cta: "Расскажите, как храните вы.",
  hashtags: ["#хлеб"],
  visual: "Буханка на решётке.",
  visualStyle: "craft-design",
  imagePrompt: "sourdough loaf on a wire rack, --ar 16:9",
  postContent: "Текст поста, готовый к публикации.",
};
