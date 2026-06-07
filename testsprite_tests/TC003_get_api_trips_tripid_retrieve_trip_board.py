import requests

BASE_URL = "http://localhost:3000"
HEADERS_AUTH = {
    "Cookie": "gp_session=QA_6a5db49d2880acb64eec"
}
TIMEOUT = 30

def test_get_api_trips_tripid_retrieve_trip_board():
    existing_trip_id = "la-birthday-2026"
    unknown_trip_id = "nonexistent-trip-12345"
    url_existing = f"{BASE_URL}/api/trips/{existing_trip_id}"
    url_unknown = f"{BASE_URL}/api/trips/{unknown_trip_id}"

    # Test retrieving a public trip board by tripId for existing trip (no auth needed)
    try:
        resp = requests.get(url_existing, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected 200 for existing trip, got {resp.status_code}"
        trip_data = resp.json()
        assert isinstance(trip_data, dict), "Response for existing trip should be a dict"
        assert "id" in trip_data or "name" in trip_data, "Trip data should include key fields"
    except Exception as e:
        raise AssertionError(f"Failed to get existing trip board: {e}")

    # Test retrieving a public trip board by tripId for unknown trip (expect 404)
    try:
        resp = requests.get(url_unknown, timeout=TIMEOUT)
        assert resp.status_code == 404, f"Expected 404 for unknown trip, got {resp.status_code}"
    except Exception as e:
        raise AssertionError(f"Failed to get unknown trip board: {e}")

test_get_api_trips_tripid_retrieve_trip_board()