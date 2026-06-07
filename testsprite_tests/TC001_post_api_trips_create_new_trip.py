import requests

def test_post_api_trips_create_new_trip():
    base_url = "http://localhost:3000"
    url = f"{base_url}/api/trips"
    headers_auth = {
        "Cookie": "gp_session=QA_6a5db49d2880acb64eec",
        "Content-Type": "application/json"
    }
    headers_no_auth = {
        "Content-Type": "application/json"
    }
    payload = {
        "name": "QA Throwaway",
        "destination": "Los Angeles",
        "checkin": "2026-09-01",
        "checkout_5n": "2026-09-06",
        "adults": 4,
        "budget": 3000
    }
    timeout = 30

    # Authenticated request: expect 200 with "id" in response
    try:
        resp_auth = requests.post(url, headers=headers_auth, json=payload, timeout=timeout)
        assert resp_auth.status_code == 200, f"Expected 200, got {resp_auth.status_code}"
        body_auth = resp_auth.json()
        assert isinstance(body_auth, dict), "Response body should be a dict"
        assert "id" in body_auth, "Response body must contain 'id'"
    except Exception as e:
        raise AssertionError(f"Authenticated POST request failed: {e}")

    # Unauthenticated request: expect 401
    try:
        resp_no_auth = requests.post(url, headers=headers_no_auth, json=payload, timeout=timeout)
        assert resp_no_auth.status_code == 401, f"Expected 401, got {resp_no_auth.status_code}"
    except Exception as e:
        raise AssertionError(f"Unauthenticated POST request failed: {e}")

test_post_api_trips_create_new_trip()