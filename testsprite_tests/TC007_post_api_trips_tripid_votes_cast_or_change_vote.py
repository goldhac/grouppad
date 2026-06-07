import requests

BASE_URL = "http://localhost:3000"
TRIP_ID = "la-birthday-2026"
SESSION_COOKIE = "gp_session=QA_6a5db49d2880acb64eec"
TIMEOUT = 30

def test_post_api_trips_tripid_votes_cast_or_change_vote():
    headers_auth = {
        "Cookie": SESSION_COOKIE,
        "Content-Type": "application/json"
    }
    headers_no_auth = {
        "Content-Type": "application/json"
    }

    # Step 1: GET /api/trips/{tripId}/listings to get a listing ID
    listings_url = f"{BASE_URL}/api/trips/{TRIP_ID}/listings"
    resp_listings = requests.get(listings_url, timeout=TIMEOUT)
    assert resp_listings.status_code == 200, f"Expected 200, got {resp_listings.status_code}"
    body_listings = resp_listings.json()
    # listings endpoint returns an envelope: {"trip": {...}, "listings": [...]}
    assert isinstance(body_listings, dict), "Listings response is not an envelope object"
    listings = body_listings.get("listings")
    assert isinstance(listings, list), "'listings' is not a list"
    assert len(listings) > 0, "'listings' is empty"
    listing_id = listings[0].get("id")
    assert listing_id, "Listing ID is missing"

    vote_url = f"{BASE_URL}/api/trips/{TRIP_ID}/votes"
    # vote body contract: {"listing_id": <id>, "vote": "up"|"down"|null}
    payload_upvote = {
        "listing_id": listing_id,
        "vote": "up"
    }

    # Step 2: POST authenticated vote - returns the updated votes map {listing_id: {user_id: "up"}}
    resp_auth = requests.post(vote_url, json=payload_upvote, headers=headers_auth, timeout=TIMEOUT)
    assert resp_auth.status_code == 200, f"Authenticated vote POST expected 200, got {resp_auth.status_code}"
    body_auth = resp_auth.json()
    assert isinstance(body_auth, dict), "Authenticated vote response not a dict"
    assert listing_id in body_auth, "Voted listing not present in votes map"
    assert "up" in body_auth[listing_id].values(), "Up-vote not recorded in votes map"

    # Step 3: POST vote without authentication - expect 401
    resp_no_auth = requests.post(vote_url, json=payload_upvote, headers=headers_no_auth, timeout=TIMEOUT)
    assert resp_no_auth.status_code == 401, f"Unauthenticated vote POST expected 401, got {resp_no_auth.status_code}"

test_post_api_trips_tripid_votes_cast_or_change_vote()
