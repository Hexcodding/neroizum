/**
 * Поддельный генератор картинок. Запоминает, с каким промптом и какими
 * пропорциями его позвали: именно это и проверяется — что в кадр уходит промпт
 * из поста, а не мидджорнейский флаг вместе с ним.
 */
import type { GenerationError } from "../errors.ts";
import type { ImageProvider, ImageRequest, ImageResult } from "../provider/types.ts";

export interface FakeImageProvider extends ImageProvider {
  readonly calls: ImageRequest[];
}

export function createFakeImageProvider(failWith?: GenerationError): FakeImageProvider {
  const calls: ImageRequest[] = [];

  return {
    model: "fake-image",
    calls,
    create(request: ImageRequest): Promise<ImageResult> {
      calls.push(request);
      if (failWith !== undefined) return Promise.reject(failWith);
      return Promise.resolve({
        bytes: new Uint8Array([137, 80, 78, 71]),
        mimeType: "image/png",
        model: "fake-image",
      });
    },
  };
}
