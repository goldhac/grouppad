import requests

BASE_URL = "http://localhost:3000"
TRIP_ID = "la-birthday-2026"
SUBMIT_ENDPOINT = f"/api/trips/{TRIP_ID}/submit"
AUTH_COOKIE = {"Cookie": "gp_session=QA_6a5db49d2880acb64eec"}
TIMEOUT = 30


def test_post_api_trips_tripid_submit_submit_home_url():
    url = BASE_URL + SUBMIT_ENDPOINT
    headers_auth = {"Cookie": "gp_session=QA_6a5db49d2880acb64eec"}
    headers_no_auth = {}

    payload = {
        "url": "https://example.com/sample-home"
    }

    # Test authenticated request: expect 200 with created Submission
    try:
        response = requests.post(url, json=payload, headers=headers_auth, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Authenticated request failed: {e}"

    assert response.status_code == 200, f"Expected 200 OK for authenticated request, got {response.status_code}"
    json_resp = response.json()
    # Expect the response to include the created Submission; at minimum, ensure url is echoed or an id exists
    assert isinstance(json_resp, dict), "Response JSON should be a dict"
    assert "url" in json_resp or "id" in json_resp, "Response should include 'url' or 'id' of created Submission"

    # Test unauthenticated request: expect 401 Unauthorized
    try:
        response_unauth = requests.post(url, json=payload, headers=headers_no_auth, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Unauthenticated request failed: {e}"

    assert response_unauth.status_code == 401, f"Expected 401 Unauthorized for unauthenticated request, got {response_unauth.status_code}"


test_post_api_trips_tripid_submit_submit_home_url()