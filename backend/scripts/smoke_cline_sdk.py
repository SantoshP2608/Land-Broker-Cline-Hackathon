"""Opt-in actual configured-model extraction against clean/inconsistent synthetic PDFs."""

import argparse
import json
from uuid import uuid4

from app.core.config import settings
from app.services.cline_extraction import ExtractionError, compare_document, extract_document
from app.services.documents import inspect_content, synthetic_pdf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--run-live",
        action="store_true",
        help="Explicitly allow two configured model requests (may cost credits).",
    )
    args = parser.parse_args()
    if not args.run_live:
        parser.error(
            "Use --run-live after configuring provider access. This script makes two real model requests."
        )
    sources = {"survey_number": "004", "area_sqm": "1200.00", "owner_subject_ref": "DEMO-SELLER-001"}
    summaries = []
    try:
        for name, area in [("clean", "1200.00"), ("inconsistent", "1400.00")]:
            raw = synthetic_pdf(
                f"Survey: 004\nArea sqm: {area}\nOwner subject: DEMO-SELLER-001\nSYNTHETIC DEMONSTRATION"
            )
            import hashlib

            doc = {
                "id": str(uuid4()),
                "version": 1,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "document_type": "LAND_RECORD",
                "pages": inspect_content(raw)["pages"],
            }
            extraction = extract_document(doc)
            comparisons = compare_document(doc, extraction, sources)
            results = {field: status for field, status, *_ in comparisons}
            summaries.append({"scenario": name, "statuses": results})
            if name == "clean" and set(results.values()) != {"MATCHES_SOURCE"}:
                raise ExtractionError("SDK_SMOKE_CLEAN_REQUIRES_REVIEW")
            if name == "inconsistent" and results["area_sqm"] != "DISCREPANCY":
                raise ExtractionError("SDK_SMOKE_MISMATCH_NOT_FOUND")
    except ExtractionError as exc:
        print(json.dumps({"passed": False, "error": exc.code, "scenarios": summaries}))
        raise SystemExit(1) from None
    print(
        json.dumps(
            {
                "passed": True,
                "provider_id": settings.cline_provider_id,
                "model_id": settings.cline_model_id,
                "scenarios": summaries,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
