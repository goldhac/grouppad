import requests

BASE_URL = "http://localhost:3000"
TRIP_ID = "la-birthday-2026"
REFRESH_ENDPOINT = f"{BASE_URL}/api/trips/{TRIP_ID}/refresh"
HEADERS_AUTH = {
    "Cookie": "gp_session=QA_6a5db49d2880acb64eec"
}
TIMEOUT = 30


def test_post_api_trips_tripid_refresh_trigger_listing_search():
    # Test with organizer cookie: expect 200 or 429
    try:
        resp_auth = requests.post(REFRESH_ENDPOINT, headers=HEADERS_AUTH, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request with auth failed: {e}"

    assert resp_auth.status_code in (200, 429), (
        f"Expected status 200 or 429 with organizer auth, got {resp_auth.status_code}"
    )
    if resp_auth.status_code == 200:
        json_auth = resp_auth.json()
        assert isinstance(json_auth, dict), "Response body not a JSON object"
        assert json_auth.get("ok") is True, f"Expected {{'ok': true}}, got {json_auth}"
    elif resp_auth.status_code == 429:
        # Rate limited: No retry, so just confirm the status code
        pass

    # Test without cookie: expect 401 or 403
    try:
        resp_no_auth = requests.post(REFRESH_ENDPOINT, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request without auth failed: {e}"

    assert resp_no_auth.status_code in (401, 403), (
        f"Expected status 401 or 403 without auth, got {resp_no_auth.status_code}"
    )


test_post_api_trips_tripid_refresh_trigger_listing_search()