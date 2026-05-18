# =============================================================================
# kaggle_service.py
# =============================================================================
# Searches and downloads Kaggle datasets using the official Kaggle API client.
#
# The kaggle library is only imported on first call via _api() — lazy import
# keeps the FastAPI startup time fast. PyTorch (ctgan dep) already adds a few
# seconds; no need to add more.
#
# Auth: the kaggle library reads KAGGLE_USERNAME and KAGGLE_KEY from env vars
# (or ~/.kaggle/kaggle.json). On HuggingFace Spaces, set those as Secrets.
# If the credentials aren't set, _api() will raise and both functions return
# an empty list / None — the search UI will just show no Kaggle results.
# =============================================================================

import os
import glob


def _api():
    # Calling this raises kaggle.rest.ApiException if the credentials are wrong.
    # That exception bubbles up to search_datasets / download_dataset where it's
    # caught and logged. The caller sees an empty result, not a 500.
    import kaggle
    kaggle.api.authenticate()
    return kaggle.api


def search_datasets(query: str) -> list:
    # dataset_list() returns a generator. We convert up to 10 results to dicts
    # matching the shape every other service uses so the frontend doesn't need
    # to know which source a result came from.
    api = _api()
    datasets = api.dataset_list(search=query)
    results = []
    for ds in list(datasets)[:10]:
        results.append({
            "ref": str(ds.ref),                                    # "owner/dataset-slug"
            "title": str(ds.title),
            "size": str(getattr(ds, "size", "unknown")),
            "lastUpdated": str(getattr(ds, "lastUpdated", "")),
            "downloadCount": int(getattr(ds, "downloadCount", 0)),
            "description": str(getattr(ds, "subtitle", "") or ""),
        })
    return results


def download_dataset(dataset_ref: str, download_path: str) -> str | None:
    # dataset_download_files unzips into download_path.
    # Some Kaggle datasets come with multiple CSVs (e.g. train.csv + test.csv).
    # We take the largest one — that's almost always the main data file.
    try:
        api = _api()
        api.dataset_download_files(dataset_ref, path=download_path, unzip=True)

        csv_files = glob.glob(os.path.join(download_path, "**", "*.csv"), recursive=True)
        csv_files += glob.glob(os.path.join(download_path, "*.csv"))

        if csv_files:
            return max(csv_files, key=os.path.getsize)
        return None
    except Exception as e:
        print(f"[kaggle_service] Download error: {e}")
        return None
