package com.example.SpringJPA;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class SpringJpaApplicationTests {

	@LocalServerPort
	private int port;

	private final HttpClient client = HttpClient.newHttpClient();

	@Test
	void contextLoads() {
	}

	@Test
	void foodPagesRender() throws Exception {
		for (String path : new String[]{"/", "/food", "/demo"}) {
			HttpResponse<String> response = client.send(
					HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
					HttpResponse.BodyHandlers.ofString());
			assertEquals(200, response.statusCode(), path);
			assertTrue(response.body().contains("id=\"food-form\""), path);
		}
	}

	@Test
	void foodApiSavesAvailability() throws Exception {
		for (boolean available : new boolean[]{true, false}) {
			HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/order/addFood"))
					.header("Content-Type", "application/json")
					.POST(HttpRequest.BodyPublishers.ofString(
							"{\"foodname\":\"Test dish\",\"price\":125.50,\"available\":" + available + "}"))
					.build();
			HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
			assertEquals(200, response.statusCode());
			assertTrue(response.body().contains("\"foodname\":\"Test dish\""));
			assertTrue(response.body().contains("\"available\":" + available));
		}
	}

	@Test
	void menuSupportsPersistentCrudAndValidation() throws Exception {
		String base = "http://localhost:" + port;
		HttpResponse<String> created = send("POST", base + "/api/order/addFood",
				"{\"foodname\":\"Lifecycle dish\",\"price\":149.50,\"available\":true,\"category\":\"Starters\",\"description\":\"Fresh seasonal vegetables\"}");
		assertEquals(200, created.statusCode());
		assertTrue(created.body().contains("\"category\":\"Starters\""));
		assertTrue(created.body().contains("Fresh seasonal vegetables"));
		java.util.regex.Matcher idMatch = java.util.regex.Pattern.compile("\"id\"\\s*:\\s*(\\d+)").matcher(created.body());
		assertTrue(idMatch.find());
		String itemUrl = base + "/api/order/foods/" + idMatch.group(1);
		assertTrue(send("GET", base + "/api/order/foods", null).body().contains("Lifecycle dish"));
		HttpResponse<String> updated = send("PUT", itemUrl,
				"{\"foodname\":\"Updated lifecycle dish\",\"price\":199,\"available\":false,\"category\":\"Sides\",\"description\":\"Updated recipe\"}");
		assertEquals(200, updated.statusCode());
		assertTrue(updated.body().contains("\"available\":false"));
		assertTrue(updated.body().contains("\"category\":\"Sides\""));
		assertTrue(updated.body().contains("Updated recipe"));
		assertTrue(send("GET", base + "/api/order/foods", null).body().contains("Updated lifecycle dish"));
		assertEquals(204, send("DELETE", itemUrl, null).statusCode());
		assertEquals(404, send("DELETE", itemUrl, null).statusCode());
		assertTrue(!send("GET", base + "/api/order/foods", null).body().contains("Updated lifecycle dish"));
		for (String invalid : new String[]{"{\"foodname\":\"  \",\"price\":5}", "{\"foodname\":\"Invalid\",\"price\":-1}",
				"{\"foodname\":\"Invalid category\",\"price\":5,\"category\":\"Unknown\"}",
				"{\"foodname\":\"Long description\",\"price\":5,\"description\":\"" + "a".repeat(501) + "\"}"}) {
			assertEquals(400, send("POST", base + "/api/order/addFood", invalid).statusCode());
		}
		for (String asset : new String[]{"/css/food.css", "/js/food.js", "/images/menu-hero.png"}) {
			assertEquals(200, send("GET", base + asset, null).statusCode());
		}
	}

	@Test
	void pricePrecisionIsValidatedForInsertAndUpdate() throws Exception {
		String base = "http://localhost:" + port + "/api/order";
		HttpResponse<String> created = send("POST", base + "/addFood",
				"{\"foodname\":\"Price boundary dish\",\"price\":0.01}");
		assertEquals(200, created.statusCode());
		java.util.regex.Matcher match = java.util.regex.Pattern.compile("\"id\"\\s*:\\s*(\\d+)").matcher(created.body());
		assertTrue(match.find());
		String itemUrl = base + "/foods/" + match.group(1);
		try {
			for (String price : new String[]{"0", "0.001", "12.345", "1000000"}) {
				String invalid = "{\"foodname\":\"Invalid price\",\"price\":" + price + "}";
				assertEquals(400, send("POST", base + "/addFood", invalid).statusCode(), "Insert price " + price);
				assertEquals(400, send("PUT", itemUrl, invalid).statusCode(), "Update price " + price);
			}
			assertTrue(send("GET", base + "/foods", null).body().contains("Price boundary dish"));
			HttpResponse<String> updated = send("PUT", itemUrl,
					"{\"foodname\":\"Price boundary dish\",\"price\":999999.99}");
			assertEquals(200, updated.statusCode());
			assertTrue(updated.body().contains("999999.99"));
		} finally {
			assertEquals(204, send("DELETE", itemUrl, null).statusCode());
		}
	}

	private HttpResponse<String> send(String method, String url, String body) throws Exception {
		return client.send(HttpRequest.newBuilder(URI.create(url))
				.header("Content-Type", "application/json")
				.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body))
				.build(), HttpResponse.BodyHandlers.ofString());
	}

}
