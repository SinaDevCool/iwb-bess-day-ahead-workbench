"""Actionable import errors, separate from domain validation and HTTP transport."""


class ForecastImportError(ValueError):
    def __init__(self, message: str, issues: list[dict]):
        super().__init__(message)
        self.issues = issues


def issue(code: str, field: str, message: str, row: int | None = None):
    return {"code": code, "field": field, "message": message, "row": row}
