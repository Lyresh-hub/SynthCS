import os
import pandas as pd


def search_datasets(query: str) -> list:
    try:
        import openml
        # Try exact name match first, then substring
        try:
            datasets = openml.datasets.list_datasets(
                output_format="dataframe", data_name=query
            )
        except Exception:
            datasets = pd.DataFrame()

        if datasets.empty:
            all_ds = openml.datasets.list_datasets(output_format="dataframe")
            datasets = all_ds[all_ds["name"].str.contains(query, case=False, na=False)]

        results = []
        for _, row in datasets.head(10).iterrows():
            n_inst  = int(row.get("NumberOfInstances", 0) or 0)
            n_feat  = int(row.get("NumberOfFeatures",  0) or 0)
            n_dl    = int(row.get("NumberOfDownloads", 0) or 0)
            results.append({
                "ref":           str(int(row.get("did", 0))),
                "title":         str(row.get("name", "Unknown")),
                "size":          f"{n_inst:,} rows",
                "lastUpdated":   "",
                "downloadCount": n_dl,
                "description":   f"{n_feat} features",
            })
        return results
    except Exception as e:
        print(f"[openml_service] Search error: {e}")
        return []


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
