"""
PSA (Philippine Statistics Authority) dataset service.
Searches data.gov.ph filtered to the PSA organisation.
Falls back to a broader "PSA" keyword search if the org filter returns nothing.
Download logic is shared with datagov_ph_service.
"""

import requests
from datagov_ph_service import download_dataset  # reuse identical download logic

CKAN_BASE  = "https://data.gov.ph/api/3/action"
PSA_ORG    = "philippine-statistics-authority"
_CSV_FMTS  = {"CSV", "TEXT/CSV", "TEXT/COMMA-SEPARATED-VALUES"}


def _is_csv(resource: dict) -> bool:
    return resource.get("format", "").upper() in _CSV_FMTS


def _package_to_result(pkg: dict) -> dict:
    return {
        "ref":           pkg.get("id", ""),
        "title":         pkg.get("title", "Unknown"),
        "size":          f"{len(pkg.get('resources', []))} resource(s)",
        "lastUpdated":   (pkg.get("metadata_modified", "") or "")[:10],
        "downloadCount": 0,
        "description":   (pkg.get("notes", "") or "")[:200],
    }


def search_datasets(query: str) -> list:
    results: list[dict] = []

    # First pass: PSA organisation filter
    try:
        resp = requests.get(
            f"{CKAN_BASE}/package_search",
            params={
                "q":    query,
                "rows": 20,
                "fq":   f"organization:{PSA_ORG} AND res_format:CSV",
            },
            timeout=15,
        )
        resp.raise_for_status()
        for pkg in resp.json().get("result", {}).get("results", []):
            if any(_is_csv(r) for r in pkg.get("resources", [])):
                results.append(_package_to_result(pkg))
            if len(results) == 10:
                break
    except Exception as e:
        print(f"[psa_service] Org-filter search error: {e}")

    # Fallback: keyword search prefixed with "PSA"
    if not results:
        try:
            resp = requests.get(
                f"{CKAN_BASE}/package_search",
                params={"q": f"PSA {query}", "rows": 20, "fq": "res_format:CSV"},
                timeout=15,
            )
            resp.raise_for_status()
            for pkg in resp.json().get("result", {}).get("results", []):
                if any(_is_csv(r) for r in pkg.get("resources", [])):
                    results.append(_package_to_result(pkg))
                if len(results) == 10:
                    break
        except Exception as e:
            print(f"[psa_service] Fallback search error: {e}")

    return results
