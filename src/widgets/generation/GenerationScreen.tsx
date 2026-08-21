/**
 * Экран работы генерации: прогресс, посты по мере готовности, остановка.
 *
 * Вынесен из страницы отдельно, потому что это самостоятельное состояние с
 * четырьмя исходами: идёт, готово, остановлено, сломалось. Смешанный с формой,
 * он превращался в один длинный компонент с десятком условий.
 */
import type { GeneratedPost } from "@contracts";
import { Button } from "@/shared/ui/Button";
import { Notice, PostSkeleton, Progress } from "@/shared/ui/Feedback";
import { PlanView } from "@/widgets/plan-view/PlanView";
import type { ApiError } from "@/shared/api/errors";
import type { GenerationLabels } from "./labels";

export interface GenerationScreenProps {
  readonly title: string;
  readonly running: boolean;
  readonly posts: readonly GeneratedPost[];
  readonly ready: number;
  readonly total: number;
  readonly warnings: readonly string[];
  readonly error: ApiError | null;
  /** Подписи задаются вызывающим: новый план и продолжение звучат по-разному. */
  readonly labels: GenerationLabels;
  readonly onStop: () => void;
  readonly onRetry: () => void;
  readonly onOpenPlan: (() => void) | null;
  readonly onBackToForm: () => void;
}

export function GenerationScreen(props: GenerationScreenProps) {
  const { running, posts, error } = props;
  const finished = !running && posts.length > 0;
  const nothingHappened = !running && posts.length === 0 && error === null;

  return (
    <div className="flex flex-col gap-5">
      <Head {...props} finished={finished} />

      {running && (
        <Progress
          done={props.ready}
          total={props.total === 0 ? 1 : props.total}
          label="Постов готово"
        />
      )}

      {error !== null && (
        <Failure error={error} savedPosts={posts.length} onRetry={props.onRetry} />
      )}

      {props.warnings.length > 0 && <Warnings warnings={props.warnings} />}

      {posts.length > 0 && <PlanView title={props.title} posts={posts} />}
      {running && posts.length === 0 && <Waiting />}

      {nothingHappened && (
        <Button variant="ghost" onClick={props.onBackToForm}>
          {props.labels.back}
        </Button>
      )}
    </div>
  );
}

function Head({
  running,
  finished,
  onStop,
  onOpenPlan,
  labels,
}: GenerationScreenProps & { readonly finished: boolean }) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold tracking-tight">
        {finished ? labels.finished : labels.running}
      </h1>

      {running && (
        <Button variant="outline" size="sm" className="ml-auto" onClick={onStop}>
          Остановить
        </Button>
      )}
      {finished && onOpenPlan !== null && (
        <Button size="sm" className="ml-auto" onClick={onOpenPlan}>
          {labels.openPlan}
        </Button>
      )}
    </header>
  );
}

function Failure({
  error,
  savedPosts,
  onRetry,
}: {
  readonly error: ApiError;
  readonly savedPosts: number;
  readonly onRetry: () => void;
}) {
  return (
    <Notice
      tone="error"
      title="Генерация прервалась"
      onRetry={error.retryable ? onRetry : undefined}
    >
      {error.message}
      {savedPosts > 0 && (
        <p className="mt-2">
          Посты, которые успели получиться, остались ниже — попытка не потрачена.
        </p>
      )}
    </Notice>
  );
}

function Warnings({ warnings }: { warnings: readonly string[] }) {
  return (
    <Notice tone="info" title="На что стоит взглянуть">
      <ul className="list-disc pl-4">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </Notice>
  );
}

function Waiting() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-muted">
        Первые посты появятся через несколько секунд. Страницу можно не закрывать — а если закроете,
        генерация остановится и попытка не потратится.
      </p>
      <PostSkeleton />
      <PostSkeleton />
    </div>
  );
}
