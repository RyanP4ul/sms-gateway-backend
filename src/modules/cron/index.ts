import { cron } from "@elysia/cron";
import { Elysia } from "elysia";
import { env } from "@/lib/env";
import { Cron } from "./service";

/** Replaces the `* * * * * php cron.php` crontab entry. Runs in-process every minute. */
export const cronModule = env.CRON_ENABLED
  ? new Elysia({ name: "cron-module" }).use(
      cron({
        name: "maintenance",
        pattern: "* * * * *",
        run: () => Cron.runAll(),
      }),
    )
  : new Elysia({ name: "cron-module" });
