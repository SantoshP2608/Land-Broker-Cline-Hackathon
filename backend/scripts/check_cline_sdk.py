"""Non-secret SDK readiness probe: actual package import, no model request."""

import json

from app.services.cline_extraction import ExtractionError, invoke_sdk


def main():
    try:
        result = invoke_sdk(check=True)
    except ExtractionError as exc:
        print(json.dumps({"ready": False, "error": exc.code}))
        raise SystemExit(1) from None
    print(json.dumps(result, indent=2))
    if not result.get("ready"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
