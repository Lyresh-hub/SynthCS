# =============================================================================
# huggingface_service.py
# =============================================================================
# Searches and downloads tabular datasets from HuggingFace Hub.
#
# HF Hub has a lot of non-tabular datasets (text, images, audio). The search
# is keyword-based and returns whatever HF thinks is relevant — you'll get
# some good matches and some garbage. The user picks what they want.
#
# Download gotcha: HF datasets often have columns with bytes (image tensors),
# lists (token arrays), or dicts. CTGAN/pandas can't handle those. We drop
# them after converting to a DataFrame.
# =============================================================================

import os
import pandas as pd


def search_datasets(query: str) -> list:
    # HfApi is the official HuggingFace Python library. No API key needed for
    # public dataset search. list_datasets() returns an iterator — we cap at 20
    # on the HF side, then trim to 10 in our loop.
    from huggingface_hub import HfApi
    api = HfApi()
    try:
        raw = list(api.list_datasets(search=query, limit=20))
    except Exception as e:
        print(f"[huggingface_service] Search error: {e}")
        return []

    results = []
    for ds in raw:
        # ds.id is "owner/dataset-name". We prettify the name portion for display.
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
    # load_dataset() from the `datasets` library does the actual download.
    # HF datasets have "splits" (train/test/validation). We try to get the
    # split names first so we can pick the first available one. Falls back to
    # "train" if get_dataset_split_names() fails.
    from datasets import load_dataset, get_dataset_split_names
    try:
        split = "train"
        try:
            splits = get_dataset_split_names(dataset_ref)
            if splits:
                split = splits[0]
        except Exception:
            pass

        ds = load_dataset(dataset_ref, split=split)
        df: pd.DataFrame = ds.to_pandas()

        # HF tabular datasets sometimes include raw bytes (image data), lists
        # (tokenized text), or dicts (nested objects). Those can't be serialised
        # to CSV or fed to CTGAN, so we drop them. What's left should be numeric
        # and string columns — the useful stuff.
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
