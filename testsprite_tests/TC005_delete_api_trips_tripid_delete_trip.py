import requests

BASE_URL = "http://localhost:3000"
COOKIE_HEADER = {"Cookie": "gp_session=QA_6a5db49d2880acb64eec"}
HEADERS_JSON = {"Content-Type": "application/json"}
TIMEOUT = 30

def test_delete_api_trips_tripid_delete_trip():
    # Step 1: Create a throwaway trip with auth cookie to obtain new tripId
    create_payload = {
        "name": "QA Throwaway",
        "destination": "Los Angeles",
        "checkin": "2026-09-01",
        "checkout_5n": "2026-09-06",
        "adults": 4,
        "budget": 3000
    }
    create_resp = requests.post(
        f"{BASE_URL}/api/trips",
        json=create_payload,
        headers={**COOKIE_HEADER, **HEADERS_JSON},
        timeout=TIMEOUT
    )
    assert create_resp.status_code == 200, f"Trip creation failed: {create_resp.text}"
    create_body = create_resp.json()
    assert isinstance(create_body, dict) and "id" in create_body
    trip_id = create_body["id"]

    try:
        # Step 2: DELETE the created trip with cookie (as organizer)
        del_resp = requests.delete(
            f"{BASE_URL}/api/trips/{trip_id}",
            headers=COOKIE_HEADER,
            timeout=TIMEOUT
        )
        assert del_resp.status_code == 200, f"Authorized delete failed: {del_resp.text}"
        del_body = del_resp.json()
        assert isinstance(del_body, dict) and del_body.get("ok") is True

        # Step 3: Verify that the trip is deleted by getting it and expecting 404
        get_resp_after_del = requests.get(
            f"{BASE_URL}/api/trips/{trip_id}",
            timeout=TIMEOUT
        )
        assert get_resp_after_del.status_code == 404

        # Step 4: Create another trip for negative auth test
        create_resp_2 = requests.post(
            f"{BASE_URL}/api/trips",
            json=create_payload,
            headers={**COOKIE_HEADER, **HEADERS_JSON},
            timeout=TIMEOUT
        )
        assert create_resp_2.status_code == 200, f"Second trip creation failed: {create_resp_2.text}"
        trip_id_2 = create_resp_2.json()["id"]

        # Step 5: DELETE the new trip WITHOUT auth cookie, expect 401
        del_resp_no_auth = requests.delete(
            f"{BASE_URL}/api/trips/{trip_id_2}",
            timeout=TIMEOUT
        )
        assert del_resp_no_auth.status_code == 401, (
            "Unauthorized delete did not return 401"
        )

    finally:
        # Cleanup: ensure the second trip is deleted with proper auth if it exists
        try:
            requests.delete(
                f"{BASE_URL}/api/trips/{trip_id_2}",
                headers=COOKIE_HEADER,
                timeout=TIMEOUT
            )
        except Exception:
            pass

test_delete_api_trips_tripid_delete_trip()