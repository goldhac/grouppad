import requests

BASE_URL = "http://localhost:3000"
TRIP_ID = "la-birthday-2026"
HEADERS_AUTH = {
    "Cookie": "gp_session=QA_6a5db49d2880acb64eec",
    "Content-Type": "application/json"
}
HEADERS_NO_AUTH = {
    "Content-Type": "application/json"
}
TIMEOUT = 30


def test_post_api_trips_tripid_caveats_submit_criterion():
    url = f"{BASE_URL}/api/trips/{TRIP_ID}/caveats"
    payload = {"text": "QA criterion"}

    # Authenticated case - expect 200 and response is a JSON list
    try:
        resp_auth = requests.post(url, json=payload, headers=HEADERS_AUTH, timeout=TIMEOUT)
        assert resp_auth.status_code == 200, f"Expected 200 with auth, got {resp_auth.status_code}"
        body = resp_auth.json()
        assert isinstance(body, list), f"Expected response body to be a list, got {type(body)}"
    except Exception as e:
        raise AssertionError(f"Authenticated request failed: {e}")

    # Not authenticated case - omit cookie, expect 401
    try:
        resp_no_auth = requests.post(url, json=payload, headers=HEADERS_NO_AUTH, timeout=TIMEOUT)
        assert resp_no_auth.status_code == 401, f"Expected 401 without auth, got {resp_no_auth.status_code}"
    except Exception as e:
        raise AssertionError(f"Unauthenticated request failed: {e}")


test_post_api_trips_tripid_caveats_submit_criterion()