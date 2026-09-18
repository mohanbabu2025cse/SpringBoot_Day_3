# Food Studio

An editorial-style restaurant menu workspace for the root SpringJPA application: charcoal navigation, warm ivory surfaces, burnt-orange controls, original food photography, and responsive card/table layouts.

## Run

Requires Java 21 and MySQL. Connection settings are in `src/main/resources/application.properties`; you can override them with `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD`. The configured database is `jdbc_demo`.

```powershell
.\mvnw.cmd spring-boot:run
```

Open http://localhost:8080. `/food` and `/demo` serve the same interface. If an older application instance is already running, restart it from this project directory and refresh the browser with Ctrl+F5.

## Menu workflow

1. **Insert:** click **Add new dish**, enter its name, price, category, description, and availability, then click **Create dish**.
2. **List:** saved dishes load from the database automatically, including after a reload. Switch between cards and a table using the two view buttons.
3. **Update:** click **Edit** on a dish, change its details, and click **Save changes**. The availability switch also saves immediately.
4. **Delete:** click **Delete**, then confirm with **Yes, delete dish**. Cancel keeps the dish.

Search matches names and descriptions. Filter by category or availability, sort by name/price/newest, refresh the collection, or export the complete menu as CSV. Press `/` to focus search. Empty, loading, failed-request, and retry states are included.

Existing records without a category or description remain supported. Hibernate's configured `update` mode adds the new category and description columns to the existing food table.

## Verification

```powershell
.\mvnw.cmd test
```

Integration tests use an isolated H2 database and cover page rendering, static assets, persisted insert/update/delete, availability, categories, descriptions, and validation.

The browser suite requires Node.js and Playwright with Chromium installed. Start an isolated browser-test server in one terminal:

```powershell
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.useTestClasspath=true' '-Dspring-boot.run.arguments=--server.port=8082 --spring.datasource.url=jdbc:h2:mem:browser_menu --spring.datasource.driver-class-name=org.h2.Driver --spring.datasource.username=sa --spring.datasource.password= --spring.jpa.hibernate.ddl-auto=create-drop'
```

Then run `node tests/menu-browser.cjs`. If Playwright is installed elsewhere, set `PLAYWRIGHT_PACKAGE` to its package directory. The suite requires an empty test database, creates and cleans up its own records, exercises the real UI, and saves desktop/mobile screenshots under `target/ui-check/`.

To check an existing local menu, run `node tests/menu-live.cjs`. This verifies insert, update, delete, reload persistence, validation, filtering, sorting, availability, export, error recovery, and mobile layout. Updates and deletes target a temporary dish created by the test; existing dishes are checked for preservation. Results and screenshots are saved under `target/live-verification/`.

`node tests/menu-live.cjs --add-dishes` also adds ten sample dishes through the UI, skipping names already present. These sample dishes remain in the database. Prices must be at least ₹0.01 and use no more than two decimal places; the browser and API both enforce this.

## Files

- `src/main/resources/templates/Food.html`: page, dialogs, SVG icons
- `src/main/resources/static/css/food.css`: responsive visual design
- `src/main/resources/static/js/food.js`: API integration and interactions
- `src/main/resources/static/images/menu-hero.png`: original generated hero image
- `docs/hero-asset.md`: image provenance and generation prompt
- `tests/menu-browser.cjs`: browser acceptance checks

API: `GET /api/order/foods`, `POST /api/order/addFood`, and `PUT` / `DELETE /api/order/foods/{id}`. Food records contain `id`, `foodname`, `price`, `available`, `category`, and `description`.
