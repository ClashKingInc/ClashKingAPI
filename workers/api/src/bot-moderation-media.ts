import { Effect } from "effect";
import { AuthIdentity } from "./auth.js";
import { InvalidRequest } from "./errors.js";
import {
  readDashboardMultipart,
  uploadMediaFile,
  type MediaUploadBindings,
} from "./dashboard-upload.js";
export const dispatchBotModerationMedia = (
  request: Request,
  bindings: MediaUploadBindings,
) =>
  Effect.gen(function* () {
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/v2/bot/moderation/images"
    )
      return undefined;
    yield* (yield* AuthIdentity).requireBot(request);
    const form = yield* readDashboardMultipart(
        request,
        10 * 1024 * 1024 + 16384,
      ),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    )
      return yield* new InvalidRequest({
        message: "Choose an image no larger than 10 MB",
      });
    const extension = /\.(png|jpg|jpeg|gif|webp)$/iu
      .exec(file.name)?.[1]
      ?.toLowerCase();
    if (
      !extension ||
      !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
        file.type,
      )
    )
      return yield* new InvalidRequest({
        message: "Choose a PNG, JPEG, GIF or WebP image",
      });
    // Use the same durable media store as dashboard evidence, never a signed
    // Discord CDN URL that will expire after the moderation record is saved.
    const uploaded = yield* uploadMediaFile(
      bindings,
      `embed_${crypto.randomUUID()}.${extension}`,
      file,
      new URL(request.url).origin,
    );
    return Response.json(uploaded, {
      headers: { "Cache-Control": "no-store" },
    });
  });
