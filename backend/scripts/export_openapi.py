"""Export the app's actual schema for frontend contract generation (no DB writes)."""

import json
from pathlib import Path

from app.main import app

OUTPUT = Path(__file__).resolve().parents[2] / "contracts" / "openapi.json"


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
