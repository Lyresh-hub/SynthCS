import os
import pandas as pd


def search_datasets(query: str) -> list:
    from huggingface_hub import HfApi
    api = HfApi()
    try:
        raw = list(api.list_datasets(search=query, limit=20))
    except Exception as e:
        print(f"[huggingface_service] Search error: {e}")
        return []

    results = []
    for ds in raw:
        results.append({
            "ref":           ds.id,
            "title":         ds.id.split("/")[-1].replace("-", " ").replace("_", " ").title(),
            "size":          "unknown",
            "lastUpdated":   str(getattr(ds, "lastModified", ""))[:10],
            "downloadCount": int(getattr(ds, "downloads", 0) or 0),
            "description":   "",
        })
        if len(results) == 10:
            break
    return results


def download_dataset(dataset_ref: str, dest: str) -> str | None:
    from datasets import load_dataset
    try:
        ds = load_dataset(dataset_ref, split="train", trust_remote_code=True)
        df: pd.DataFrame = ds.to_pandas()

        # Drop columns that are entirely bytes / objects that can't be serialised
        df = df.select_dtypes(exclude=["object"]).join(
            df.select_dtypes(include=["object"]).apply(
                lambda col: col.where(col.map(lambda v: not isinstance(v, (bytes, list, dict))), other=None)
            )
        )

        if len(df) > 20_000:
            df = df.sample(20_000, random_state=42).reset_index(drop=True)

        csv_path = os.path.join(dest, "dataset.csv")
        df.to_csv(csv_path, index=False)
        return csv_path
    except Exception as e:
        print(f"[huggingface_service] Download error: {e}")
        return None
