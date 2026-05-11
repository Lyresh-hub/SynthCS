import os
import requests
import pandas as pd


def search_datasets(query: str) -> list:
    """
    Search OpenML via its REST API directly (avoids the slow SDK list_datasets call).
    Tries each significant word in the query so multi-word prompts get results.
    """
    seen_ids: set[str] = set()
    results:  list[dict] = []

    # Extract significant words (skip short/generic ones)
    STOP = {"with", "from", "that", "this", "have", "data", "dataset",
            "using", "based", "about", "into", "over", "some"}
    words = [w for w in query.lower().split() if len(w) > 3 and w not in STOP]
    if not words:
        words = query.split()[:1]

    for word in words[:3]:
        try:
            url = f"https://www.openml.org/api/v1/json/data/list/data_name/{word}/limit/10/status/active"
            resp = requests.get(url, timeout=8)
            if not resp.ok:
                continue
            data = resp.json()
            datasets = data.get("data", {}).get("dataset", [])
            if not isinstance(datasets, list):
                continue
            for ds in datasets:
                did = str(ds.get("did", ""))
                if not did or did in seen_ids:
                    continue
                seen_ids.add(did)
                qual = {q["name"]: q.get("value", 0) for q in ds.get("quality", [])} if "quality" in ds else {}
                n_inst = int(float(qual.get("NumberOfInstances", 0) or 0))
                n_feat = int(float(qual.get("NumberOfFeatures",  0) or 0))
                n_dl   = int(float(qual.get("NumberOfDownloads", 0) or 0))
                results.append({
                    "ref":           did,
                    "title":         str(ds.get("name", "Unknown")),
                    "size":          f"{n_inst:,} rows" if n_inst else "unknown",
                    "lastUpdated":   "",
                    "downloadCount": n_dl,
                    "description":   f"{n_feat} features" if n_feat else "",
                })
                if len(results) >= 10:
                    break
        except Exception as e:
            print(f"[openml_service] Search error for word '{word}': {e}")
            continue

        if len(results) >= 5:
            break

    return results[:10]


def download_dataset(dataset_id: str, dest: str) -> str | None:
    try:
        import openml
        dataset = openml.datasets.get_dataset(
            int(dataset_id),
            download_data=True,
            download_qualities=False,
            download_features_meta_data=False,
        )
        X, y, _, _ = dataset.get_data(dataset_format="dataframe")
        df = X.copy()
        if y is not None:
            df["target"] = y

        if len(df) > 20_000:
            df = df.sample(20_000, random_state=42).reset_index(drop=True)

        csv_path = os.path.join(dest, "dataset.csv")
        df.to_csv(csv_path, index=False)
        return csv_path
    except Exception as e:
        print(f"[openml_service] Download error: {e}")
        return None
