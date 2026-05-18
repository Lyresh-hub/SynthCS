# =============================================================================
# psa_service.py
# =============================================================================
# PSA = Philippine Statistics Authority.
# Their datasets live on data.gov.ph (same CKAN instance), just filed under
# the "philippine-statistics-authority" organization.
#
# Search strategy:
#   1. Filter by org + CSV format. If we get results, done.
#   2. If the org filter returns nothing (PSA uses weird dataset IDs sometimes),
#      fall back to a plain keyword search prefixed with "PSA".
#
# Download: 100% identical to datagov_ph — we just import and reuse it.
# =============================================================================

import requests
from datagov_ph_service import download_dataset  # reuse identical download logic

CKAN_BASE  = "https://data.gov.ph/api/3/action"
PSA_ORG    = "philippine-statistics-authority"
_CSV_FMTS  = {"CSV", "TEXT/CSV", "TEXT/COMMA-SEPARATED-VALUES"}


def _is_csv(resource: dict) -> bool:
    return resource.get("format", "").upper() in _CSV_FMTS


def _package_to_result(pkg: dict) -> dict:
    # Shared formatter — same shape as every other service so the frontend
    # doesn't need to know it came from PSA specifically.
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

    # First pass: filter by PSA organization slug. This is the clean path —
    # only returns datasets officially tagged to PSA.
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

    # Fallback: prefix the query with "PSA" and do a plain text search.
    # Catches datasets that weren't properly tagged to the org but have PSA
    # in the title or notes (common for older uploads).
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
