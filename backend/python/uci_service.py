# =============================================================================
# uci_service.py
# =============================================================================
# Searches and downloads datasets from the UCI Machine Learning Repository.
#
# Search uses the REST API directly (not the Python SDK) because the SDK's
# list_datasets call is painfully slow — it fetches the entire catalog.
# We hit the /api/datasets/list endpoint with a search param instead.
#
# Fallback multi-word strategy: if "diabetes blood glucose" returns nothing,
# we retry with "diabetes" alone, then "blood", etc. Cuts through cases where
# UCI's search needs more specific terms than what the user typed.
# =============================================================================

import os
import requests
import pandas as pd

UCI_LIST_URL = "https://archive.ics.uci.edu/api/datasets/list"


def search_datasets(query: str) -> list:
    # Stop words — too generic to be useful as individual search terms.
    # "data" and "dataset" are especially noisy on a dataset repository.
    STOP = {"with", "from", "that", "this", "have", "data", "dataset",
            "using", "based", "about", "into", "over", "some"}
    words = [w for w in query.lower().split() if len(w) > 3 and w not in STOP]
    # Try the full query first, then individual significant words.
    # Stop after we have 3+ results — no need to burn more API calls.
    queries_to_try = [query] + words[:2]

    seen_ids: set[str] = set()
    results:  list[dict] = []

    for q in queries_to_try:
        try:
            resp = requests.get(
                UCI_LIST_URL,
                params={"filter": "python", "search": q},
                timeout=12,
            )
            if not resp.ok:
                continue
            data = resp.json()
            raw = data.get("data") or []
            if not isinstance(raw, list):
                continue

            for ds in raw:
                did = str(ds.get("id", ""))
                if not did or did in seen_ids:
                    continue
                seen_ids.add(did)
                results.append({
                    "ref":           did,
                    "title":         ds.get("name") or "UCI Dataset",
                    "size":          "unknown",
                    "lastUpdated":   "",
                    "downloadCount": 0,
                    "description":   "",
                })
                if len(results) >= 10:
                    break
        except Exception as e:
            print(f"[uci_service] Search error for '{q}': {e}")
            continue

        if len(results) >= 3:
            break

    return results[:10]


def download_dataset(dataset_id: str, dest: str) -> str | None:
    # ucimlrepo is the official UCI Python package. Lazy import keeps startup fast —
    # it's only needed when someone actually clicks "Download" on a UCI result.
    # fetch_ucirepo() returns features + targets separately, so we concat them.
    try:
        from ucimlrepo import fetch_ucirepo
        ds = fetch_ucirepo(id=int(dataset_id))
        features = ds.data.features
        targets  = ds.data.targets
        df = pd.concat([features, targets], axis=1) if targets is not None else features.copy()

        if len(df) > 20_000:
            df = df.sample(20_000, random_state=42).reset_index(drop=True)

        csv_path = os.path.join(dest, "dataset.csv")
        df.to_csv(csv_path, index=False)
        return csv_path
    except Exception as e:
        print(f"[uci_service] Download error: {e}")
        return None
