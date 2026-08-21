/**
 * Два платных действия над открытым постом: переделать текст через модель и
 * нарисовать картинку. Стоят рядом, потому что рядом же показывают свои
 * остатки — а остатки у них разные, и путать их нельзя.
 *
 * Отдельным файлом, чтобы редактор оставался формой: поля отдельно, обращения
 * к модели отдельно.
 */
import type { GeneratedPost } from "@contracts";
import { ImprovePost, type ImproveOffer } from "./ImprovePost";
import { PostImage, type ImageOffer } from "./PostImage";

export interface PostToolsProps {
  readonly draft: GeneratedPost;
  readonly saving: boolean;
  readonly improve?: ImproveOffer;
  readonly image?: ImageOffer;
  readonly onApply: (post: GeneratedPost) => void;
}

export function PostTools({ draft, saving, improve, image, onApply }: PostToolsProps) {
  return (
    <>
      {improve !== undefined && (
        <ImprovePost offer={improve} draft={draft} disabled={saving} onApply={onApply} />
      )}
      {image !== undefined && <PostImage offer={image} visual={draft.visual} disabled={saving} />}
    </>
  );
}
