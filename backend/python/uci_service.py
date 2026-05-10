import os
import requests
import pandas as pd

UCI_API = "https://archive.ics.uci.edu/api/datasets"


def search_datasets(query: str) -> list:
    try:
        resp = requests.get(UCI_API, params={"search": query, "num_results": 10}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        datasets = data.get("data", {}).get("datasets", []) or data.get("data", []) or []
        results = []
        for ds in datasets[:10]:
            results.append({
                "ref":           str(ds.get("id", "")),
                "title":         ds.get("name", "Unknown"),
                "size":          f"{ds.get('num_instances', '?')} rows",
                "lastUpdated":   "",
                "downloadCount": int(ds.get("num_hits", 0) or 0),
                "description":   (ds.get("abstract", "") or "")[:200],
            })
        return results
    except Exception as e:
        print(f"[uci_service] Search error: {e}")
        return []


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
