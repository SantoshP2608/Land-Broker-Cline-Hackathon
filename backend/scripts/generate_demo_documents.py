"""Generate labelled synthetic upload samples, including a deliberate mismatch."""

from pathlib import Path

from app.services.documents import synthetic_pdf


def main():
    target = Path(__file__).resolve().parents[2] / ".demo-documents"
    target.mkdir(parents=True, exist_ok=True)
    for survey in ("001", "002", "003", "004"):
        folder = target / survey
        folder.mkdir(exist_ok=True)
        text = f"Survey: {survey}\nArea sqm: 1200.00\nOwner subject: DEMO-SELLER-001\nSIMULATED DEMONSTRATION"
        for name in ("previous_deed", "land_record", "encumbrance_certificate"):
            (folder / f"{name}.pdf").write_bytes(synthetic_pdf(text))
        (folder / "inconsistent_land_record.pdf").write_bytes(
            synthetic_pdf(text.replace("Area sqm: 1200.00", "Area sqm: 1400.00"))
        )
    (target / "synthetic_identity.pdf").write_bytes(
        synthetic_pdf(
            "SIMULATED IDENTITY EVIDENCE\nDisplay name: Synthetic Demo Citizen\nNOT A GOVERNMENT ID"
        )
    )
    print(f"Synthetic samples only: {target}")
    print(
        "Use survey 004 to create a new listing; inconsistent_land_record.pdf deliberately causes a discrepancy."
    )


if __name__ == "__main__":
    main()
