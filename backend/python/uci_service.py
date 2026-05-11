import os
import requests
import pandas as pd

UCI_API = "https://archive.ics.uci.edu/api/datasets"


def search_datasets(query: str) -> list:
    """
    Search UCI ML Repository. Tries the full query first, then individual keywords
    so multi-word queries like 'student academic performance' still find results.
    """
    STOP = {"with", "from", "that", "this", "have", "data", "dataset",
            "using", "based", "about", "into", "over", "some"}
    words = [w for w in query.lower().split() if len(w) > 3 and w not in STOP]
    queries_to_try = [query] + words[:2]  # full query, then top 2 keywords

    seen_ids: set[str] = set()
    results:  list[dict] = []

    for q in queries_to_try:
        try:
            resp = requests.get(UCI_API, params={"search": q, "num_results": 10}, timeout=12)
            if not resp.ok:
                continue
            data = resp.json()

            # Handle both response shapes the UCI API has used over time
            raw = (
                data.get("data", {}).get("datasets")
                or data.get("data")
                or data.get("datasets")
                or []
            )
            if not isinstance(raw, list):
                raw = []

            for ds in raw:
                did = str(ds.get("id", ds.get("ID", "")))
                if not did or did in seen_ids:
                    continue
                seen_ids.add(did)
                n_inst = ds.get("num_instances") or ds.get("NumInstances") or "?"
                results.append({
                    "ref":           did,
                    "title":         ds.get("name") or ds.get("Name") or "Unknown",
                    "size":          f"{n_inst} rows",
                    "lastUpdated":   "",
                    "downloadCount": int(ds.get("num_hits") or ds.get("NumHits") or 0),
                    "description":   (ds.get("abstract") or ds.get("Abstract") or "")[:200],
                })
                if len(results) >= 10:
                    break
        except Exception as e:
            print(f"[uci_service] Search error for '{q}': {e}")
            continue

        if len(results) >= 3:
            break  # Found enough, stop trying more keywords

    return results[:10]


def download_dataset(dataset_id: str, dest: str) -> str | None:
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
