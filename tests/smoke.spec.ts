import { test, expect } from "@playwright/test";

const smokeRecipe = {
  id: "smoke-1",
  title: "Smoke Recipe",
  description: "A test dish for Playwright.",
  cookTime: "15 mins",
  difficulty: "easy" as const,
  ingredients: ["1 cup rice", "2 cups water"],
  instructions: ["Rinse rice.", "Simmer covered.", "Rest 5 minutes."],
};

function mockSuggestHtml() {
  const recipe = smokeRecipe;
  const b64 = Buffer.from(JSON.stringify(recipe), "utf8").toString("base64");
  const bookmarkAttrs = `class="recipe-card__bookmark" data-recipe="${b64}" data-recipe-id="${recipe.id}" onclick="event.stopPropagation(); window.handleBookmark(this)" aria-label="Toggle bookmark"`;
  return `<div class="recipe-grid">
    <div class="recipe-card" role="button" tabindex="0" data-recipe="${b64}"
      onclick="window.dispatchOpenRecipe(this)"
      onkeydown="if(event.key==='Enter') window.dispatchOpenRecipe(this)">
      <div class="recipe-card__header">
        <h3 class="recipe-card__title">${recipe.title}</h3>
        <button type="button" ${bookmarkAttrs}><span>☆</span></button>
      </div>
      <p class="recipe-card__desc">${recipe.description}</p>
      <div class="recipe-card__meta">
        <span class="recipe-card__time">⏱ ${recipe.cookTime}</span>
        <span class="badge badge--easy">${recipe.difficulty}</span>
      </div>
    </div>
  </div>`;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/suggest", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: mockSuggestHtml(),
    });
  });
});

test("suggest flow, modal, and cook mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#suggest-form button[type='submit']")).toHaveText(
    /Suggest Recipes/,
  );
  await page.getByPlaceholder(/chicken, garlic/i).fill("rice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await expect(page.locator(".tag")).toContainText("rice");
  const suggestResp = page.waitForResponse(
    (r) => r.url().includes("/api/suggest") && r.request().method() === "POST",
  );
  await page.evaluate(() => {
    (document.getElementById("suggest-form") as HTMLFormElement | null)?.requestSubmit();
  });
  await suggestResp;

  const recipeCard = page.locator(".recipe-card[data-recipe]").first();
  await expect(recipeCard).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => typeof (window as Window & { dispatchOpenRecipe?: unknown }).dispatchOpenRecipe ===
      "function",
  );
  await recipeCard.evaluate((el) => {
    (window as Window & { dispatchOpenRecipe: (n: Element) => void }).dispatchOpenRecipe(el);
  });

  await expect(page.locator(".modal__title")).toHaveText("Smoke Recipe");
  await expect(page.locator(".modal__ingredient").first()).toBeVisible();

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("button", { name: "Cook mode" }).click();

  await expect(
    page.getByRole("dialog", { name: /Cook mode: Smoke Recipe/i }),
  ).toBeVisible();
  await expect(page.locator(".cook-mode__step")).toContainText("Rinse rice");
});
