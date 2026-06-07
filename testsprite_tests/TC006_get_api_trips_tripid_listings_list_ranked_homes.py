import requests

BASE_URL = "http://localhost:3000"
SESSION_COOKIE = "gp_session=QA_6a5db49d2880acb64eec"
HEADERS_AUTH = {"Cookie": SESSION_COOKIE}
TIMEOUT = 30

def test_get_trip_listings_ranked_homes():
    # Test known existing trip with public access
    existing_trip_id = "la-birthday-2026"
    url = f"{BASE_URL}/api/trips/{existing_trip_id}/listings"
    try:
        resp = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"
    assert resp.status_code == 200, f"Expected 200 for existing trip, got {resp.status_code}"
    try:
        body = resp.json()
    except ValueError:
        assert False, "Response is not valid JSON"
    assert isinstance(body, dict), "Response body should be a dict"
    assert "listings" in body, "'listings' key missing in response"
    assert isinstance(body["listings"], list), "'listings' should be a list"
    assert len(body["listings"]) > 0, "'listings' should be a non-empty list"

    # Test non-existing trip with public access - omit cookie
    missing_trip_id = "nonexistent-trip-1234"
    url_missing = f"{BASE_URL}/api/trips/{missing_trip_id}/listings"
    try:
        resp_missing = requests.get(url_missing, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"
    assert resp_missing.status_code == 404, f"Expected 404 for missing trip, got {resp_missing.status_code}"

test_get_trip_listings_ranked_homes()