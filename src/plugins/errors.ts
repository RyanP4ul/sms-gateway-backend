import { Elysia } from "elysia";
import { env } from "@/lib/env";

/** Keeps the PHP error contract: every failure is `{ error: string, details?: string[] }`. */
export const errors = new Elysia({ name: "errors" }).onError(
  { as: "global" },
  ({ code, error, status }) => {
    switch (code) {
      case "VALIDATION": {
        const details = error.all.map(
          (e) =>
            `${e.path.replace(/^\//, "") || "body"}: ${e.summary ?? e.message}`,
        );
        return status(400, { error: "Validation error", details });
      }
      case "PARSE":
        return status(400, { error: "Invalid JSON format" });
      case "NOT_FOUND":
        return status(404, { error: "Invalid API request" });
      case "UNKNOWN":
      case "INTERNAL_SERVER_ERROR": {
        console.error("Unhandled error:", error);
        return status(500, {
          error: "Internal server error",
          ...(env.APP_DEBUG ? { debug: String(error) } : {}),
        });
      }
    }
  },
);
