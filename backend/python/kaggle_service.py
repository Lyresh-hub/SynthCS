import os
import glob


def _api():
    """Return an authenticated Kaggle API instance (lazy import)."""
    import kaggle
    kaggle.api.authenticate()
    return kaggle.api


def search_datasets(query: str) -> list:
    """Search Kaggle for datasets matching the query, return top 10."""
    api = _api()
    datasets = api.dataset_list(search=query)
    results = []
    for ds in list(datasets)[:10]:
        results.append({
            "ref": str(ds.ref),
            "title": str(ds.title),
            "size": str(getattr(ds, "size", "unknown")),
            "lastUpdated": str(getattr(ds, "lastUpdated", "")),
            "downloadCount": int(getattr(ds, "downloadCount", 0)),
            "description": str(getattr(ds, "subtitle", "") or ""),
        })
    return results


def download_dataset(dataset_ref: str, download_path: str) -> str | None:
    """Download a Kaggle dataset and return the path to the largest CSV found."""
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
