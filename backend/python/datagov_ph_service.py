import os
import requests
import pandas as pd
import io

CKAN_BASE = "https://data.gov.ph/api/3/action"
_CSV_FORMATS = {"CSV", "TEXT/CSV", "TEXT/COMMA-SEPARATED-VALUES"}


def _is_csv(resource: dict) -> bool:
    return resource.get("format", "").upper() in _CSV_FORMATS


def search_datasets(query: str) -> list:
    try:
        resp = requests.get(
            f"{CKAN_BASE}/package_search",
            params={"q": query, "rows": 20, "fq": "res_format:CSV"},
            timeout=15,
        )
        resp.raise_for_status()
        packages = resp.json().get("result", {}).get("results", [])
        results = []
        for pkg in packages:
            if not any(_is_csv(r) for r in pkg.get("resources", [])):
                continue
            results.append({
                "ref":           pkg.get("id", ""),
                "title":         pkg.get("title", "Unknown"),
                "size":          f"{len(pkg.get('resources', []))} resource(s)",
                "lastUpdated":   (pkg.get("metadata_modified", "") or "")[:10],
                "downloadCount": 0,
                "description":   (pkg.get("notes", "") or "")[:200],
            })
            if len(results) == 10:
                break
        return results
    except Exception as e:
        print(f"[datagov_ph_service] Search error: {e}")
        return []


def download_dataset(dataset_id: str, dest: str) -> str | None:
    try:
        resp = requests.get(
            f"{CKAN_BASE}/package_show", params={"id": dataset_id}, timeout=15
        )
        resp.raise_for_status()
        pkg = resp.json().get("result", {})

        csv_resource = next(
            (r for r in pkg.get("resources", []) if _is_csv(r)), None
        )
        if not csv_resource:
            raise ValueError("No CSV resource found in this dataset")

        url = csv_resource.get("url", "")
        r = requests.get(url, timeout=60, stream=True)
        r.raise_for_status()

        # Read into pandas to validate and cap rows
        content = b"".join(r.iter_content(chunk_size=8192))
        df = pd.read_csv(io.BytesIO(content), low_memory=False)
        if len(df) > 20_000:
            df = df.sample(20_000, random_state=42).reset_index(drop=True)

        csv_path = os.path.join(dest, "dataset.csv")
        df.to_csv(csv_path, index=False)
        return csv_path
    except Exception as e:
        print(f"[datagov_ph_service] Download error: {e}")
        return None
