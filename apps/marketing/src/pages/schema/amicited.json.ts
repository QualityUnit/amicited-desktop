import type { APIRoute } from "astro";

import { PRODUCT_NAME, WEBSITE_URL } from "@amicited/identity";
import { buildT3ProjectFileJsonSchema } from "@t3tools/shared/t3ProjectFile";

// This route decides where the schema is served, so it also sets the schema's own URL and summary.
export const GET: APIRoute = () =>
  new Response(
    `${JSON.stringify(
      {
        ...buildT3ProjectFileJsonSchema(),
        $id: `${WEBSITE_URL}/schema/amicited.json`,
        title: `${PRODUCT_NAME} project file`,
        description: `Checked-in project configuration for ${PRODUCT_NAME} (amicited.json at the repository root). See ${WEBSITE_URL} for documentation.`,
      },
      null,
      2,
    )}\n`,
    { headers: { "Content-Type": "application/json" } },
  );
