import requests

BASE_URL = "http://localhost:3000"
SESSION_COOKIE = "gp_session=QA_6a5db49d2880acb64eec"
HEADERS_AUTH = {"Cookie": SESSION_COOKIE}
TIMEOUT = 30


def test_get_api_me_trips_list_user_trips():
    # Authenticated request: Expect 200 and body with "trips" list
    url = f"{BASE_URL}/api/me/trips"
    try:
        response = requests.get(url, headers=HEADERS_AUTH, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Authenticated GET /api/me/trips failed with exception: {e}"
    assert response.status_code == 200, f"Expected 200 OK when authenticated, got {response.status_code}"
    try:
        body = response.json()
    except ValueError as e:
        assert False, f"Response JSON decoding failed: {e}"
    assert isinstance(body, dict), "Response body is not a JSON object"
    assert "trips" in body, 'Response body missing "trips" key'
    assert isinstance(body["trips"], list), '"trips" is not a list'

    # Unauthenticated request: Expect 401 unauthorized
    try:
        response_no_auth = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Unauthenticated GET /api/me/trips failed with exception: {e}"
    assert response_no_auth.status_code == 401, f"Expected 401 unauthorized without cookie, got {response_no_auth.status_code}"


test_get_api_me_trips_list_user_trips()