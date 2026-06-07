import requests

BASE_URL = "http://localhost:3000"
HEADERS_AUTH = {
    "Cookie": "gp_session=QA_6a5db49d2880acb64eec",
    "Content-Type": "application/json",
}
HEADERS_NO_AUTH = {
    "Content-Type": "application/json",
}
CREATE_TRIP_BODY = {
    "name": "QA Throwaway",
    "destination": "Los Angeles",
    "checkin": "2026-09-01",
    "checkout_5n": "2026-09-06",
    "adults": 4,
    "budget": 3000
}

def test_post_api_trips_tripid_join_trip():
    # Create a new trip with auth to get a new tripId
    trip_id = None
    try:
        resp_create = requests.post(
            f"{BASE_URL}/api/trips",
            headers=HEADERS_AUTH,
            json=CREATE_TRIP_BODY,
            timeout=30,
        )
        assert resp_create.status_code == 200, f"Expected 200 creating trip, got {resp_create.status_code}"
        create_body = resp_create.json()
        assert isinstance(create_body, dict), "Response body should be a dict on trip creation"
        assert "id" in create_body, "Response JSON must have 'id' key after trip creation"
        trip_id = create_body["id"]

        # JOIN the trip with auth headers
        resp_join_auth = requests.post(
            f"{BASE_URL}/api/trips/{trip_id}/join",
            headers=HEADERS_AUTH,
            json={},
            timeout=30,
        )
        assert resp_join_auth.status_code == 200, f"Expected 200 joining trip with auth, got {resp_join_auth.status_code}"
        join_body = resp_join_auth.json()
        # join returns the trip-view object for the joined trip, not { ok: true }
        assert isinstance(join_body, dict), "Join response body should be a dict"
        assert join_body.get("id") == trip_id, "Join response should return the joined trip view"

        # JOIN the trip without auth headers (cookie omitted)
        resp_join_no_auth = requests.post(
            f"{BASE_URL}/api/trips/{trip_id}/join",
            headers=HEADERS_NO_AUTH,
            json={},
            timeout=30,
        )
        assert resp_join_no_auth.status_code == 401, f"Expected 401 joining trip without auth, got {resp_join_no_auth.status_code}"
    finally:
        if trip_id:
            # Delete the created trip to clean up
            try:
                resp_delete = requests.delete(
                    f"{BASE_URL}/api/trips/{trip_id}",
                    headers=HEADERS_AUTH,
                    timeout=30,
                )
                assert resp_delete.status_code == 200, f"Expected 200 when deleting trip, got {resp_delete.status_code}"
                delete_body = resp_delete.json()
                assert delete_body.get("ok") == True, "Delete response must have { ok: true }"
            except Exception:
                # best effort cleanup, ignore exceptions here
                pass

test_post_api_trips_tripid_join_trip()
