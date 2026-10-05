# =============================================================================
# kaggle_service.py
# =============================================================================
# Searches and downloads Kaggle datasets and competitions using the official
# Kaggle API client. Supports direct URL/slug lookups (e.g. owner/slug or
# https://www.kaggle.com/datasets/owner/slug) as well as general keyword search.
# =============================================================================

import os
import re
import glob
import zipfile


def _api():
    # Calling this raises kaggle.rest.ApiException or IOError if credentials
    # aren't configured. That exception is caught and logged.
    import kaggle
    kaggle.api.authenticate()
    return kaggle.api


def parse_kaggle_ref(query: str) -> dict | None:
    """
    Extracts dataset or competition reference from a URL or slug.
    Returns:
      {"type": "dataset", "owner": "...", "dataset": "...", "ref": "owner/slug"}
      or
      {"type": "competition", "ref": "slug", "slug": "slug"}
      or
      None if the query is a general keyword search.
    """
    q = query.strip()

    # 1. Full Dataset URL: https://www.kaggle.com/datasets/owner/dataset-slug
    m = re.search(r"kaggle\.com/datasets/([^/?#\s]+)/([^/?#\s]+)", q, re.IGNORECASE)
    if m:
        return {
            "type": "dataset",
            "owner": m.group(1),
            "dataset": m.group(2),
            "ref": f"{m.group(1)}/{m.group(2)}",
        }

    # 2. Full Competition URL: https://www.kaggle.com/competitions/slug or kaggle.com/c/slug
    m = re.search(r"kaggle\.com/(?:competitions|c)/([^/?#\s]+)", q, re.IGNORECASE)
    if m:
        return {
            "type": "competition",
            "ref": m.group(1),
            "slug": m.group(1),
        }

    # 3. Old Kaggle dataset URL: kaggle.com/owner/dataset-slug
    m = re.search(r"kaggle\.com/([^/?#\s]+)/([^/?#\s]+)", q, re.IGNORECASE)
    if m and m.group(1).lower() not in {
        "competitions", "c", "datasets", "discussions", "learn", "models", "code", "search", "account", "api"
    }:
        return {
            "type": "dataset",
            "owner": m.group(1),
            "dataset": m.group(2),
            "ref": f"{m.group(1)}/{m.group(2)}",
        }

    # 4. Competition slug: c/competition-slug
    m = re.match(r"^c/([a-zA-Z0-9_\-]+)$", q, re.IGNORECASE)
    if m:
        return {
            "type": "competition",
            "ref": m.group(1),
            "slug": m.group(1),
        }

    # 5. Raw dataset slug: owner/dataset-slug (e.g. zillow/zecon)
    m = re.match(r"^([a-zA-Z0-9_\-]+)/([a-zA-Z0-9_\-]+)$", q)
    if m and m.group(1).lower() not in {"http", "https", "c"}:
        return {
            "type": "dataset",
            "owner": m.group(1),
            "dataset": m.group(2),
            "ref": f"{m.group(1)}/{m.group(2)}",
        }

    return None


def _format_dataset(ds) -> dict:
    return {
        "ref": str(ds.ref),
        "title": str(ds.title),
        "size": str(getattr(ds, "size", "unknown")),
        "lastUpdated": str(getattr(ds, "lastUpdated", ""))[:10],
        "downloadCount": int(getattr(ds, "downloadCount", 0) or 0),
        "description": str(getattr(ds, "subtitle", "") or ""),
    }


def _format_competition(c) -> dict:
    ref = str(getattr(c, "ref", ""))
    return {
        "ref": f"c/{ref}",
        "title": str(getattr(c, "title", ref)),
        "size": "competition",
        "lastUpdated": str(getattr(c, "deadline", ""))[:10],
        "downloadCount": int(getattr(c, "teamCount", 0) or 0),
        "description": str(getattr(c, "description", "") or "Kaggle Competition Dataset"),
    }


# How the keyword search works (closer to what kaggle.com shows):
#   depth="deep"    → the user's exact words: 3 pages sorted by "hottest" (kaggle.com's
#                     default order) + the most-voted page + a CSV-only page to flag
#                     datasets that have tabular files the system can use
#   depth="shallow" → related/expanded words: 1 page sorted by "hottest" (keeps the
#                     multi-source search fast)
#   page=N          → just page N sorted by "hottest" ("Load more from Kaggle")
# Each result keeps its Kaggle rank so the page can show them in Kaggle's order.
KAGGLE_DEEP_PAGES = 3


def search_datasets(query: str, depth: str = "deep", page: int | None = None) -> list:
    try:
        api = _api()
    except Exception as e:
        print(f"[kaggle_service] Kaggle API auth/init failed: {e}")
        return []

    parsed = parse_kaggle_ref(query)

    # ── 1. Direct Slug / URL Lookup ──────────────────────────────────────────
    if parsed:
        if parsed["type"] == "dataset":
            owner = parsed["owner"]
            slug = parsed["dataset"]
            target_ref = parsed["ref"].lower()

            try:
                # Query with user filter
                user_matches = api.dataset_list(user=owner, search=slug)
                for ds in user_matches:
                    if str(ds.ref).lower() == target_ref:
                        return [_format_dataset(ds)]
            except Exception as e:
                print(f"[kaggle_service] Direct user search error: {e}")

            try:
                # Fallback search by slug
                slug_matches = api.dataset_list(search=slug)
                for ds in slug_matches:
                    if str(ds.ref).lower() == target_ref:
                        return [_format_dataset(ds)]
            except Exception as e:
                print(f"[kaggle_service] Direct slug search error: {e}")

            # Fallback: check if files can be listed directly for this ref
            try:
                files = api.dataset_list_files(parsed["ref"])
                if files is not None:
                    return [{
                        "ref": parsed["ref"],
                        "title": slug.replace("-", " ").replace("_", " ").title(),
                        "size": "unknown",
                        "lastUpdated": "",
                        "downloadCount": 1,
                        "description": f"Kaggle Dataset: {parsed['ref']}",
                    }]
            except Exception:
                pass

        elif parsed["type"] == "competition":
            slug = parsed["slug"].lower()
            try:
                comps = api.competitions_list(search=slug)
                for c in comps:
                    if str(getattr(c, "ref", "")).lower() == slug:
                        return [_format_competition(c)]
            except Exception as e:
                print(f"[kaggle_service] Competition lookup error: {e}")

    # ── 2. General Keyword Search ─────────────────────────────────────────────
    results: list[dict] = []
    seen_refs: set[str] = set()

    def _add(ds_list, limit=None):
        for ds in list(ds_list)[:limit] if limit else ds_list:
            ref = str(ds.ref)
            if ref not in seen_refs:
                seen_refs.add(ref)
                item = _format_dataset(ds)
                item["kaggleRank"] = len(results) + 1
                results.append(item)

    # A single extra page for "Load more from Kaggle"
    if page is not None:
        try:
            _add(api.dataset_list(search=query, sort_by="hottest", page=max(1, int(page))))
        except Exception as e:
            print(f"[kaggle_service] Dataset search page {page} error: {e}")
        return results

    pages = KAGGLE_DEEP_PAGES if depth == "deep" else 1
    for p in range(1, pages + 1):
        try:
            batch = list(api.dataset_list(search=query, sort_by="hottest", page=p))
            _add(batch)
            if len(batch) < 20:      # last page reached
                break
        except Exception as e:
            print(f"[kaggle_service] Dataset search (hottest p{p}) error: {e}")
            break

    if depth == "deep":
        # Most-voted datasets the hottest pages may have missed
        try:
            _add(api.dataset_list(search=query, sort_by="votes"), limit=20)
        except Exception as e:
            print(f"[kaggle_service] Dataset search (votes) error: {e}")

        # Mark datasets that contain CSV files (usable as tables by the system)
        csv_refs: set[str] = set()
        for p in (1, 2):
            try:
                csv_refs |= {str(ds.ref) for ds in api.dataset_list(search=query, sort_by="hottest", file_type="csv", page=p)}
            except Exception as e:
                print(f"[kaggle_service] CSV check error: {str(e).splitlines()[0]}")
                break
        for item in results:
            if item["ref"] in csv_refs:
                item["tabular"] = True

        # Competitions (e.g. "titanic", "house prices")
        try:
            for c in list(api.competitions_list(search=query))[:5]:
                c_ref = f"c/{getattr(c, 'ref', '')}"
                if c_ref not in seen_refs:
                    seen_refs.add(c_ref)
                    item = _format_competition(c)
                    item["kaggleRank"] = len(results) + 1
                    results.append(item)
        except Exception as e:
            # Needs the Kaggle account to have accepted competition rules — keep the log short
            print(f"[kaggle_service] Competition search skipped: {str(e).splitlines()[0]}")

    return results


def download_dataset(dataset_ref: str, download_path: str) -> str | None:
    try:
        api = _api()

        # Parse in case caller passed a full URL
        parsed = parse_kaggle_ref(dataset_ref)
        if parsed:
            if parsed["type"] == "dataset":
                dataset_ref = parsed["ref"]
            elif parsed["type"] == "competition":
                dataset_ref = f"c/{parsed['ref']}"

        is_competition = dataset_ref.startswith("c/") or dataset_ref.startswith("competition:")

        if is_competition:
            comp_name = dataset_ref.replace("competition:", "").replace("c/", "").strip()
            api.competition_download_files(comp_name, path=download_path)
        else:
            try:
                api.dataset_download_files(dataset_ref, path=download_path, unzip=True)
            except Exception as ds_err:
                # If ref had no slash, it might be a competition without "c/" prefix
                if "/" not in dataset_ref:
                    api.competition_download_files(dataset_ref, path=download_path)
                else:
                    raise ds_err

        # Extract any remaining .zip files in the download path
        for root, _, files in os.walk(download_path):
            for f in files:
                if f.endswith(".zip"):
                    zip_path = os.path.join(root, f)
                    try:
                        with zipfile.ZipFile(zip_path, "r") as zf:
                            zf.extractall(root)
                    except Exception as ze:
                        print(f"[kaggle_service] Zip extraction error for {f}: {ze}")

        csv_files = glob.glob(os.path.join(download_path, "**", "*.csv"), recursive=True)
        csv_files += glob.glob(os.path.join(download_path, "*.csv"))
        csv_files = list(set(csv_files))

        if csv_files:
            return max(csv_files, key=os.path.getsize)
        return None
    except Exception as e:
        print(f"[kaggle_service] Download error: {e}")
        return None
